/**
 * Sync Service — Supabase push/pull, conflict detection, and optimistic updates.
 *
 * Responsibilities:
 * - Push dirty records to Supabase (upsert with RLS error handling)
 * - Pull latest remote state from all user tables
 * - Resolve conflicts via last-write-wins (by updated_at), archive loser to conflicts table
 * - Export all user data as JSON within 30s
 * - Auto-retry on network recovery (online event)
 * - Emit sync:success / sync:error via EventBus
 * - Never discard user input on error — preserve dirty state
 */

import { supabase, supabaseConfigured, getCurrentUser } from './supabase-client.js';
import { OfflineCache } from './offline-cache.js';
import { EventBus, EVENTS } from '../core/event-bus.js';

/** Tables that are synced to/from Supabase */
const SYNCED_TABLES = [
  'daily_records',
  'study_tasks',
  'review_items',
  'topic_progress',
  'mock_scores',
  'resources',
  'source_registry',
  'calibration_snapshots',
  'project_showcase_items',
];

/**
 * Push dirty records to Supabase via upsert.
 * On RLS rejection or network error, preserves dirty state and emits sync:error.
 *
 * @param {Array<{table: string, id: string, record: Object, timestamp: string}>} dirtyRecords
 * @returns {Promise<{success: boolean, synced: string[], failed: string[], error?: string}>}
 */
export async function pushDirtyRecords(dirtyRecords) {
  if (!supabaseConfigured || !supabase) {
    return { success: false, synced: [], failed: [], error: 'Supabase not configured' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, synced: [], failed: [], error: 'Not authenticated' };
  }

  const synced = [];
  const failed = [];
  let lastError = null;

  // Group records by table for batched upserts
  const byTable = {};
  for (const entry of dirtyRecords) {
    if (!byTable[entry.table]) byTable[entry.table] = [];
    byTable[entry.table].push(entry);
  }

  for (const [table, entries] of Object.entries(byTable)) {
    const rows = entries.map((entry) => ({
      ...entry.record,
      user_id: user.id,
    }));

    try {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: getConflictKey(table) });

      if (error) {
        lastError = error;
        // Check if it's an RLS rejection (code 42501 in PostgreSQL)
        if (isRLSError(error)) {
          for (const entry of entries) {
            failed.push(`${entry.table}:${entry.id}`);
          }
        } else {
          for (const entry of entries) {
            failed.push(`${entry.table}:${entry.id}`);
          }
        }
      } else {
        for (const entry of entries) {
          synced.push(`${entry.table}:${entry.id}`);
        }
      }
    } catch (err) {
      lastError = err;
      for (const entry of entries) {
        failed.push(`${entry.table}:${entry.id}`);
      }
    }
  }

  // Clear dirty flags only for successfully synced records
  if (synced.length > 0) {
    OfflineCache.clearDirty(synced);
  }

  const allSucceeded = failed.length === 0 && synced.length > 0;

  if (allSucceeded) {
    // Update profiles.last_synced_at
    await updateLastSyncedAt(user.id);
    EventBus.emit(EVENTS.SYNC_SUCCESS, { synced, timestamp: new Date().toISOString() });
  } else if (lastError) {
    // Preserve dirty state — do NOT clear failed records
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error: lastError.message || String(lastError),
      code: lastError.code || 'UNKNOWN',
      failed,
    });
  }

  return {
    success: allSucceeded,
    synced,
    failed,
    error: lastError ? (lastError.message || String(lastError)) : undefined,
  };
}

/**
 * Pull the latest remote state from all user tables.
 *
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function pullRemoteState() {
  if (!supabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const results = await Promise.all(
      SYNCED_TABLES.map((table) =>
        supabase
          .from(table)
          .select('*')
          .eq('user_id', user.id)
          .then((res) => ({ table, data: res.data, error: res.error }))
      )
    );

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      const firstError = errors[0].error;
      EventBus.emit(EVENTS.SYNC_ERROR, {
        error: firstError.message || String(firstError),
        code: firstError.code || 'UNKNOWN',
        context: 'pull',
      });
      return { success: false, error: firstError.message || String(firstError) };
    }

    const data = {};
    for (const result of results) {
      data[result.table] = result.data || [];
    }

    return { success: true, data };
  } catch (err) {
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error: err.message || String(err),
      code: 'NETWORK_ERROR',
      context: 'pull',
    });
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Resolve a conflict between local and remote versions of the same record.
 * Uses last-write-wins strategy based on updated_at timestamps.
 * The losing version is archived to the conflicts table.
 *
 * @param {Object} local - Local record (must have updated_at field)
 * @param {Object} remote - Remote record (must have updated_at field)
 * @returns {{ winner: Object, loser: Object }}
 */
export function resolveConflict(local, remote) {
  const localTime = new Date(local.updated_at).getTime();
  const remoteTime = new Date(remote.updated_at).getTime();

  // Last-write-wins: the record with the later updated_at is the winner
  // On tie, prefer remote (server authority)
  if (localTime > remoteTime) {
    return { winner: local, loser: remote };
  }
  return { winner: remote, loser: local };
}

/**
 * Archive a conflict resolution result to the conflicts table.
 *
 * @param {string} tableName - The source table name
 * @param {string} recordId - The record identifier
 * @param {Object} winner - The winning record
 * @param {Object} loser - The losing record
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function archiveConflict(tableName, recordId, winner, loser) {
  if (!supabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const { error } = await supabase.from('conflicts').insert({
      user_id: user.id,
      table_name: tableName,
      record_id: recordId,
      loser_payload: loser,
      winner_payload: winner,
      resolved_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Export all user data as JSON. Must complete within 30 seconds.
 *
 * @param {string} userId - The user ID to export data for
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function exportAllData(userId) {
  if (!supabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const TIMEOUT_MS = 30000;

  const exportPromise = (async () => {
    const results = await Promise.all(
      SYNCED_TABLES.map((table) =>
        supabase
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .then((res) => ({ table, data: res.data, error: res.error }))
      )
    );

    // Also fetch profile
    const profileResult = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      throw new Error(errors[0].error.message || 'Export fetch failed');
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      profile: profileResult.data || null,
    };

    for (const result of results) {
      exportData[result.table] = result.data || [];
    }

    return exportData;
  })();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Export timed out (30s limit)')), TIMEOUT_MS)
  );

  try {
    const data = await Promise.race([exportPromise, timeoutPromise]);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Perform a full sync cycle: push dirty records, then pull remote state.
 * Emits sync:success or sync:error accordingly.
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function syncAll() {
  const dirtyRecords = OfflineCache.getDirtyRecords();

  if (dirtyRecords.length > 0) {
    const pushResult = await pushDirtyRecords(dirtyRecords);
    if (!pushResult.success && pushResult.failed.length > 0) {
      // Partial failure — dirty state preserved, error already emitted
      return { success: false, error: pushResult.error };
    }
  }

  const pullResult = await pullRemoteState();
  if (!pullResult.success) {
    return { success: false, error: pullResult.error };
  }

  return { success: true };
}

/**
 * Initialize the sync service: listen for online events to auto-retry sync.
 */
export function initSyncService() {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }
}

/**
 * Tear down the sync service listeners.
 */
export function destroySyncService() {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
  }
}

// --- Internal helpers ---

/**
 * Handle the browser 'online' event by auto-retrying sync.
 */
async function handleOnline() {
  const dirtyRecords = OfflineCache.getDirtyRecords();
  if (dirtyRecords.length > 0) {
    await pushDirtyRecords(dirtyRecords);
  }
}

/**
 * Update profiles.last_synced_at for the given user.
 * @param {string} userId
 */
async function updateLastSyncedAt(userId) {
  if (!supabase) return;
  try {
    await supabase
      .from('profiles')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch {
    // Non-critical — don't fail the sync for this
  }
}

/**
 * Determine the upsert conflict key for a given table.
 * @param {string} table
 * @returns {string}
 */
function getConflictKey(table) {
  const conflictKeys = {
    daily_records: 'user_id,study_date',
    study_tasks: 'id',
    review_items: 'id',
    topic_progress: 'user_id,topic_id',
    mock_scores: 'id',
    resources: 'user_id,resource_key',
    source_registry: 'claim_id',
    calibration_snapshots: 'id',
    project_showcase_items: 'id',
  };
  return conflictKeys[table] || 'id';
}

/**
 * Check if a Supabase error is an RLS (Row Level Security) rejection.
 * @param {Object} error
 * @returns {boolean}
 */
function isRLSError(error) {
  // PostgreSQL insufficient_privilege error code
  return error.code === '42501' || (error.message && error.message.includes('row-level security'));
}

/**
 * Migration sync service. Tested, but not reachable from `src/main.js`.
 * Production sync is `supabase-sync.js`. Do not start both.
 *
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
import { getSyncConflictKey, SYNCED_TABLES } from './sync-contract.js';

const SYNCED_TABLE_SET = new Set(SYNCED_TABLES);
let onlineListenerAttached = false;

/**
 * Push dirty records to Supabase via upsert.
 * On RLS rejection or network error, preserves dirty state and emits sync:error.
 *
 * @param {Array<{table: string, id: string, record: Object, timestamp: string}>} dirtyRecords
 * @returns {Promise<{success: boolean, synced: string[], failed: string[], localSaved: boolean, error?: string}>}
 */
export async function pushDirtyRecords(dirtyRecords) {
  const { validRecords, invalidKeys } = normalizeDirtyRecords(dirtyRecords);

  if (validRecords.length === 0) {
    if (invalidKeys.length > 0) {
      const error = 'Invalid dirty records skipped';
      EventBus.emit(EVENTS.SYNC_ERROR, {
        error,
        code: 'INVALID_DIRTY_RECORDS',
        failed: invalidKeys,
      });
      return { success: false, synced: [], failed: invalidKeys, localSaved: true, error };
    }
    return { success: true, synced: [], failed: [], localSaved: true };
  }

  if (!supabaseConfigured || !supabase) {
    const error = 'Supabase not configured';
    const failed = formatFailedDirtyRecords(validRecords, invalidKeys);
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error,
      code: 'SUPABASE_NOT_CONFIGURED',
      failed,
    });
    return { success: false, synced: [], failed, localSaved: true, error };
  }

  const user = await getCurrentUserSafely();
  if (!user) {
    const error = 'Not authenticated';
    const failed = formatFailedDirtyRecords(validRecords, invalidKeys);
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error,
      code: 'NOT_AUTHENTICATED',
      failed,
    });
    return { success: false, synced: [], failed, localSaved: true, error };
  }

  const synced = [];
  const failed = [...invalidKeys];
  let lastError = invalidKeys.length > 0
    ? { message: 'Invalid dirty records skipped', code: 'INVALID_DIRTY_RECORDS' }
    : null;
  let localSaved = true;

  // Group records by table for batched upserts
  const byTable = {};
  for (const entry of validRecords) {
    if (!byTable[entry.table]) byTable[entry.table] = [];
    byTable[entry.table].push(entry);
  }

  for (const [table, entries] of Object.entries(byTable)) {
    const rows = entries.map((entry) => ({
      ...entry.record,
      user_id: user.id,
    }));

    try {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: getSyncConflictKey(table) });

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
    localSaved = OfflineCache.clearDirty(synced);
  }

  const allSucceeded = failed.length === 0 && synced.length > 0;

  if (allSucceeded) {
    // Update profiles.last_synced_at
    await updateLastSyncedAt(user.id);
    EventBus.emit(EVENTS.SYNC_SUCCESS, { synced, localSaved, timestamp: new Date().toISOString() });
  } else if (lastError) {
    // Preserve dirty state — do NOT clear failed records
    const error = errorMessage(lastError);
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error,
      code: errorCode(lastError),
      failed,
    });
  }

  return {
    success: allSucceeded,
    synced,
    failed,
    localSaved,
    error: lastError ? errorMessage(lastError) : undefined,
  };
}

/**
 * Pull the latest remote state from all user tables.
 *
 * @returns {Promise<{success: boolean, data?: Object, error?: string, failed?: string[]}>}
 */
export async function pullRemoteState() {
  if (!supabaseConfigured || !supabase) {
    const error = 'Supabase not configured';
    const failed = [...SYNCED_TABLES];
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error,
      code: 'SUPABASE_NOT_CONFIGURED',
      context: 'pull',
      failed,
    });
    return { success: false, error, failed };
  }

  const user = await getCurrentUserSafely();
  if (!user) {
    const error = 'Not authenticated';
    const failed = [...SYNCED_TABLES];
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error,
      code: 'NOT_AUTHENTICATED',
      context: 'pull',
      failed,
    });
    return { success: false, error, failed };
  }

  try {
    const results = await Promise.all(
      SYNCED_TABLES.map(async (table) => {
        try {
          const res = await supabase
            .from(table)
            .select('*')
            .eq('user_id', user.id);
          return { table, data: res.data, error: res.error };
        } catch (error) {
          return { table, data: [], error };
        }
      })
    );

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      const firstError = errors[0].error;
      const error = errorMessage(firstError);
      const failed = errors.map((result) => result.table);
      EventBus.emit(EVENTS.SYNC_ERROR, {
        error,
        code: errorCode(firstError),
        context: 'pull',
        failed,
      });
      return { success: false, error, failed };
    }

    const data = {};
    for (const result of results) {
      data[result.table] = normalizeRemoteRows(result.data);
    }

    return { success: true, data };
  } catch (err) {
    const error = errorMessage(err);
    EventBus.emit(EVENTS.SYNC_ERROR, {
      error,
      code: 'NETWORK_ERROR',
      context: 'pull',
    });
    return { success: false, error };
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
  const localTime = parseRecordTime(local?.updated_at);
  const remoteTime = parseRecordTime(remote?.updated_at);

  // Last-write-wins: the record with the later updated_at is the winner
  // On tie, prefer remote (server authority)
  if (localTime !== null && (remoteTime === null || localTime > remoteTime)) {
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
  const table = normalizeTable(tableName);
  const id = normalizeId(recordId);
  const winnerPayload = cloneRecordForSync(winner);
  const loserPayload = cloneRecordForSync(loser);

  if (!isValidTable(table) || !isValidId(id) || !winnerPayload || !loserPayload) {
    return { success: false, error: 'Invalid conflict record' };
  }

  if (!supabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const user = await getCurrentUserSafely();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const { error } = await supabase.from('conflicts').insert({
      user_id: user.id,
      table_name: table,
      record_id: id,
      loser_payload: loserPayload,
      winner_payload: winnerPayload,
      resolved_at: new Date().toISOString(),
    });

    if (error) {
      return { success: false, error: errorMessage(error) };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

/**
 * Export all user data as JSON. Must complete within 30 seconds.
 *
 * @param {string} userId - The user ID to export data for
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function exportAllData(userId) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    return { success: false, error: 'User ID is required' };
  }

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
          .eq('user_id', normalizedUserId)
          .then((res) => ({ table, data: res.data, error: res.error }))
      )
    );

    // Also fetch profile
    const profileResult = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', normalizedUserId)
      .maybeSingle();

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      throw new Error(errorMessage(errors[0].error, 'Export fetch failed'));
    }
    if (profileResult.error) {
      throw new Error(errorMessage(profileResult.error, 'Profile export failed'));
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user_id: normalizedUserId,
      profile: profileResult.data || null,
    };

    for (const result of results) {
      exportData[result.table] = result.data || [];
    }

    return exportData;
  })();

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Export timed out (30s limit)')), TIMEOUT_MS);
  });

  try {
    const data = await Promise.race([exportPromise, timeoutPromise]);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Perform a full sync cycle: push dirty records, then pull remote state.
 * Emits sync:success or sync:error accordingly.
 *
 * @returns {Promise<{success: boolean, localSaved?: boolean, error?: string}>}
 */
export async function syncAll() {
  const dirtyRecords = OfflineCache.getDirtyRecords();
  let localSaved = true;

  if (dirtyRecords.length > 0) {
    const pushResult = await pushDirtyRecords(dirtyRecords);
    localSaved = pushResult.localSaved !== false;
    if (!pushResult.success) {
      // Push failure — dirty state preserved, error already emitted
      return { success: false, localSaved, error: pushResult.error };
    }
  }

  const pullResult = await pullRemoteState();
  if (!pullResult.success) {
    return { success: false, localSaved, error: pullResult.error };
  }

  return { success: true, localSaved };
}

/**
 * Initialize the sync service: listen for online events to auto-retry sync.
 * @returns {boolean} Whether a new listener was attached
 */
export function initSyncService() {
  if (typeof window === 'undefined' || onlineListenerAttached) return false;
  window.addEventListener('online', handleOnline);
  onlineListenerAttached = true;
  return true;
}

/**
 * Tear down the sync service listeners.
 * @returns {boolean} Whether an existing listener was removed
 */
export function destroySyncService() {
  if (typeof window === 'undefined' || !onlineListenerAttached) return false;
  window.removeEventListener('online', handleOnline);
  onlineListenerAttached = false;
  return true;
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
 * Check if a Supabase error is an RLS (Row Level Security) rejection.
 * @param {Object} error
 * @returns {boolean}
 */
function isRLSError(error) {
  // PostgreSQL insufficient_privilege error code
  return errorCode(error, '') === '42501' || safeScalarText(error?.message).includes('row-level security');
}

function parseRecordTime(value) {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return null;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

async function getCurrentUserSafely() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

function normalizeDirtyRecords(dirtyRecords) {
  const validRecords = [];
  const invalidKeys = [];

  if (!Array.isArray(dirtyRecords)) {
    return { validRecords, invalidKeys: ['invalid_table:invalid_id'] };
  }

  for (const entry of dirtyRecords) {
    const normalized = normalizeDirtyRecord(entry);
    if (normalized) {
      validRecords.push(normalized);
    } else {
      invalidKeys.push(formatDirtyKey(entry));
    }
  }

  return { validRecords, invalidKeys };
}

function formatFailedDirtyRecords(validRecords, invalidKeys = []) {
  return [...validRecords.map(formatDirtyKey), ...invalidKeys];
}

function normalizeRemoteRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(cloneRecordForSync).filter(Boolean);
}

function normalizeDirtyRecord(entry) {
  if (!isPlainObject(entry)) return null;

  const table = normalizeTable(entry.table);
  const id = normalizeId(entry.id);
  const record = cloneRecordForSync(entry.record);
  if (!isValidTable(table) || !isValidId(id) || !record) return null;

  return { ...entry, table, id, record };
}

function isValidTable(table) {
  return SYNCED_TABLE_SET.has(normalizeTable(table));
}

function isValidId(id) {
  return normalizeId(id) !== '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeScalarText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function errorMessage(error, fallback = 'Sync failed') {
  if (error instanceof Error) return safeScalarText(error.message, fallback);
  if (isPlainObject(error)) return safeScalarText(error.message, fallback);
  return safeScalarText(error, fallback);
}

function errorCode(error, fallback = 'UNKNOWN') {
  return isPlainObject(error) ? safeScalarText(error.code, fallback) : fallback;
}

function cloneRecordForSync(record) {
  if (!isPlainObject(record)) return null;

  try {
    const serialized = JSON.stringify(record);
    if (serialized === undefined) return null;
    const cloned = JSON.parse(serialized);
    return isPlainObject(cloned) ? cloned : null;
  } catch {
    return null;
  }
}

function normalizeTable(table) {
  return typeof table === 'string' ? table.trim() : '';
}

function normalizeId(id) {
  return typeof id === 'string' ? id.trim() : '';
}

function formatDirtyKey(entry) {
  if (!isPlainObject(entry)) return 'invalid_table:invalid_id';

  const table = normalizeTable(entry.table) !== ''
    ? normalizeTable(entry.table)
    : 'invalid_table';
  const id = normalizeId(entry.id) !== ''
    ? normalizeId(entry.id)
    : 'invalid_id';

  return `${table}:${id}`;
}

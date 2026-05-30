/**
 * Offline Cache — localStorage wrapper with per-table dirty flags and queue management.
 *
 * Provides structured dirty-tracking at the record level, enabling offline-first
 * sync patterns. Integrates with state-manager for consistent local state.
 *
 * Pure infrastructure — no DOM interaction, no Supabase calls.
 */

const CACHE_KEY = 'pku_swm_420_dashboard_v3';
const DIRTY_QUEUE_KEY = 'pku_swm_420_dirty_queue';

/** Tables tracked by the offline cache */
const TRACKED_TABLES = [
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
 * Load the full cache object from localStorage.
 * @returns {Object}
 */
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist the full cache object to localStorage.
 * @param {Object} cache
 */
function saveCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

/**
 * Load the dirty queue from localStorage.
 * Structure: Array of { table, id, record, timestamp }
 * @returns {Array}
 */
function loadDirtyQueue() {
  try {
    const raw = localStorage.getItem(DIRTY_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist the dirty queue to localStorage.
 * @param {Array} queue
 */
function saveDirtyQueue(queue) {
  localStorage.setItem(DIRTY_QUEUE_KEY, JSON.stringify(queue));
}

export const OfflineCache = {
  /**
   * Mark a record as dirty (needing sync). Stores the record data
   * in the dirty queue and updates the local table state.
   *
   * If a record with the same table+id already exists in the queue,
   * it is replaced with the newer version.
   *
   * @param {string} table - Table name (must be one of TRACKED_TABLES)
   * @param {string} id - Record identifier
   * @param {Object} record - Full record data to sync
   */
  setDirty(table, id, record) {
    if (!table || !id) return;

    // Update local table state
    const cache = loadCache();
    if (!cache[table]) {
      cache[table] = {};
    }
    cache[table][id] = record;
    saveCache(cache);

    // Update dirty queue — replace existing entry for same table+id
    const queue = loadDirtyQueue();
    const existingIndex = queue.findIndex(
      (entry) => entry.table === table && entry.id === id
    );

    const entry = {
      table,
      id,
      record,
      timestamp: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = entry;
    } else {
      queue.push(entry);
    }

    saveDirtyQueue(queue);
  },

  /**
   * Return all dirty records across all tables.
   * Each entry includes the table name, record id, full record data,
   * and the timestamp when it was marked dirty.
   *
   * @returns {Array<{table: string, id: string, record: Object, timestamp: string}>}
   */
  getDirtyRecords() {
    return loadDirtyQueue();
  },

  /**
   * Clear dirty flags for synced records. Removes entries from the
   * dirty queue whose composite key (table:id) matches the given ids.
   *
   * Preserves dirty state for any records not in the provided list,
   * ensuring that records which failed to sync remain queued.
   *
   * @param {Array<string>} ids - Array of composite keys in "table:id" format
   */
  clearDirty(ids) {
    if (!ids || !ids.length) return;

    const idSet = new Set(ids);
    const queue = loadDirtyQueue();
    const remaining = queue.filter(
      (entry) => !idSet.has(`${entry.table}:${entry.id}`)
    );
    saveDirtyQueue(remaining);
  },

  /**
   * Get all local records for a specific table.
   * Returns a plain object mapping record ids to their data.
   *
   * @param {string} table - Table name
   * @returns {Object} Map of id → record, or empty object if table has no local data
   */
  getLocalState(table) {
    const cache = loadCache();
    return cache[table] || {};
  },

  /**
   * Check if there are any dirty records pending sync.
   * @returns {boolean}
   */
  hasPendingSync() {
    return loadDirtyQueue().length > 0;
  },

  /**
   * Get the count of dirty records per table.
   * @returns {Object} Map of table → count
   */
  getDirtyCounts() {
    const queue = loadDirtyQueue();
    const counts = {};
    for (const entry of queue) {
      counts[entry.table] = (counts[entry.table] || 0) + 1;
    }
    return counts;
  },

  /**
   * Clear all cached data and dirty queue (useful for testing or logout).
   */
  clear() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(DIRTY_QUEUE_KEY);
  },

  /** Exposed for reference by consumers */
  TRACKED_TABLES,
};

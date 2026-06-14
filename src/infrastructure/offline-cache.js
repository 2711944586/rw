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

const TRACKED_TABLE_SET = new Set(TRACKED_TABLES);

/**
 * Load the full cache object from localStorage.
 * @returns {Object}
 */
function loadCache() {
  return normalizeCache(readStorageJson(CACHE_KEY, {}).value);
}

/**
 * Persist the full cache object to localStorage.
 * @param {Object} cache
 * @returns {boolean}
 */
function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    ignoreStoredCache = false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the dirty queue from localStorage.
 * Structure: Array of { table, id, record, timestamp }
 * @returns {Array}
 */
function loadDirtyQueue() {
  return normalizeDirtyQueue(readStorageJson(DIRTY_QUEUE_KEY, []).value);
}

function readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return { ok: true, value: raw ? JSON.parse(raw) : fallback };
  } catch {
    return { ok: false, value: fallback };
  }
}

/**
 * Persist the dirty queue to localStorage.
 * @param {Array} queue
 * @returns {boolean}
 */
function saveDirtyQueue(queue) {
  try {
    localStorage.setItem(DIRTY_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCache(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeTable(table) {
  return typeof table === 'string' ? table.trim() : '';
}

function normalizeId(id) {
  return typeof id === 'string' ? id.trim() : '';
}

function isValidTable(table) {
  return TRACKED_TABLE_SET.has(normalizeTable(table));
}

function isValidId(id) {
  return normalizeId(id) !== '';
}

function isValidRecord(record) {
  return isPlainObject(record);
}

function cloneRecordForStorage(record) {
  if (!isValidRecord(record)) return null;
  try {
    const cloned = JSON.parse(JSON.stringify(record));
    return isPlainObject(cloned) ? cloned : null;
  } catch {
    return null;
  }
}

function normalizeCompositeDirtyKey(key) {
  if (typeof key !== 'string') return null;
  const [table, ...rest] = key.split(':');
  const normalizedTable = normalizeTable(table);
  const normalizedId = normalizeId(rest.join(':'));
  if (!isValidTable(normalizedTable) || !isValidId(normalizedId)) return null;
  return `${normalizedTable}:${normalizedId}`;
}

function normalizeDirtyQueue(value) {
  if (!Array.isArray(value)) return [];

  const byKey = new Map();
  for (const entry of value) {
    if (!isPlainObject(entry) || !isValidTable(entry.table) || !isValidId(entry.id) || !isValidRecord(entry.record)) continue;
    const table = normalizeTable(entry.table);
    const id = normalizeId(entry.id);
    const record = cloneRecordForStorage(entry.record);
    if (!record) continue;
    byKey.set(`${table}:${id}`, { ...entry, table, id, record });
  }
  return Array.from(byKey.values());
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function mergeDirtyRecordsIntoCache(cache, queue) {
  const next = { ...normalizeCache(cache) };

  for (const entry of normalizeDirtyQueue(queue)) {
    if (!isPlainObject(next[entry.table])) {
      next[entry.table] = {};
    } else {
      next[entry.table] = { ...next[entry.table] };
    }
    next[entry.table][entry.id] = entry.record;
  }

  return next;
}

function readLatestCache() {
  if (!ignoreStoredCache) {
    const result = readStorageJson(CACHE_KEY, {});
    if (result.ok) {
      memoryCache = mergeDirtyRecordsIntoCache(result.value, memoryDirtyQueue);
    }
  }
  return memoryCache;
}

let memoryDirtyQueue = loadDirtyQueue();
let memoryCache = mergeDirtyRecordsIntoCache(loadCache(), memoryDirtyQueue);
let ignoreStoredCache = false;

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
   * @returns {boolean} Whether both cache and queue were persisted
   */
  setDirty(table, id, record) {
    if (!isValidTable(table) || !isValidId(id) || !isValidRecord(record)) return false;
    const normalizedTable = normalizeTable(table);
    const normalizedId = normalizeId(id);
    const localRecord = cloneRecordForStorage(record);
    if (!localRecord) return false;

    // Update local table state
    const cache = readLatestCache();
    const tableState = isPlainObject(cache[normalizedTable]) ? { ...cache[normalizedTable] } : {};
    tableState[normalizedId] = localRecord;
    memoryCache = { ...cache, [normalizedTable]: tableState };
    const cacheSaved = saveCache(memoryCache);

    // Update dirty queue — replace existing entry for same table+id
    const existingIndex = memoryDirtyQueue.findIndex(
      (entry) => entry.table === normalizedTable && entry.id === normalizedId
    );

    const entry = {
      table: normalizedTable,
      id: normalizedId,
      record: localRecord,
      timestamp: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      memoryDirtyQueue = memoryDirtyQueue.map((item, index) =>
        index === existingIndex ? entry : item
      );
    } else {
      memoryDirtyQueue = [...memoryDirtyQueue, entry];
    }

    const queueSaved = saveDirtyQueue(memoryDirtyQueue);
    return cacheSaved && queueSaved;
  },

  /**
   * Return all dirty records across all tables.
   * Each entry includes the table name, record id, full record data,
   * and the timestamp when it was marked dirty.
   *
   * @returns {Array<{table: string, id: string, record: Object, timestamp: string}>}
   */
  getDirtyRecords() {
    return memoryDirtyQueue.map((entry) => ({
      ...entry,
      record: cloneJson(entry.record),
    }));
  },

  /**
   * Clear dirty flags for synced records. Removes entries from the
   * dirty queue whose composite key (table:id) matches the given ids.
   *
   * Preserves dirty state for any records not in the provided list,
   * ensuring that records which failed to sync remain queued.
   *
   * @param {Array<string>} ids - Array of composite keys in "table:id" format
   * @returns {boolean} Whether the updated queue was persisted
   */
  clearDirty(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return true;

    const idSet = new Set(ids.map(normalizeCompositeDirtyKey).filter(Boolean));
    if (idSet.size === 0) return true;
    const previousQueue = memoryDirtyQueue;
    const nextQueue = memoryDirtyQueue.filter(
      (entry) => !idSet.has(`${entry.table}:${entry.id}`)
    );
    if (nextQueue.length === memoryDirtyQueue.length) return true;

    memoryDirtyQueue = nextQueue;
    const saved = saveDirtyQueue(memoryDirtyQueue);
    if (!saved) {
      memoryDirtyQueue = previousQueue;
    }
    return saved;
  },

  /**
   * Get all local records for a specific table.
   * Returns a plain object mapping record ids to their data.
   *
   * @param {string} table - Table name
   * @returns {Object} Map of id → record, or empty object if table has no local data
   */
  getLocalState(table) {
    const normalizedTable = normalizeTable(table);
    if (!isValidTable(normalizedTable)) return {};

    const cache = readLatestCache();
    return cloneJson(isPlainObject(cache[normalizedTable]) ? cache[normalizedTable] : {});
  },

  /**
   * Check if there are any dirty records pending sync.
   * @returns {boolean}
   */
  hasPendingSync() {
    return memoryDirtyQueue.length > 0;
  },

  /**
   * Get the count of dirty records per table.
   * @returns {Object} Map of table → count
   */
  getDirtyCounts() {
    const counts = {};
    for (const entry of memoryDirtyQueue) {
      counts[entry.table] = (counts[entry.table] || 0) + 1;
    }
    return counts;
  },

  /**
   * Clear all cached data and dirty queue (useful for testing or logout).
   * @returns {boolean} Whether both localStorage entries were removed
   */
  clear() {
    memoryCache = {};
    memoryDirtyQueue = [];
    const cacheRemoved = removeStorageItem(CACHE_KEY);
    const queueRemoved = removeStorageItem(DIRTY_QUEUE_KEY);
    ignoreStoredCache = !cacheRemoved;
    return cacheRemoved && queueRemoved;
  },

  /** Exposed for reference by consumers */
  TRACKED_TABLES,
};

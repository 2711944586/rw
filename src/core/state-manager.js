/**
 * State Manager — single source of truth for application state.
 *
 * Provides read/write access to localStorage-backed state with
 * dirty-tracking for offline-first sync support.
 *
 * Emits 'state:changed' via EventBus on every mutation.
 */

import { EventBus, EVENTS } from './event-bus.js';

const STORAGE_KEY = 'pku_swm_420_dashboard_v3';
const LEGACY_STORAGE_KEY = 'pku_swm_420_state';
const DIRTY_KEY = 'pku_swm_420_dirty';

/**
 * Load state from localStorage, returning an empty object on failure.
 * @returns {Object}
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacyRaw ? JSON.parse(legacyRaw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist state to localStorage.
 * @param {Object} state
 */
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toModuleRecord(entry, date) {
  return {
    date,
    mathMin: entry.math || entry.mathMin || 0,
    csMin: entry.cs408 || entry.csMin || 0,
    engMin: entry.english || entry.engMin || 0,
    polMin: entry.politics || entry.polMin || 0,
    projectMin: entry.project || entry.projectMin || 0,
    mathProblems: entry.mathProblems || 0,
    csProblems: entry.csProblems || 0,
    readingCount: entry.reading || entry.readingCount || 0,
    newMistakes: entry.newMistakes || 0,
    fixedMistakes: entry.fixedMistakes || 0,
    nextTask: entry.nextTask || '',
    note: entry.note || '',
    updatedAt: entry.updatedAt || entry.createdAt || ''
  };
}

function fromModuleRecord(record) {
  return {
    math: record.mathMin || record.math || 0,
    cs408: record.csMin || record.cs408 || 0,
    english: record.engMin || record.english || 0,
    politics: record.polMin || record.politics || 0,
    project: record.projectMin || record.project || 0,
    mathProblems: record.mathProblems || 0,
    csProblems: record.csProblems || 0,
    reading: record.readingCount || record.reading || 0,
    newMistakes: record.newMistakes || 0,
    fixedMistakes: record.fixedMistakes || 0,
    nextTask: record.nextTask || '',
    note: record.note || '',
    quality: record.quality || 3,
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString()
  };
}

function toModuleReview(item) {
  return {
    ...item,
    topicId: item.topicId || item.sourceTaskId || item.id || '',
    nextDueAt: item.nextDueAt || item.dueDate || '',
    intervalIndex: item.intervalIndex || 0,
    failStreak: item.failStreak || 0,
    lastResult: item.lastResult || item.status || '',
    lastSubmittedDate: item.lastSubmittedDate || (item.completedAt ? item.completedAt.slice(0, 10) : '')
  };
}

function toModuleTopicProgress(topics = {}) {
  return Object.entries(topics).map(([topicId, value]) => ({
    topic_id: topicId,
    topicId,
    status_value: value,
    mastery_status: value >= 2 ? 'mastered' : value === 1 ? 'needs_review' : 'learning'
  }));
}

function getAdaptedValue(rootState, path) {
  if (path === 'profile.density_mode') return rootState.settings?.density;
  if (path === 'profile.retro_time') return rootState.settings?.retroTime;
  if (path === 'profile.last_synced_at') return rootState.sync?.lastSyncAt;
  if (path === 'settings.custom_templates') return rootState.customTasks || [];
  if (path === 'daily_records') {
    return Object.fromEntries(Object.entries(rootState.entries || {}).map(([date, entry]) => [date, toModuleRecord(entry, date)]));
  }
  if (path === 'review_items') return (rootState.reviewItems || []).map(toModuleReview);
  if (path === 'mock_scores') return rootState.scores || [];
  if (path === 'topic_progress') return toModuleTopicProgress(rootState.topics || {});
  if (path === 'calibration_snapshots') return rootState.snapshots || [];
  if (path === 'showcase_items') return rootState.showcaseItems || [];
  if (path === 'source_registry') return rootState.sourceRegistry || [];
  return undefined;
}

function setAdaptedValue(rootState, path, value) {
  if (path === 'profile.density_mode') {
    rootState.settings = { ...(rootState.settings || {}), density: value };
    return true;
  }
  if (path === 'profile.retro_time') {
    rootState.settings = { ...(rootState.settings || {}), retroTime: value };
    return true;
  }
  if (path === 'settings.custom_templates') {
    rootState.customTasks = Array.isArray(value) ? value : [];
    return true;
  }
  if (path === 'daily_records') {
    rootState.entries = Object.fromEntries(Object.entries(value || {}).map(([date, record]) => [date, fromModuleRecord(record)]));
    return true;
  }
  if (path === 'review_items') {
    rootState.reviewItems = Array.isArray(value) ? value.map((item) => ({
      ...item,
      id: item.id || item.topicId,
      dueDate: item.dueDate || item.nextDueAt,
      sourceTaskId: item.sourceTaskId || item.topicId || '',
      status: item.status || (item.lastResult === 'pass' ? 'done' : 'due')
    })) : [];
    return true;
  }
  if (path === 'showcase_items') {
    rootState.showcaseItems = Array.isArray(value) ? value : [];
    return true;
  }
  return false;
}

function getByPath(root, path) {
  if (!path) return root;
  const adapted = getAdaptedValue(root, path);
  if (adapted !== undefined) return adapted;
  const keys = path.split('.');
  let current = root;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Load the dirty-tracking map from localStorage.
 * Structure: { "tableName:recordId": true, ... }
 * @returns {Object}
 */
function loadDirty() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist dirty-tracking map to localStorage.
 * @param {Object} dirtyMap
 */
function saveDirty(dirtyMap) {
  localStorage.setItem(DIRTY_KEY, JSON.stringify(dirtyMap));
}

// In-memory caches
let state = loadState();
let dirtyMap = loadDirty();

export const StateManager = {
  /**
   * Get the full state object or a nested value by dot-path.
   * @param {string} [path] - Optional dot-separated path (e.g. "reviews.queue")
   * @returns {*} The value at the path, or the full state if no path given
   */
  getState(path) {
    return getByPath(state, path);
  },

  /**
   * Set a value at the given dot-path and persist to localStorage.
   * Emits 'state:changed' with { path, value }.
   * @param {string} path - Dot-separated path (e.g. "tasks.today")
   * @param {*} value - Value to set
   */
  setState(path, value) {
    if (setAdaptedValue(state, path, value)) {
      saveState(state);
      EventBus.emit(EVENTS.STATE_CHANGED, { path, value });
      return;
    }

    const keys = path.split('.');
    let current = state;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] == null || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
    saveState(state);
    EventBus.emit(EVENTS.STATE_CHANGED, { path, value });
  },

  /**
   * Mark a record as dirty (needs sync to remote).
   * @param {string} tableName - Supabase table name
   * @param {string} recordId - Record identifier
   */
  markDirty(tableName, recordId) {
    const key = `${tableName}:${recordId}`;
    dirtyMap[key] = true;
    saveDirty(dirtyMap);
  },

  /**
   * Get all dirty record identifiers.
   * @returns {Array<{tableName: string, recordId: string}>}
   */
  getDirtyRecords() {
    return Object.keys(dirtyMap).map((key) => {
      const [tableName, ...rest] = key.split(':');
      return { tableName, recordId: rest.join(':') };
    });
  },

  /**
   * Clear dirty flags for the given record identifiers.
   * @param {Array<string>} recordIds - Array of "tableName:recordId" keys
   */
  clearDirty(recordIds) {
    for (const id of recordIds) {
      delete dirtyMap[id];
    }
    saveDirty(dirtyMap);
  },

  /**
   * Reset in-memory state from localStorage (useful after external changes).
   */
  reload() {
    state = loadState();
    dirtyMap = loadDirty();
  },

  /**
   * Clear all state and dirty flags (useful for testing or logout).
   */
  clear() {
    state = {};
    dirtyMap = {};
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(DIRTY_KEY);
  },
};

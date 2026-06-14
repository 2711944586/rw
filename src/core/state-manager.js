/**
 * State Manager — single source of truth for application state.
 *
 * Provides read/write access to localStorage-backed state with
 * dirty-tracking for offline-first sync support.
 *
 * Emits 'state:changed' via EventBus on every mutation.
 */

import { EventBus, EVENTS } from './event-bus.js';
import { nonNegativeNumber } from '../utils/number.js';

const STORAGE_KEY = 'pku_swm_420_dashboard_v3';
const LEGACY_STORAGE_KEY = 'pku_swm_420_state';
const DIRTY_KEY = 'pku_swm_420_dirty';
const UNSAFE_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeObject(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeDirtyMap(value) {
  const normalized = {};
  for (const [key, isDirty] of Object.entries(normalizeObject(value))) {
    const normalizedKey = normalizeDirtyKey(key);
    if (isDirty !== true || !normalizedKey) continue;
    normalized[normalizedKey] = true;
  }
  return normalized;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasValue(value) {
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

function pickNonNegativeNumber(values, fallback = 0) {
  for (const value of values) {
    if (!hasValue(value)) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return nonNegativeNumber(fallback);
}

function pickNonNegativeInteger(values, fallback = 0) {
  return Math.round(pickNonNegativeNumber(values, fallback));
}

function pickBoundedNumber(values, min, max, fallback = min) {
  for (const value of values) {
    if (!hasValue(value)) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.min(max, Math.max(min, numeric));
  }
  return Math.min(max, Math.max(min, Number.isFinite(Number(fallback)) ? Number(fallback) : min));
}

function pickBoundedInteger(values, min, max, fallback = min) {
  return Math.round(pickBoundedNumber(values, min, max, fallback));
}

function firstBoundedNumber(values, min, max) {
  for (const value of values) {
    if (!hasValue(value)) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.min(max, Math.max(min, numeric));
  }
  return null;
}

function safeRecordId(value, fallback) {
  const id = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  return id && !UNSAFE_PATH_KEYS.has(id) ? id : fallback;
}

function safeDateString(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

function safeString(value, fallback = '') {
  if (!['string', 'number', 'bigint'].includes(typeof value)) return fallback;
  return String(value);
}

function firstSafeString(values, fallback = '') {
  for (const value of normalizeArray(values)) {
    const text = safeString(value);
    if (text) return text;
  }
  return fallback;
}

function safeTopicId(value) {
  const text = safeString(value).trim();
  return text && !UNSAFE_PATH_KEYS.has(text) ? text : '';
}

function firstSafeTopicId(values) {
  for (const value of normalizeArray(values)) {
    const id = safeTopicId(value);
    if (id) return id;
  }
  return '';
}

function firstSafeDateString(values) {
  for (const value of normalizeArray(values)) {
    const date = safeDateString(value);
    if (date) return date;
  }
  return '';
}

function safeReviewStatus(value, fallback = 'due') {
  const text = safeString(value).trim();
  return ['due', 'done', 'delayed', 'failed'].includes(text) ? text : fallback;
}

function cloneStateValueForStorage(value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return { ok: false, value: undefined };
    return { ok: true, value: JSON.parse(serialized) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function cloneStateValueForRead(value) {
  const cloned = cloneStateValueForStorage(value);
  return cloned.ok ? cloned.value : undefined;
}

function emitStateChanged(path, value, localSaved) {
  EventBus.emit(EVENTS.STATE_CHANGED, {
    path,
    value: cloneStateValueForRead(value),
    localSaved
  });
}

function normalizeStatePath(path) {
  if (typeof path !== 'string') return null;
  const keys = path.split('.').map((key) => key.trim());
  if (keys.some((key) => key === '')) return null;
  if (keys.some((key) => UNSAFE_PATH_KEYS.has(key))) return null;
  return keys.join('.');
}

function isValidDirtyTable(tableName) {
  return typeof tableName === 'string' && tableName.trim() !== '' && !tableName.includes(':');
}

function isValidDirtyRecordId(recordId) {
  return typeof recordId === 'string' && recordId.trim() !== '';
}

function normalizeDirtyKey(key) {
  if (typeof key !== 'string') return null;
  const [tableName, ...rest] = key.split(':');
  const recordId = rest.join(':');
  if (!isValidDirtyTable(tableName) || !isValidDirtyRecordId(recordId)) return null;
  return `${tableName.trim()}:${recordId.trim()}`;
}

/**
 * Load state from localStorage, returning an empty object on failure.
 * @returns {Object}
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeObject(JSON.parse(raw));
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacyRaw ? normalizeObject(JSON.parse(legacyRaw)) : {};
  } catch {
    return {};
  }
}

/**
 * Persist state to localStorage.
 * @param {Object} state
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function toModuleRecord(entry, date) {
  const record = normalizeObject(entry);
  return {
    date,
    mathMin: pickNonNegativeNumber([record.math, record.mathMin]),
    csMin: pickNonNegativeNumber([record.cs408, record.csMin]),
    engMin: pickNonNegativeNumber([record.english, record.engMin]),
    polMin: pickNonNegativeNumber([record.politics, record.polMin]),
    projectMin: pickNonNegativeNumber([record.project, record.projectMin]),
    mathProblems: pickNonNegativeNumber([record.mathProblems]),
    csProblems: pickNonNegativeNumber([record.csProblems]),
    readingCount: pickNonNegativeNumber([record.reading, record.readingCount]),
    newMistakes: pickNonNegativeNumber([record.newMistakes]),
    fixedMistakes: pickNonNegativeNumber([record.fixedMistakes]),
    nextTask: safeString(record.nextTask),
    note: safeString(record.note),
    updatedAt: firstSafeString([record.updatedAt, record.createdAt])
  };
}

function fromModuleRecord(record) {
  const entry = normalizeObject(record);
  return {
    math: pickNonNegativeNumber([entry.mathMin, entry.math]),
    cs408: pickNonNegativeNumber([entry.csMin, entry.cs408]),
    english: pickNonNegativeNumber([entry.engMin, entry.english]),
    politics: pickNonNegativeNumber([entry.polMin, entry.politics]),
    project: pickNonNegativeNumber([entry.projectMin, entry.project]),
    mathProblems: pickNonNegativeNumber([entry.mathProblems]),
    csProblems: pickNonNegativeNumber([entry.csProblems]),
    reading: pickNonNegativeNumber([entry.readingCount, entry.reading]),
    newMistakes: pickNonNegativeNumber([entry.newMistakes]),
    fixedMistakes: pickNonNegativeNumber([entry.fixedMistakes]),
    nextTask: safeString(entry.nextTask),
    note: safeString(entry.note),
    quality: pickBoundedNumber([entry.quality], 1, 5, 3),
    updatedAt: firstSafeString([entry.updatedAt, entry.createdAt], new Date().toISOString())
  };
}

function toModuleReview(item) {
  const review = normalizeObject(item);
  const completedDate = safeString(review.completedAt).slice(0, 10);
  return {
    ...review,
    topicId: firstSafeTopicId([review.topicId, review.sourceTaskId, review.id]),
    topic: safeString(review.topic),
    subject: safeString(review.subject),
    text: safeString(review.text),
    title: safeString(review.title),
    round: safeString(review.round),
    nextDueAt: firstSafeDateString([review.nextDueAt, review.dueDate]),
    intervalIndex: pickNonNegativeInteger([review.intervalIndex]),
    failStreak: pickNonNegativeInteger([review.failStreak]),
    lastResult: safeString(review.lastResult) || safeReviewStatus(review.status, ''),
    lastSubmittedDate: firstSafeDateString([review.lastSubmittedDate, completedDate])
  };
}

function normalizeScoreRecord(item, index) {
  const row = normalizeObject(item);
  const isScalarScore = !isPlainObject(item) && hasValue(item);
  if (!Object.keys(row).length && !isScalarScore) return null;

  const politics = pickBoundedInteger([row.politics], 0, 100);
  const english = pickBoundedInteger([row.english], 0, 100);
  const math = pickBoundedInteger([row.math], 0, 150);
  const cs408 = pickBoundedInteger([row.cs408], 0, 150);
  const hasComponents = ['politics', 'english', 'math', 'cs408'].some((field) => hasValue(row[field]));
  const componentTotal = politics + english + math + cs408;
  const explicitTotal = isScalarScore
    ? firstBoundedNumber([item], 0, 500)
    : firstBoundedNumber([row.total, row.score], 0, 500);
  if (!hasComponents && explicitTotal === null) return null;
  const total = hasComponents && componentTotal > 0
    ? componentTotal
    : Math.round(explicitTotal ?? componentTotal);

  return {
    id: safeRecordId(row.id, `score_${index + 1}`),
    date: safeDateString(row.date),
    name: safeString(row.name, '未命名模考') || '未命名模考',
    politics,
    english,
    math,
    cs408,
    total,
    note: safeString(row.note),
    updatedAt: firstSafeString([row.updatedAt, row.updated_at])
  };
}

function normalizeScoreArray(value) {
  return normalizeArray(value).flatMap((item, index) => {
    const score = normalizeScoreRecord(item, index);
    return score ? [score] : [];
  });
}

function normalizeTopicStatusValue(value, fallback = 0) {
  const number = Number(value);
  const source = Number.isFinite(number) ? number : fallback;
  return Math.round(Math.min(2, Math.max(0, source)));
}

function toModuleTopicProgress(topics = {}) {
  return Object.entries(normalizeObject(topics)).map(([topicId, value]) => {
    const statusValue = normalizeTopicStatusValue(value);
    return {
      topic_id: topicId,
      topicId,
      status_value: statusValue,
      mastery_status: statusValue >= 2 ? 'mastered' : statusValue === 1 ? 'needs_review' : 'learning'
    };
  });
}

function topicStatusFromMastery(status) {
  if (typeof status !== 'string') return 0;
  const normalized = status.trim().toLowerCase();
  if (normalized === 'mastered') return 2;
  if (normalized === 'needs_review' || normalized === 'review') return 1;
  return 0;
}

function fromModuleTopicProgress(rows) {
  const topics = {};
  for (const item of normalizeArray(rows)) {
    const row = normalizeObject(item);
    const topicId = firstSafeTopicId([row.topicId, row.topic_id]);
    if (!topicId) continue;
    const rawValue = row.status_value ?? row.statusValue;
    const fallbackValue = topicStatusFromMastery(row.mastery_status);
    topics[topicId] = rawValue === undefined
      ? fallbackValue
      : normalizeTopicStatusValue(rawValue, fallbackValue);
  }
  return topics;
}

function getAdaptedValue(rootState, path) {
  if (path === 'profile.density_mode') return rootState.settings?.density;
  if (path === 'profile.retro_time') return rootState.settings?.retroTime;
  if (path === 'profile.last_synced_at') return rootState.sync?.lastSyncAt;
  if (path === 'settings.custom_templates') return rootState.customTasks || [];
  if (path === 'daily_records') {
    return Object.fromEntries(Object.entries(normalizeObject(rootState.entries)).map(([date, entry]) => [date, toModuleRecord(entry, date)]));
  }
  if (path === 'review_items') return normalizeArray(rootState.reviewItems).map(toModuleReview);
  if (path === 'mock_scores') return normalizeScoreArray(rootState.scores);
  if (path === 'topic_progress') return toModuleTopicProgress(rootState.topics || {});
  if (path === 'calibration_snapshots') return normalizeArray(rootState.snapshots);
  if (path === 'showcase_items') return normalizeArray(rootState.showcaseItems);
  if (path === 'source_registry') return normalizeArray(rootState.sourceRegistry);
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
  if (path === 'profile.last_synced_at') {
    rootState.sync = { ...(rootState.sync || {}), lastSyncAt: value };
    return true;
  }
  if (path === 'settings.custom_templates') {
    rootState.customTasks = normalizeArray(value);
    return true;
  }
  if (path === 'daily_records') {
    rootState.entries = Object.fromEntries(Object.entries(normalizeObject(value)).map(([date, record]) => [date, fromModuleRecord(record)]));
    return true;
  }
  if (path === 'review_items') {
    rootState.reviewItems = normalizeArray(value).map((item) => {
      const review = normalizeObject(item);
      const status = safeReviewStatus(review.status, review.lastResult === 'pass' ? 'done' : 'due');
      return {
        ...review,
        id: safeRecordId(review.id, firstSafeTopicId([review.topicId, review.topic_id])),
        topicId: firstSafeTopicId([review.topicId, review.topic_id]),
        topic: safeString(review.topic),
        subject: safeString(review.subject),
        text: safeString(review.text),
        title: safeString(review.title),
        round: safeString(review.round),
        dueDate: firstSafeDateString([review.dueDate, review.nextDueAt]),
        sourceTaskId: firstSafeTopicId([review.sourceTaskId, review.source_task_id, review.topicId, review.topic_id]),
        intervalIndex: pickNonNegativeInteger([review.intervalIndex]),
        failStreak: pickNonNegativeInteger([review.failStreak]),
        status
      };
    });
    return true;
  }
  if (path === 'mock_scores') {
    rootState.scores = normalizeScoreArray(value);
    return true;
  }
  if (path === 'topic_progress') {
    rootState.topics = fromModuleTopicProgress(value);
    return true;
  }
  if (path === 'calibration_snapshots') {
    rootState.snapshots = normalizeArray(value);
    return true;
  }
  if (path === 'showcase_items') {
    rootState.showcaseItems = normalizeArray(value);
    return true;
  }
  if (path === 'source_registry') {
    rootState.sourceRegistry = normalizeArray(value);
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
    return raw ? normalizeDirtyMap(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/**
 * Persist dirty-tracking map to localStorage.
 * @param {Object} dirtyMap
 */
function saveDirty(dirtyMap) {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify(dirtyMap));
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
    // In-memory state is still cleared below.
    return false;
  }
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
    if (path === undefined) return cloneStateValueForRead(state);
    const normalizedPath = normalizeStatePath(path);
    return normalizedPath ? cloneStateValueForRead(getByPath(state, normalizedPath)) : undefined;
  },

  /**
   * Set a value at the given dot-path and persist to localStorage.
   * Emits 'state:changed' with { path, value, localSaved }.
   * @param {string} path - Dot-separated path (e.g. "tasks.today")
   * @param {*} value - Value to set
   */
  setState(path, value) {
    const normalizedPath = normalizeStatePath(path);
    if (!normalizedPath) return false;
    const cloned = cloneStateValueForStorage(value);
    if (!cloned.ok) return false;
    const nextValue = cloned.value;

    if (setAdaptedValue(state, normalizedPath, nextValue)) {
      const saved = saveState(state);
      emitStateChanged(normalizedPath, nextValue, saved);
      return saved;
    }

    const keys = normalizedPath.split('.');
    let current = state;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] == null || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = nextValue;
    const saved = saveState(state);
    emitStateChanged(normalizedPath, nextValue, saved);
    return saved;
  },

  /**
   * Mark a record as dirty (needs sync to remote).
   * @param {string} tableName - Supabase table name
   * @param {string} recordId - Record identifier
   */
  markDirty(tableName, recordId) {
    if (!isValidDirtyTable(tableName) || !isValidDirtyRecordId(recordId)) return false;

    const key = `${tableName.trim()}:${recordId.trim()}`;
    dirtyMap[key] = true;
    return saveDirty(dirtyMap);
  },

  /**
   * Get all dirty record identifiers.
   * @returns {Array<{tableName: string, recordId: string}>}
   */
  getDirtyRecords() {
    dirtyMap = normalizeDirtyMap(dirtyMap);
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
    if (!Array.isArray(recordIds) || recordIds.length === 0) return true;

    dirtyMap = normalizeDirtyMap(dirtyMap);
    const normalizedIds = new Set(recordIds.map(normalizeDirtyKey).filter(Boolean));
    if (normalizedIds.size === 0) return true;

    const previousDirtyMap = { ...dirtyMap };
    let changed = false;
    for (const id of normalizedIds) {
      if (Object.prototype.hasOwnProperty.call(dirtyMap, id)) {
        changed = true;
      }
      delete dirtyMap[id];
    }
    if (!changed) return true;

    const saved = saveDirty(dirtyMap);
    if (!saved) {
      dirtyMap = previousDirtyMap;
    }
    return saved;
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
   * @returns {boolean} Whether all persisted state keys were removed
   */
  clear() {
    state = {};
    dirtyMap = {};
    const stateRemoved = removeStorageItem(STORAGE_KEY);
    const legacyRemoved = removeStorageItem(LEGACY_STORAGE_KEY);
    const dirtyRemoved = removeStorageItem(DIRTY_KEY);
    return stateRemoved && legacyRemoved && dirtyRemoved;
  },
};

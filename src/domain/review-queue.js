/**
 * Review Queue Module
 *
 * Pure functions for spaced-repetition review queue management.
 * Intervals: D+1, D+3, D+7, D+14, D+30
 *
 * No side effects, no DOM, no Supabase calls.
 */

/** Interval days indexed 0..4 */
export const INTERVALS = [1, 3, 7, 14, 30];

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const FALLBACK_DATE = '1970-01-01';
const INVALID_SORT_DATE = '9999-12-31';

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  const fallbackNumeric = Math.max(0, finiteNumber(fallback, 0));
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallbackNumeric;
}

function nonNegativeCount(value, fallback = 0) {
  return Math.round(nonNegativeNumber(value, fallback));
}

function boundedIntervalIndex(value) {
  return Math.min(INTERVALS.length - 1, nonNegativeCount(value));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function safeDateText(value) {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return '';
  const text = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseISODate(value) {
  const text = safeDateText(value);
  if (!text) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === text ? date : null;
}

function safeDateKey(dateStr, fallback = INVALID_SORT_DATE) {
  return parseISODate(dateStr)?.toISOString().slice(0, 10) || fallback;
}

/**
 * Add days to an ISO date string, returning a new ISO date string (YYYY-MM-DD).
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @param {number} days - Number of days to add
 * @returns {string} New ISO date string
 */
function addDays(dateStr, days) {
  const date = parseISODate(dateStr) || parseISODate(FALLBACK_DATE);
  date.setUTCDate(date.getUTCDate() + Math.round(finiteNumber(days, 0)));
  return date.toISOString().slice(0, 10);
}

/**
 * Compute the difference in days between two ISO date strings.
 * @param {string} laterDate - ISO date string
 * @param {string} earlierDate - ISO date string
 * @returns {number} Difference in days (can be negative)
 */
function diffDays(laterDate, earlierDate) {
  const a = parseISODate(laterDate);
  const b = parseISODate(earlierDate);
  if (!a || !b) return 0;
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * Check if a pass submission is allowed for this item today.
 * Rejects if lastSubmittedDate === today (same-day double-pass prevention).
 *
 * @param {Object} item - ReviewItem
 * @param {string} today - ISO date string (YYYY-MM-DD)
 * @returns {boolean} true if pass is allowed
 *
 * Validates: Requirements 7.6
 */
export function canSubmitPass(item, today) {
  return item?.lastSubmittedDate !== today;
}

/**
 * Advance a review item on pass.
 * intervalIndex = min(4, old+1), nextDueAt = today + INTERVALS[newIndex]
 * Updates lastResult and lastSubmittedDate.
 *
 * @param {Object} item - ReviewItem
 * @param {string} today - ISO date string (YYYY-MM-DD)
 * @returns {Object} New ReviewItem (immutable update)
 *
 * Validates: Requirements 7.2
 */
export function advanceOnPass(item = {}, today) {
  const newIndex = Math.min(INTERVALS.length - 1, boundedIntervalIndex(item.intervalIndex) + 1);
  const safeToday = safeDateKey(today, FALLBACK_DATE);
  return {
    ...item,
    intervalIndex: newIndex,
    nextDueAt: addDays(safeToday, INTERVALS[newIndex]),
    lastResult: 'pass',
    lastSubmittedDate: safeToday,
    failStreak: 0,
  };
}

/**
 * Reset a review item on fail.
 * intervalIndex = 0, failStreak++, nextDueAt = tomorrow.
 *
 * @param {Object} item - ReviewItem
 * @param {string} today - ISO date string (YYYY-MM-DD)
 * @returns {Object} New ReviewItem (immutable update)
 *
 * Validates: Requirements 7.3
 */
export function resetOnFail(item = {}, today) {
  const safeToday = safeDateKey(today, FALLBACK_DATE);
  return {
    ...item,
    intervalIndex: 0,
    failStreak: nonNegativeCount(item.failStreak) + 1,
    nextDueAt: addDays(safeToday, 1),
    lastResult: 'fail',
  };
}

/**
 * Check if item qualifies as high-priority recovery (failStreak >= 3).
 *
 * @param {Object} item - ReviewItem
 * @returns {boolean}
 *
 * Validates: Requirements 7.4
 */
export function isHighPriorityRecovery(item) {
  return nonNegativeCount(item?.failStreak) >= 3;
}

/**
 * Sort due items by (failStreak DESC, nextDueAt ASC, intervalIndex ASC).
 * Returns a new sorted array (does not mutate input).
 *
 * @param {Array} items - Array of ReviewItems
 * @returns {Array} Sorted array
 *
 * Validates: Requirements 7.5
 */
export function sortDueItems(items) {
  return [...arrayValue(items)].sort((a, b) => {
    // failStreak descending
    const aFailStreak = nonNegativeCount(a?.failStreak);
    const bFailStreak = nonNegativeCount(b?.failStreak);
    if (bFailStreak !== aFailStreak) return bFailStreak - aFailStreak;
    // nextDueAt ascending
    const aDate = safeDateKey(a?.nextDueAt);
    const bDate = safeDateKey(b?.nextDueAt);
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    // intervalIndex ascending
    return boundedIntervalIndex(a?.intervalIndex) - boundedIntervalIndex(b?.intervalIndex);
  });
}

/**
 * Trim items to fit within available capacity.
 * Items are assumed to already be sorted by priority.
 * Returns {kept, deferred}; deferred items get nextDueAt += 1 day.
 *
 * @param {Array} items - Sorted array of ReviewItems
 * @param {number} capacityMinutes - Available review time in minutes
 * @param {number} minutesPerItem - Estimated minutes per review item
 * @returns {{ kept: Array, deferred: Array }}
 *
 * Validates: Requirements 7.5
 */
export function trimToCapacity(items, capacityMinutes, minutesPerItem) {
  const safeItems = arrayValue(items);
  const safeMinutesPerItem = finiteNumber(minutesPerItem, 0);
  if (safeMinutesPerItem <= 0) {
    return { kept: [...safeItems], deferred: [] };
  }

  const safeCapacityMinutes = nonNegativeNumber(capacityMinutes);
  const maxItems = Math.max(0, Math.floor(safeCapacityMinutes / safeMinutesPerItem));
  const kept = safeItems.slice(0, maxItems);
  const deferred = safeItems.slice(maxItems).map(item => ({
    ...item,
    nextDueAt: addDays(item?.nextDueAt, 1),
  }));
  return { kept, deferred };
}

/**
 * Check if a review item is stale (>= 7 days overdue).
 *
 * @param {Object} item - ReviewItem
 * @param {string} today - ISO date string (YYYY-MM-DD)
 * @returns {{ isStale: boolean, daysSinceDue: number }}
 *
 * Validates: Requirements 7.7
 */
export function checkStaleness(item, today) {
  const daysSinceDue = diffDays(today, item?.nextDueAt);
  return {
    isStale: daysSinceDue >= 7,
    daysSinceDue,
  };
}

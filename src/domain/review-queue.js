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

/**
 * Add days to an ISO date string, returning a new ISO date string (YYYY-MM-DD).
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @param {number} days - Number of days to add
 * @returns {string} New ISO date string
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Compute the difference in days between two ISO date strings.
 * @param {string} laterDate - ISO date string
 * @param {string} earlierDate - ISO date string
 * @returns {number} Difference in days (can be negative)
 */
function diffDays(laterDate, earlierDate) {
  const a = new Date(laterDate + 'T00:00:00Z');
  const b = new Date(earlierDate + 'T00:00:00Z');
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
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
  return item.lastSubmittedDate !== today;
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
export function advanceOnPass(item, today) {
  const newIndex = Math.min(4, item.intervalIndex + 1);
  return {
    ...item,
    intervalIndex: newIndex,
    nextDueAt: addDays(today, INTERVALS[newIndex]),
    lastResult: 'pass',
    lastSubmittedDate: today,
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
export function resetOnFail(item, today) {
  return {
    ...item,
    intervalIndex: 0,
    failStreak: item.failStreak + 1,
    nextDueAt: addDays(today, 1),
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
  return item.failStreak >= 3;
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
  return [...items].sort((a, b) => {
    // failStreak descending
    if (b.failStreak !== a.failStreak) return b.failStreak - a.failStreak;
    // nextDueAt ascending
    if (a.nextDueAt !== b.nextDueAt) return a.nextDueAt < b.nextDueAt ? -1 : 1;
    // intervalIndex ascending
    return a.intervalIndex - b.intervalIndex;
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
  const maxItems = minutesPerItem > 0 ? Math.floor(capacityMinutes / minutesPerItem) : items.length;
  const kept = items.slice(0, maxItems);
  const deferred = items.slice(maxItems).map(item => ({
    ...item,
    nextDueAt: addDays(item.nextDueAt, 1),
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
  const daysSinceDue = diffDays(today, item.nextDueAt);
  return {
    isStale: daysSinceDue >= 7,
    daysSinceDue,
  };
}

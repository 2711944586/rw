import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  INTERVALS,
  advanceOnPass,
  resetOnFail,
  isHighPriorityRecovery,
  sortDueItems,
  trimToCapacity,
  canSubmitPass,
  checkStaleness,
} from '../../src/domain/review-queue.js';

/**
 * Helper: generate a valid ISO date string (YYYY-MM-DD)
 */
const isoDateArb = fc
  .integer({ min: 0, max: 2556 }) // days offset from 2024-01-01 (covers ~7 years)
  .map((offset) => {
    const d = new Date('2024-01-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  });

/**
 * Helper: generate a ReviewItem with appropriate fields
 */
const reviewItemArb = fc.record({
  topicId: fc.string({ minLength: 1, maxLength: 20 }),
  addedAt: isoDateArb,
  nextDueAt: isoDateArb,
  intervalIndex: fc.integer({ min: 0, max: 4 }),
  lastResult: fc.oneof(fc.constant('pass'), fc.constant('fail'), fc.constant(null)),
  failStreak: fc.integer({ min: 0, max: 20 }),
  lastSubmittedDate: fc.oneof(isoDateArb, fc.constant(null)),
});

/**
 * Helper: add days to ISO date
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── Property 21: Pass advances interval ─────────────────────────────────────

describe('Property 21: Pass advances interval', () => {
  /**
   * **Validates: Requirements 7.2**
   */
  test.prop([reviewItemArb, isoDateArb])(
    'advanceOnPass sets intervalIndex to min(4, old+1) and nextDueAt = today + INTERVALS[newIndex]',
    (item, today) => {
      const result = advanceOnPass(item, today);
      const expectedIndex = Math.min(4, item.intervalIndex + 1);
      const expectedDue = addDays(today, INTERVALS[expectedIndex]);

      expect(result.intervalIndex).toBe(expectedIndex);
      expect(result.nextDueAt).toBe(expectedDue);
      expect(result.lastResult).toBe('pass');
      expect(result.lastSubmittedDate).toBe(today);
    }
  );

  /**
   * **Validates: Requirements 7.6**
   */
  test.prop([reviewItemArb, isoDateArb])(
    'canSubmitPass returns false when lastSubmittedDate === today',
    (item, today) => {
      const itemSubmittedToday = { ...item, lastSubmittedDate: today };
      expect(canSubmitPass(itemSubmittedToday, today)).toBe(false);
    }
  );
});

// ─── Property 22: Fail resets state ──────────────────────────────────────────

describe('Property 22: Fail resets state', () => {
  /**
   * **Validates: Requirements 7.3**
   */
  test.prop([reviewItemArb, isoDateArb])(
    'resetOnFail sets intervalIndex to 0, increments failStreak, and nextDueAt = tomorrow',
    (item, today) => {
      const result = resetOnFail(item, today);
      const expectedDue = addDays(today, 1);

      expect(result.intervalIndex).toBe(0);
      expect(result.failStreak).toBe(item.failStreak + 1);
      expect(result.nextDueAt).toBe(expectedDue);
      expect(result.lastResult).toBe('fail');
    }
  );
});

// ─── Property 23: High-priority escalation ───────────────────────────────────

describe('Property 23: High-priority escalation', () => {
  /**
   * **Validates: Requirements 7.4**
   */
  test.prop([fc.integer({ min: 3, max: 100 })])(
    'failStreak >= 3 returns true for isHighPriorityRecovery',
    (failStreak) => {
      expect(isHighPriorityRecovery({ failStreak })).toBe(true);
    }
  );

  test.prop([fc.integer({ min: 0, max: 2 })])(
    'failStreak < 3 returns false for isHighPriorityRecovery',
    (failStreak) => {
      expect(isHighPriorityRecovery({ failStreak })).toBe(false);
    }
  );
});

// ─── Property 24: Overflow sorting and deferral ──────────────────────────────

describe('Property 24: Overflow sorting and deferral', () => {
  /**
   * **Validates: Requirements 7.5**
   */
  test.prop([fc.array(reviewItemArb, { minLength: 1, maxLength: 30 })])(
    'sortDueItems produces correct order (failStreak DESC, nextDueAt ASC, intervalIndex ASC)',
    (items) => {
      const sorted = sortDueItems(items);

      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];

        if (a.failStreak !== b.failStreak) {
          expect(a.failStreak).toBeGreaterThan(b.failStreak);
        } else if (a.nextDueAt !== b.nextDueAt) {
          expect(a.nextDueAt <= b.nextDueAt).toBe(true);
        } else {
          expect(a.intervalIndex).toBeLessThanOrEqual(b.intervalIndex);
        }
      }
    }
  );

  /**
   * **Validates: Requirements 7.5**
   */
  test.prop([
    fc.array(reviewItemArb, { minLength: 2, maxLength: 20 }),
    fc.integer({ min: 1, max: 60 }),
    fc.integer({ min: 5, max: 15 }),
  ])(
    'trimToCapacity deferred items get +1 day on nextDueAt',
    (items, capacityMinutes, minutesPerItem) => {
      const { kept, deferred } = trimToCapacity(items, capacityMinutes, minutesPerItem);

      // All items accounted for
      expect(kept.length + deferred.length).toBe(items.length);

      // Each deferred item has nextDueAt = original + 1 day
      const maxItems = Math.floor(capacityMinutes / minutesPerItem);
      const deferredOriginals = items.slice(maxItems);

      for (let i = 0; i < deferred.length; i++) {
        const expectedDue = addDays(deferredOriginals[i].nextDueAt, 1);
        expect(deferred[i].nextDueAt).toBe(expectedDue);
      }
    }
  );
});

// ─── Property 25: Staleness detection ────────────────────────────────────────

describe('Property 25: Staleness detection', () => {
  /**
   * **Validates: Requirements 7.7**
   */
  test.prop([reviewItemArb, fc.integer({ min: 7, max: 365 })])(
    '>= 7 days overdue returns isStale: true',
    (item, daysOverdue) => {
      const today = addDays(item.nextDueAt, daysOverdue);
      const result = checkStaleness(item, today);
      expect(result.isStale).toBe(true);
      expect(result.daysSinceDue).toBe(daysOverdue);
    }
  );

  test.prop([reviewItemArb, fc.integer({ min: 0, max: 6 })])(
    '< 7 days overdue returns isStale: false',
    (item, daysOverdue) => {
      const today = addDays(item.nextDueAt, daysOverdue);
      const result = checkStaleness(item, today);
      expect(result.isStale).toBe(false);
      expect(result.daysSinceDue).toBe(daysOverdue);
    }
  );
});

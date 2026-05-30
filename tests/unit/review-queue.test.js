import { describe, it, expect } from 'vitest';
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

describe('review-queue', () => {
  const baseItem = {
    topicId: 'topic-1',
    addedAt: '2025-01-01',
    nextDueAt: '2025-01-10',
    intervalIndex: 0,
    lastResult: null,
    failStreak: 0,
    lastSubmittedDate: null,
  };

  describe('INTERVALS', () => {
    it('should export correct interval array', () => {
      expect(INTERVALS).toEqual([1, 3, 7, 14, 30]);
    });
  });

  describe('advanceOnPass', () => {
    it('should increment intervalIndex from 0 to 1', () => {
      const result = advanceOnPass(baseItem, '2025-01-10');
      expect(result.intervalIndex).toBe(1);
      expect(result.nextDueAt).toBe('2025-01-13'); // today + 3
      expect(result.lastResult).toBe('pass');
      expect(result.lastSubmittedDate).toBe('2025-01-10');
      expect(result.failStreak).toBe(0);
    });

    it('should cap intervalIndex at 4', () => {
      const item = { ...baseItem, intervalIndex: 4 };
      const result = advanceOnPass(item, '2025-01-10');
      expect(result.intervalIndex).toBe(4);
      expect(result.nextDueAt).toBe('2025-02-09'); // today + 30
    });

    it('should advance from 3 to 4', () => {
      const item = { ...baseItem, intervalIndex: 3 };
      const result = advanceOnPass(item, '2025-01-10');
      expect(result.intervalIndex).toBe(4);
      expect(result.nextDueAt).toBe('2025-02-09'); // today + 30
    });

    it('should reset failStreak on pass', () => {
      const item = { ...baseItem, failStreak: 5 };
      const result = advanceOnPass(item, '2025-01-10');
      expect(result.failStreak).toBe(0);
    });
  });

  describe('resetOnFail', () => {
    it('should reset intervalIndex to 0 and set nextDueAt to tomorrow', () => {
      const item = { ...baseItem, intervalIndex: 3 };
      const result = resetOnFail(item, '2025-01-10');
      expect(result.intervalIndex).toBe(0);
      expect(result.nextDueAt).toBe('2025-01-11');
      expect(result.lastResult).toBe('fail');
    });

    it('should increment failStreak', () => {
      const item = { ...baseItem, failStreak: 2 };
      const result = resetOnFail(item, '2025-01-10');
      expect(result.failStreak).toBe(3);
    });
  });

  describe('isHighPriorityRecovery', () => {
    it('should return true when failStreak >= 3', () => {
      expect(isHighPriorityRecovery({ ...baseItem, failStreak: 3 })).toBe(true);
      expect(isHighPriorityRecovery({ ...baseItem, failStreak: 5 })).toBe(true);
    });

    it('should return false when failStreak < 3', () => {
      expect(isHighPriorityRecovery({ ...baseItem, failStreak: 0 })).toBe(false);
      expect(isHighPriorityRecovery({ ...baseItem, failStreak: 2 })).toBe(false);
    });
  });

  describe('canSubmitPass', () => {
    it('should allow pass when lastSubmittedDate is null', () => {
      expect(canSubmitPass(baseItem, '2025-01-10')).toBe(true);
    });

    it('should allow pass when lastSubmittedDate is a different day', () => {
      const item = { ...baseItem, lastSubmittedDate: '2025-01-09' };
      expect(canSubmitPass(item, '2025-01-10')).toBe(true);
    });

    it('should reject pass when lastSubmittedDate is today', () => {
      const item = { ...baseItem, lastSubmittedDate: '2025-01-10' };
      expect(canSubmitPass(item, '2025-01-10')).toBe(false);
    });
  });

  describe('sortDueItems', () => {
    it('should sort by failStreak descending', () => {
      const items = [
        { ...baseItem, topicId: 'a', failStreak: 1, nextDueAt: '2025-01-10', intervalIndex: 0 },
        { ...baseItem, topicId: 'b', failStreak: 3, nextDueAt: '2025-01-10', intervalIndex: 0 },
      ];
      const sorted = sortDueItems(items);
      expect(sorted[0].topicId).toBe('b');
      expect(sorted[1].topicId).toBe('a');
    });

    it('should sort by nextDueAt ascending when failStreak is equal', () => {
      const items = [
        { ...baseItem, topicId: 'a', failStreak: 2, nextDueAt: '2025-01-12', intervalIndex: 0 },
        { ...baseItem, topicId: 'b', failStreak: 2, nextDueAt: '2025-01-10', intervalIndex: 0 },
      ];
      const sorted = sortDueItems(items);
      expect(sorted[0].topicId).toBe('b');
      expect(sorted[1].topicId).toBe('a');
    });

    it('should sort by intervalIndex ascending as final tiebreaker', () => {
      const items = [
        { ...baseItem, topicId: 'a', failStreak: 2, nextDueAt: '2025-01-10', intervalIndex: 3 },
        { ...baseItem, topicId: 'b', failStreak: 2, nextDueAt: '2025-01-10', intervalIndex: 1 },
      ];
      const sorted = sortDueItems(items);
      expect(sorted[0].topicId).toBe('b');
      expect(sorted[1].topicId).toBe('a');
    });

    it('should not mutate the input array', () => {
      const items = [
        { ...baseItem, topicId: 'a', failStreak: 0 },
        { ...baseItem, topicId: 'b', failStreak: 2 },
      ];
      const original = [...items];
      sortDueItems(items);
      expect(items).toEqual(original);
    });
  });

  describe('trimToCapacity', () => {
    it('should keep all items when capacity is sufficient', () => {
      const items = [
        { ...baseItem, topicId: 'a' },
        { ...baseItem, topicId: 'b' },
      ];
      const result = trimToCapacity(items, 30, 10);
      expect(result.kept).toHaveLength(2);
      expect(result.deferred).toHaveLength(0);
    });

    it('should defer items beyond capacity', () => {
      const items = [
        { ...baseItem, topicId: 'a', nextDueAt: '2025-01-10' },
        { ...baseItem, topicId: 'b', nextDueAt: '2025-01-10' },
        { ...baseItem, topicId: 'c', nextDueAt: '2025-01-10' },
      ];
      const result = trimToCapacity(items, 20, 10);
      expect(result.kept).toHaveLength(2);
      expect(result.deferred).toHaveLength(1);
      expect(result.deferred[0].topicId).toBe('c');
      expect(result.deferred[0].nextDueAt).toBe('2025-01-11'); // +1 day
    });

    it('should keep all items when minutesPerItem is 0', () => {
      const items = [
        { ...baseItem, topicId: 'a' },
        { ...baseItem, topicId: 'b' },
      ];
      const result = trimToCapacity(items, 0, 0);
      expect(result.kept).toHaveLength(2);
      expect(result.deferred).toHaveLength(0);
    });
  });

  describe('checkStaleness', () => {
    it('should return isStale: true when >= 7 days overdue', () => {
      const item = { ...baseItem, nextDueAt: '2025-01-01' };
      const result = checkStaleness(item, '2025-01-08');
      expect(result.isStale).toBe(true);
      expect(result.daysSinceDue).toBe(7);
    });

    it('should return isStale: false when < 7 days overdue', () => {
      const item = { ...baseItem, nextDueAt: '2025-01-05' };
      const result = checkStaleness(item, '2025-01-08');
      expect(result.isStale).toBe(false);
      expect(result.daysSinceDue).toBe(3);
    });

    it('should return isStale: false when item is not yet due', () => {
      const item = { ...baseItem, nextDueAt: '2025-01-15' };
      const result = checkStaleness(item, '2025-01-08');
      expect(result.isStale).toBe(false);
      expect(result.daysSinceDue).toBe(-7);
    });

    it('should return isStale: true for large overdue', () => {
      const item = { ...baseItem, nextDueAt: '2025-01-01' };
      const result = checkStaleness(item, '2025-02-01');
      expect(result.isStale).toBe(true);
      expect(result.daysSinceDue).toBe(31);
    });
  });
});

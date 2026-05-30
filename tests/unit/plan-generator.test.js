import { describe, it, expect } from 'vitest';
import {
  generateDailyPlan,
  computeCoreRatio,
  isRecoveryDay,
  prioritizeAndTrim,
  estimateTaskMinutes,
} from '../../src/domain/plan-generator.js';

describe('plan-generator', () => {
  describe('isRecoveryDay', () => {
    it('returns false for 0 missed days', () => {
      expect(isRecoveryDay(0)).toBe(false);
    });

    it('returns false for 1 missed day', () => {
      expect(isRecoveryDay(1)).toBe(false);
    });

    it('returns true for 2 missed days', () => {
      expect(isRecoveryDay(2)).toBe(true);
    });

    it('returns true for 5 missed days', () => {
      expect(isRecoveryDay(5)).toBe(true);
    });
  });

  describe('estimateTaskMinutes', () => {
    it('returns median when topic has >= 3 records', () => {
      const history = new Map([
        ['topic-1', { records: [{ minutes: 20 }, { minutes: 40 }, { minutes: 30 }], baseline: 25 }],
      ]);
      expect(estimateTaskMinutes('topic-1', history)).toBe(30);
    });

    it('returns baseline when topic has < 3 records', () => {
      const history = new Map([
        ['topic-1', { records: [{ minutes: 20 }, { minutes: 40 }], baseline: 25 }],
      ]);
      expect(estimateTaskMinutes('topic-1', history)).toBe(25);
    });

    it('returns 30 as fallback when topic not in history', () => {
      const history = new Map();
      expect(estimateTaskMinutes('unknown', history)).toBe(30);
    });

    it('returns median for even number of records', () => {
      const history = new Map([
        ['topic-1', { records: [{ minutes: 10 }, { minutes: 20 }, { minutes: 30 }, { minutes: 40 }], baseline: 15 }],
      ]);
      // median of [10,20,30,40] = (20+30)/2 = 25
      expect(estimateTaskMinutes('topic-1', history)).toBe(25);
    });
  });

  describe('computeCoreRatio', () => {
    it('returns 1 for empty tasks', () => {
      expect(computeCoreRatio([])).toBe(1);
    });

    it('returns 1 for all core tasks', () => {
      const tasks = [
        { subject: 'math', estimatedMinutes: 60 },
        { subject: '408', estimatedMinutes: 40 },
      ];
      expect(computeCoreRatio(tasks)).toBe(1);
    });

    it('returns 0 for all non-core tasks', () => {
      const tasks = [
        { subject: 'english', estimatedMinutes: 30 },
        { subject: 'politics', estimatedMinutes: 30 },
      ];
      expect(computeCoreRatio(tasks)).toBe(0);
    });

    it('computes correct ratio for mixed tasks', () => {
      const tasks = [
        { subject: 'math', estimatedMinutes: 60 },
        { subject: 'english', estimatedMinutes: 40 },
      ];
      expect(computeCoreRatio(tasks)).toBe(0.6);
    });
  });

  describe('prioritizeAndTrim', () => {
    it('returns empty for empty tasks', () => {
      expect(prioritizeAndTrim([], 100)).toEqual([]);
    });

    it('returns empty for zero budget', () => {
      const tasks = [{ priority: 1, estimatedMinutes: 30 }];
      expect(prioritizeAndTrim(tasks, 0)).toEqual([]);
    });

    it('trims tasks that exceed budget', () => {
      const tasks = [
        { id: 'a', priority: 1, estimatedMinutes: 30 },
        { id: 'b', priority: 2, estimatedMinutes: 30 },
        { id: 'c', priority: 3, estimatedMinutes: 30 },
      ];
      const result = prioritizeAndTrim(tasks, 55);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('a');
    });

    it('keeps higher priority tasks over lower priority', () => {
      const tasks = [
        { id: 'low', priority: 5, estimatedMinutes: 20 },
        { id: 'high', priority: 1, estimatedMinutes: 20 },
        { id: 'mid', priority: 3, estimatedMinutes: 20 },
      ];
      const result = prioritizeAndTrim(tasks, 40);
      expect(result.map(t => t.id)).toEqual(['high', 'mid']);
    });
  });

  describe('generateDailyPlan', () => {
    const baseInput = {
      availableMinutes: 120,
      phase: 'foundation',
      blockedTopics: [],
      dueReviews: [],
      historyMedian: { taskCount: 10, minutes: 180 },
      consecutiveMissedDays: 0,
      topicHistory: new Map(),
      candidateTopics: [],
    };

    it('generates recovery plan when consecutiveMissedDays >= 2', () => {
      const input = {
        ...baseInput,
        consecutiveMissedDays: 3,
        candidateTopics: [
          { topicId: 't1', subject: 'math', isCore: true, estimatedMinutes: 30, priority: 2 },
          { topicId: 't2', subject: 'english', isCore: false, estimatedMinutes: 30, priority: 4 },
        ],
      };
      const plan = generateDailyPlan(input);
      // Recovery: only core subjects
      for (const task of plan) {
        expect(['math', '408']).toContain(task.subject);
        expect(task.isRecovery).toBe(true);
      }
    });

    it('recovery plan total minutes <= 60% of history median', () => {
      const input = {
        ...baseInput,
        consecutiveMissedDays: 2,
        historyMedian: { taskCount: 10, minutes: 100 },
        candidateTopics: [
          { topicId: 't1', subject: 'math', isCore: true, estimatedMinutes: 30, priority: 2 },
          { topicId: 't2', subject: 'math', isCore: true, estimatedMinutes: 30, priority: 2 },
          { topicId: 't3', subject: '408', isCore: true, estimatedMinutes: 30, priority: 2 },
        ],
      };
      const plan = generateDailyPlan(input);
      const totalMins = plan.reduce((s, t) => s + t.estimatedMinutes, 0);
      expect(totalMins).toBeLessThanOrEqual(60); // 60% of 100
    });

    it('filters out blocked topics for reinforcement/pastExam tasks', () => {
      const input = {
        ...baseInput,
        blockedTopics: ['blocked-topic'],
        candidateTopics: [
          { topicId: 'blocked-topic', subject: 'math', isCore: true, phase: 'reinforcement', estimatedMinutes: 30, priority: 2 },
          { topicId: 'ok-topic', subject: 'math', isCore: true, phase: 'foundation', estimatedMinutes: 30, priority: 2 },
        ],
      };
      const plan = generateDailyPlan(input);
      const topicIds = plan.map(t => t.topicId);
      expect(topicIds).not.toContain('blocked-topic');
      expect(topicIds).toContain('ok-topic');
    });

    it('enforces core ratio >= 0.55 for foundation phase', () => {
      const input = {
        ...baseInput,
        phase: 'foundation',
        availableMinutes: 300,
        candidateTopics: [
          { topicId: 't1', subject: 'math', isCore: true, estimatedMinutes: 60, priority: 2 },
          { topicId: 't2', subject: 'english', isCore: false, estimatedMinutes: 40, priority: 4 },
          { topicId: 't3', subject: '408', isCore: true, estimatedMinutes: 60, priority: 2 },
        ],
      };
      const plan = generateDailyPlan(input);
      const ratio = computeCoreRatio(plan);
      expect(ratio).toBeGreaterThanOrEqual(0.55);
    });

    it('enforces volume cap based on 7-day median', () => {
      const input = {
        ...baseInput,
        availableMinutes: 600,
        historyMedian: { taskCount: 4, minutes: 200 },
        candidateTopics: Array.from({ length: 10 }, (_, i) => ({
          topicId: `t${i}`,
          subject: 'math',
          isCore: true,
          estimatedMinutes: 20,
          priority: 2,
        })),
      };
      const plan = generateDailyPlan(input);
      const maxTasks = Math.ceil(4 * 1.15); // 5
      expect(plan.length).toBeLessThanOrEqual(maxTasks);
    });

    it('includes due reviews with highest priority', () => {
      const input = {
        ...baseInput,
        availableMinutes: 60,
        dueReviews: [
          { topicId: 'r1', subject: 'math', estimatedMinutes: 20 },
        ],
        candidateTopics: [
          { topicId: 't1', subject: 'english', isCore: false, estimatedMinutes: 20, priority: 4 },
          { topicId: 't2', subject: 'politics', isCore: false, estimatedMinutes: 20, priority: 5 },
        ],
      };
      const plan = generateDailyPlan(input);
      // review should be first due to priority 1
      expect(plan[0].topicId).toBe('r1');
    });
  });
});

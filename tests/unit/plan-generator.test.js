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

    it('ignores malformed history records before computing the median', () => {
      const history = new Map([
        ['topic-1', {
          records: [
            { minutes: '20' },
            { minutes: Number.POSITIVE_INFINITY },
            { minutes: -5 },
            { minutes: 40 },
            { minutes: 'bad' },
            { minutes: 60 },
          ],
          baseline: 25,
        }],
      ]);

      expect(estimateTaskMinutes('topic-1', history)).toBe(40);
    });

    it('falls back when topic history is missing or malformed', () => {
      const history = new Map([
        ['topic-1', {
          records: [{ minutes: 'bad' }, { minutes: Number.POSITIVE_INFINITY }, { minutes: -10 }],
          baseline: '35',
        }],
      ]);

      expect(estimateTaskMinutes('topic-1', history)).toBe(35);
      expect(estimateTaskMinutes('topic-1', { bad: 'shape' })).toBe(30);
    });

    it('rejects object-coerced history minutes and baselines', () => {
      const history = new Map([
        ['topic-1', {
          records: [{ minutes: { valueOf: () => 20 } }, { minutes: { valueOf: () => 40 } }],
          baseline: { valueOf: () => 35 },
        }],
      ]);

      expect(estimateTaskMinutes('topic-1', history)).toBe(30);
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

    it('sanitizes malformed minutes while computing the ratio', () => {
      const tasks = [
        { subject: 'math', estimatedMinutes: '60' },
        { subject: 'english', estimatedMinutes: '40' },
        { subject: '408', estimatedMinutes: Number.POSITIVE_INFINITY },
        { subject: 'politics', estimatedMinutes: -10 },
      ];

      expect(computeCoreRatio(tasks)).toBe(0.6);
    });

    it('rejects object-coerced minutes while computing the ratio', () => {
      const tasks = [
        { subject: 'math', estimatedMinutes: { valueOf: () => 60 } },
        { subject: 'english', estimatedMinutes: 40 },
      ];

      expect(computeCoreRatio(tasks)).toBe(0);
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

    it('rejects malformed budgets instead of forcing a task into the plan', () => {
      const tasks = [{ id: 'a', priority: 1, estimatedMinutes: 30 }];
      expect(prioritizeAndTrim(tasks, 'bad')).toEqual([]);
      expect(prioritizeAndTrim(tasks, Number.POSITIVE_INFINITY)).toEqual([]);
    });

    it('does not let malformed priority or minutes bypass budget trimming', () => {
      const tasks = [
        { id: 'bad', priority: Number.NEGATIVE_INFINITY, estimatedMinutes: -10 },
        { id: 'good', priority: '2', estimatedMinutes: '30' },
      ];

      const result = prioritizeAndTrim(tasks, 30);
      expect(result.map(t => t.id)).toEqual(['good']);
    });

    it('rejects object-coerced budgets, priorities, and minutes', () => {
      const tasks = [
        { id: 'object-priority', priority: { valueOf: () => 1 }, estimatedMinutes: 20 },
        { id: 'object-minutes', priority: 1, estimatedMinutes: { valueOf: () => 10 } },
        { id: 'good', priority: 2, estimatedMinutes: 20 },
      ];

      expect(prioritizeAndTrim(tasks, { valueOf: () => 40 })).toEqual([]);
      expect(prioritizeAndTrim(tasks, 20).map(t => t.id)).toEqual(['good']);
    });

    it('skips non-object tasks while trimming', () => {
      expect(prioritizeAndTrim(['bad-task', ['bad-array'], null], 90)).toEqual([]);

      const result = prioritizeAndTrim([
        'bad-task',
        { id: 'good', priority: 1, estimatedMinutes: 30 },
        ['bad-array'],
      ], 90);
      expect(result.map(t => t.id)).toEqual(['good']);
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

    it('does not trigger recovery mode for malformed missed-day values', () => {
      expect(isRecoveryDay('bad')).toBe(false);
      expect(isRecoveryDay(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isRecoveryDay(-1)).toBe(false);
      expect(isRecoveryDay('2')).toBe(true);
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

    it('handles missing input and malformed planning data safely', () => {
      expect(generateDailyPlan()).toEqual([]);

      const topicHistory = new Map([
        ['review-1', {
          records: [{ minutes: '20' }, { minutes: 'bad' }, { minutes: 40 }, { minutes: 60 }],
          baseline: 35,
        }],
      ]);
      const input = {
        availableMinutes: '90',
        phase: 'constructor',
        consecutiveMissedDays: Number.POSITIVE_INFINITY,
        blockedTopics: [{ topicId: 'blocked-topic' }, null],
        dueReviews: [
          'bad-review',
          ['bad-review-array'],
          null,
          { topicId: 'review-1', subject: 'math', estimatedMinutes: 'bad' },
        ],
        historyMedian: { taskCount: Number.POSITIVE_INFINITY, minutes: Number.NaN },
        topicHistory,
        candidateTopics: [
          'bad-candidate',
          ['bad-candidate-array'],
          null,
          { topicId: 'blocked-topic', subject: 'math', phase: 'reinforcement', estimatedMinutes: 30, priority: 1 },
          { topicId: 'topic-1', subject: 'english', estimatedMinutes: Number.NEGATIVE_INFINITY, priority: Number.NEGATIVE_INFINITY },
        ],
      };

      const plan = generateDailyPlan(input);
      expect(plan.map(t => t.topicId)).toEqual(['review-1']);
      expect(plan[0].estimatedMinutes).toBe(40);
      expect(plan[0].isRecovery).toBe(false);
      expect(plan.every(t => Number.isFinite(t.estimatedMinutes) && t.estimatedMinutes > 0)).toBe(true);
    });

    it('sanitizes non-scalar text fields on returned plan tasks', () => {
      const input = {
        ...baseInput,
        availableMinutes: 90,
        dueReviews: [
          {
            topicId: { bad: true },
            subject: { bad: true },
            phase: { bad: true },
            category: { bad: true },
            estimatedMinutes: 20,
          },
        ],
        candidateTopics: [
          {
            topicId: 'object-subject',
            subject: { bad: true },
            phase: { bad: true },
            category: { bad: true },
            estimatedMinutes: 20,
          },
          { topicId: 42, subject: 'english', phase: 'foundation', estimatedMinutes: 20 },
        ],
      };

      const plan = generateDailyPlan(input);
      const objectSubjectTask = plan.find(t => t.topicId === 'object-subject');
      const numericIdTask = plan.find(t => t.topicId === '42');

      expect(plan).toHaveLength(3);
      expect(plan[0].topicId).toBe('');
      expect(plan[0].subject).toBe('');
      expect(plan[0].category).toBe('review');
      expect(objectSubjectTask.subject).toBe('');
      expect(objectSubjectTask.phase).toBe('');
      expect(objectSubjectTask.category).toBe('');
      expect(numericIdTask.subject).toBe('english');

      for (const task of plan) {
        for (const key of ['topicId', 'subject', 'phase', 'category']) {
          expect(typeof task[key]).not.toBe('object');
          expect(typeof task[key]).not.toBe('function');
        }
      }
    });

    it('requires a real boolean isCore flag for recovery candidates', () => {
      const input = {
        ...baseInput,
        availableMinutes: 100,
        consecutiveMissedDays: 2,
        historyMedian: { taskCount: 10, minutes: 100 },
        candidateTopics: [
          { topicId: 'string-core', subject: 'math', isCore: 'true', estimatedMinutes: 20, priority: 1 },
          { topicId: 'real-core', subject: 'math', isCore: true, estimatedMinutes: 20, priority: 2 },
        ],
      };

      const plan = generateDailyPlan(input);
      expect(plan.map(t => t.topicId)).toEqual(['real-core']);
      expect(plan[0].isCore).toBe(true);
    });

    it('uses available minutes when recovery median minutes are malformed', () => {
      const input = {
        ...baseInput,
        availableMinutes: 100,
        consecutiveMissedDays: '2',
        historyMedian: { taskCount: 10, minutes: Number.POSITIVE_INFINITY },
        candidateTopics: [
          { topicId: 't1', subject: 'math', isCore: true, estimatedMinutes: 30, priority: 2 },
          { topicId: 't2', subject: 'math', isCore: true, estimatedMinutes: 40, priority: 2 },
          { topicId: 't3', subject: '408', isCore: true, estimatedMinutes: 50, priority: 2 },
        ],
      };

      const plan = generateDailyPlan(input);
      const totalMins = plan.reduce((sum, task) => sum + task.estimatedMinutes, 0);
      expect(totalMins).toBeLessThanOrEqual(60);
      expect(plan.every(task => task.isRecovery)).toBe(true);
    });
  });
});

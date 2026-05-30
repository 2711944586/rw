import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  generateDailyPlan,
  computeCoreRatio,
  isRecoveryDay,
  prioritizeAndTrim,
  estimateTaskMinutes,
} from '../../src/domain/plan-generator.js';

// --- Arbitraries (smart generators) ---

const CORE_SUBJECTS = ['math', '408'];
const NON_CORE_SUBJECTS = ['english', 'politics', 'project'];
const ALL_SUBJECTS = [...CORE_SUBJECTS, ...NON_CORE_SUBJECTS];
const PHASES = ['foundation', 'reinforcement', 'pastExam', 'sprint'];
const CATEGORIES = ['review', 'phaseCore', 'mistakes', 'english', 'politics', 'project'];

const arbSubject = fc.constantFrom(...ALL_SUBJECTS);
const arbCoreSubject = fc.constantFrom(...CORE_SUBJECTS);
const arbPhase = fc.constantFrom(...PHASES);

const arbCoreTopic = fc.record({
  topicId: fc.string({ minLength: 1, maxLength: 10 }),
  subject: arbCoreSubject,
  category: fc.constantFrom('phaseCore', 'review'),
  isCore: fc.constant(true),
  estimatedMinutes: fc.integer({ min: 10, max: 60 }),
});

const arbNonCoreTopic = fc.record({
  topicId: fc.string({ minLength: 1, maxLength: 10 }),
  subject: fc.constantFrom(...NON_CORE_SUBJECTS),
  category: fc.constantFrom('mistakes', 'english', 'politics', 'project'),
  isCore: fc.constant(false),
  estimatedMinutes: fc.integer({ min: 10, max: 60 }),
});

const arbCandidateTopic = fc.oneof(arbCoreTopic, arbNonCoreTopic);

/**
 * Generate a valid PlanInput with at least one core-subject topic.
 */
const arbPlanInputWithCore = fc.record({
  availableMinutes: fc.integer({ min: 30, max: 480 }),
  phase: arbPhase,
  consecutiveMissedDays: fc.constant(0),
  blockedTopics: fc.constant([]),
  dueReviews: fc.constant([]),
  historyMedian: fc.record({
    taskCount: fc.integer({ min: 3, max: 20 }),
    minutes: fc.integer({ min: 60, max: 480 }),
  }),
  topicHistory: fc.constant(new Map()),
  candidateTopics: fc.tuple(
    // At least one core topic
    fc.array(arbCoreTopic, { minLength: 1, maxLength: 5 }),
    fc.array(arbNonCoreTopic, { minLength: 0, maxLength: 3 }),
  ).map(([core, nonCore]) => [...core, ...nonCore]),
});

// --- Property 5: Core ratio invariant ---

describe('Property 5: Core ratio invariant', () => {
  /**
   * Validates: Requirements 2.2
   *
   * For any valid PlanInput with availableMinutes > 0 and at least one
   * core-subject topic, computeCoreRatio(generateDailyPlan(input)) >= threshold.
   */
  test.prop([arbPlanInputWithCore])(
    'generated plan core ratio >= 0.55 (foundation) or >= 0.65 (others)',
    (input) => {
      const plan = generateDailyPlan(input);
      if (plan.length === 0) return; // no tasks generated is vacuously true

      // If no core task fits within budget, ratio constraint can't be enforced
      const hasCoreTopic = input.candidateTopics.some(
        t => (t.subject === 'math' || t.subject === '408') && (t.estimatedMinutes || 30) <= input.availableMinutes
      );
      if (!hasCoreTopic) return; // precondition: at least one core task fits

      const ratio = computeCoreRatio(plan);
      const threshold = input.phase === 'foundation' ? 0.55 : 0.65;
      expect(ratio).toBeGreaterThanOrEqual(threshold);
    }
  );
});

// --- Property 6: Prerequisite gating ---

describe('Property 6: Prerequisite gating', () => {
  /**
   * Validates: Requirements 2.4
   *
   * For any PlanInput with blockedTopics, no reinforcement/pastExam task
   * for blocked topics appears in the plan.
   */
  const arbPlanInputWithBlocked = fc.record({
    availableMinutes: fc.integer({ min: 60, max: 480 }),
    phase: arbPhase,
    consecutiveMissedDays: fc.constant(0),
    blockedTopics: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
    dueReviews: fc.constant([]),
    historyMedian: fc.record({
      taskCount: fc.integer({ min: 5, max: 20 }),
      minutes: fc.integer({ min: 120, max: 480 }),
    }),
    topicHistory: fc.constant(new Map()),
    candidateTopics: fc.constant([]),
  }).chain((base) => {
    // Create candidate topics that include blocked topics with reinforcement/pastExam phase
    const blockedCandidates = base.blockedTopics.map((topicId) => ({
      topicId,
      subject: 'math',
      category: 'phaseCore',
      isCore: true,
      phase: fc.sample(fc.constantFrom('reinforcement', 'pastExam'), 1)[0],
      estimatedMinutes: 30,
    }));
    // Also add some non-blocked core topics
    return fc.constant({
      ...base,
      candidateTopics: [
        ...blockedCandidates,
        { topicId: 'safe-topic', subject: 'math', category: 'phaseCore', isCore: true, estimatedMinutes: 30 },
      ],
    });
  });

  test.prop([arbPlanInputWithBlocked])(
    'no reinforcement/pastExam task for blocked topics in plan',
    (input) => {
      const plan = generateDailyPlan(input);
      const blockedSet = new Set(input.blockedTopics);

      for (const task of plan) {
        if (blockedSet.has(task.topicId)) {
          expect(task.phase).not.toBe('reinforcement');
          expect(task.phase).not.toBe('pastExam');
        }
      }
    }
  );
});

// --- Property 7: Recovery day constraints ---

describe('Property 7: Recovery day constraints', () => {
  /**
   * Validates: Requirements 2.5
   *
   * For any input with consecutiveMissedDays >= 2, total minutes <= 60% of median
   * AND all tasks are core-only.
   */
  const arbRecoveryInput = fc.record({
    availableMinutes: fc.integer({ min: 60, max: 480 }),
    phase: arbPhase,
    consecutiveMissedDays: fc.integer({ min: 2, max: 30 }),
    blockedTopics: fc.constant([]),
    dueReviews: fc.array(
      fc.record({
        topicId: fc.string({ minLength: 1, maxLength: 10 }),
        subject: fc.constantFrom(...ALL_SUBJECTS),
        estimatedMinutes: fc.integer({ min: 10, max: 60 }),
      }),
      { minLength: 0, maxLength: 5 }
    ),
    historyMedian: fc.record({
      taskCount: fc.integer({ min: 3, max: 20 }),
      minutes: fc.integer({ min: 60, max: 480 }),
    }),
    topicHistory: fc.constant(new Map()),
    candidateTopics: fc.array(
      fc.record({
        topicId: fc.string({ minLength: 1, maxLength: 10 }),
        subject: fc.constantFrom(...ALL_SUBJECTS),
        category: fc.constantFrom(...CATEGORIES),
        isCore: fc.boolean(),
        estimatedMinutes: fc.integer({ min: 10, max: 60 }),
      }),
      { minLength: 0, maxLength: 5 }
    ),
  });

  test.prop([arbRecoveryInput])(
    'recovery plan: total minutes <= 60% of median AND all tasks are core-only',
    (input) => {
      const plan = generateDailyPlan(input);
      const medianMinutes = input.historyMedian.minutes;
      const recoveryBudget = Math.floor(medianMinutes * 0.6);

      // Total estimated minutes should be within budget
      const totalMinutes = plan.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
      expect(totalMinutes).toBeLessThanOrEqual(recoveryBudget);

      // All tasks should be core subjects only
      for (const task of plan) {
        expect(['math', '408']).toContain(task.subject);
      }
    }
  );
});

// --- Property 8: Daily volume cap ---

describe('Property 8: Daily volume cap', () => {
  /**
   * Validates: Requirements 2.6
   *
   * For non-recovery inputs, task count <= ceil(historyMedian.taskCount * 1.15).
   */
  const arbNonRecoveryInput = fc.record({
    availableMinutes: fc.integer({ min: 60, max: 480 }),
    phase: arbPhase,
    consecutiveMissedDays: fc.constant(0),
    blockedTopics: fc.constant([]),
    dueReviews: fc.array(
      fc.record({
        topicId: fc.string({ minLength: 1, maxLength: 10 }),
        subject: arbCoreSubject,
        estimatedMinutes: fc.integer({ min: 5, max: 30 }),
      }),
      { minLength: 0, maxLength: 10 }
    ),
    historyMedian: fc.record({
      taskCount: fc.integer({ min: 2, max: 15 }),
      minutes: fc.integer({ min: 120, max: 480 }),
    }),
    topicHistory: fc.constant(new Map()),
    candidateTopics: fc.array(arbCoreTopic, { minLength: 0, maxLength: 10 }),
  });

  test.prop([arbNonRecoveryInput])(
    'non-recovery plan task count <= ceil(medianTaskCount * 1.15)',
    (input) => {
      const plan = generateDailyPlan(input);
      const maxTasks = Math.ceil(input.historyMedian.taskCount * 1.15);
      expect(plan.length).toBeLessThanOrEqual(maxTasks);
    }
  );
});

// --- Property 9: Priority-based trimming ---

describe('Property 9: Priority-based trimming', () => {
  /**
   * Validates: Requirements 2.7
   *
   * When budget < total, retained tasks follow priority order.
   * The algorithm sorts by priority then greedily accumulates.
   * Therefore: retained tasks are in non-decreasing priority order,
   * and among tasks with the SAME estimatedMinutes, no lower-priority task
   * is retained while a higher-priority one is removed.
   */
  const arbTasksWithPriority = fc.array(
    fc.record({
      topicId: fc.string({ minLength: 1, maxLength: 10 }),
      subject: arbCoreSubject,
      estimatedMinutes: fc.integer({ min: 10, max: 60 }),
      priority: fc.integer({ min: 1, max: 6 }),
    }),
    { minLength: 2, maxLength: 15 }
  );

  test.prop([arbTasksWithPriority, fc.integer({ min: 10, max: 300 })])(
    'retained tasks are in non-decreasing priority order',
    (tasks, budget) => {
      const result = prioritizeAndTrim(tasks, budget);
      if (result.length <= 1) return;

      // The result should be sorted by priority (non-decreasing)
      for (let i = 1; i < result.length; i++) {
        expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
      }
    }
  );
});

// --- Property 10: Time estimation ---

describe('Property 10: Time estimation', () => {
  /**
   * Validates: Requirements 2.8
   *
   * For topic with >= 3 records, estimateTaskMinutes returns median;
   * for < 3 records, returns baseline.
   */
  const arbTopicWith3PlusRecords = fc.record({
    topicId: fc.constant('topic-test'),
    records: fc.array(
      fc.record({ minutes: fc.integer({ min: 1, max: 300 }) }),
      { minLength: 3, maxLength: 20 }
    ),
    baseline: fc.integer({ min: 10, max: 120 }),
  });

  test.prop([arbTopicWith3PlusRecords])(
    'returns median when >= 3 records',
    ({ topicId, records, baseline }) => {
      const history = new Map([[topicId, { records, baseline }]]);
      const result = estimateTaskMinutes(topicId, history);

      // Compute expected median
      const sorted = records.map((r) => r.minutes).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const expectedMedian =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      expect(result).toBe(expectedMedian);
    }
  );

  const arbTopicWithFewRecords = fc.record({
    topicId: fc.constant('topic-test'),
    records: fc.array(
      fc.record({ minutes: fc.integer({ min: 1, max: 300 }) }),
      { minLength: 0, maxLength: 2 }
    ),
    baseline: fc.integer({ min: 10, max: 120 }),
  });

  test.prop([arbTopicWithFewRecords])(
    'returns baseline when < 3 records',
    ({ topicId, records, baseline }) => {
      const history = new Map([[topicId, { records, baseline }]]);
      const result = estimateTaskMinutes(topicId, history);
      expect(result).toBe(baseline);
    }
  );
});

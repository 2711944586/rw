/**
 * Plan Generator Module
 *
 * Pure functions for daily plan generation with prerequisite gating,
 * phase-based ordering, recovery day logic, core ratio enforcement,
 * and volume capping.
 *
 * No side effects, no DOM, no Supabase calls.
 */

/** Core subjects for ratio computation */
const CORE_SUBJECTS = new Set(['math', '408']);

/** Priority tiers (lower number = higher priority) */
const PRIORITY_TIERS = {
  review: 1,
  phaseCore: 2,
  mistakes: 3,
  english: 4,
  politics: 5,
  project: 6,
};

/**
 * Determine if today should be a recovery day.
 * Recovery is triggered when consecutiveMissedDays >= 2.
 *
 * @param {number} consecutiveMissedDays - Days since last study record
 * @returns {boolean}
 *
 * Validates: Requirements 2.5
 */
export function isRecoveryDay(consecutiveMissedDays) {
  return consecutiveMissedDays >= 2;
}

/**
 * Estimate minutes for a topic based on historical records.
 * If topic has >= 3 records, returns the median. Otherwise returns baseline.
 *
 * @param {string} topicId - The topic identifier
 * @param {Map} topicHistory - Map of topicId → { records: [{minutes}], baseline }
 * @returns {number} Estimated minutes
 *
 * Validates: Requirements 2.8
 */
export function estimateTaskMinutes(topicId, topicHistory) {
  const entry = topicHistory.get(topicId);
  if (!entry) return 30; // fallback default

  const records = entry.records || [];
  if (records.length >= 3) {
    const sorted = records.map(r => r.minutes).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  return entry.baseline || 30;
}

/**
 * Compute the core ratio of a set of tasks.
 * Core ratio = sum of estimated minutes for core-subject tasks / total minutes.
 *
 * @param {Array} tasks - Array of task objects with { subject, estimatedMinutes }
 * @returns {number} Ratio between 0 and 1 (returns 1 if no tasks)
 *
 * Validates: Requirements 2.2
 */
export function computeCoreRatio(tasks) {
  if (!tasks || tasks.length === 0) return 1;

  let totalMinutes = 0;
  let coreMinutes = 0;

  for (const task of tasks) {
    const mins = task.estimatedMinutes || 0;
    totalMinutes += mins;
    if (CORE_SUBJECTS.has(task.subject)) {
      coreMinutes += mins;
    }
  }

  if (totalMinutes === 0) return 1;
  return coreMinutes / totalMinutes;
}

/**
 * Get the minimum core ratio threshold for a given phase.
 *
 * @param {string} phase - 'foundation' | 'reinforcement' | 'pastExam' | 'sprint'
 * @returns {number} Minimum core ratio
 */
function getCoreRatioThreshold(phase) {
  return phase === 'foundation' ? 0.55 : 0.65;
}

/**
 * Assign a priority tier number to a candidate task based on its category.
 *
 * @param {Object} candidate - Task candidate
 * @returns {number} Priority tier (lower = higher priority)
 */
function assignPriority(candidate) {
  if (candidate.priority !== undefined) return candidate.priority;

  if (candidate.category === 'review') return PRIORITY_TIERS.review;
  if (candidate.category === 'phaseCore') return PRIORITY_TIERS.phaseCore;
  if (candidate.category === 'mistakes') return PRIORITY_TIERS.mistakes;

  const subj = (candidate.subject || '').toLowerCase();
  if (subj === 'english') return PRIORITY_TIERS.english;
  if (subj === 'politics') return PRIORITY_TIERS.politics;
  if (subj === 'project') return PRIORITY_TIERS.project;

  return PRIORITY_TIERS.phaseCore;
}

/**
 * Enforce the core ratio invariant by removing lowest-priority non-core tasks.
 * Mutates nothing; returns a new filtered array.
 *
 * If no core-subject tasks exist in the candidates, the ratio constraint
 * is relaxed (you can't enforce 65% core if there are no core tasks available).
 *
 * @param {Array} tasks - Tasks with estimatedMinutes, subject, priority
 * @param {string} phase - Current study phase
 * @returns {Array} Tasks with core ratio >= threshold (when possible)
 */
function enforceCoreRatio(tasks, phase) {
  const threshold = getCoreRatioThreshold(phase);
  let result = [...tasks];

  // If there are no core tasks at all, we can't enforce the ratio — return as-is
  const hasCoreTask = result.some(t => CORE_SUBJECTS.has(t.subject));
  if (!hasCoreTask) return result;

  let ratio = computeCoreRatio(result);
  if (ratio >= threshold) return result;

  // Collect non-core tasks sorted by priority descending (lowest priority = highest number removed first)
  const nonCoreTasks = result
    .filter(t => !CORE_SUBJECTS.has(t.subject))
    .sort((a, b) => (b.priority || 99) - (a.priority || 99));

  for (const taskToRemove of nonCoreTasks) {
    result = result.filter(t => t !== taskToRemove);
    ratio = computeCoreRatio(result);
    if (ratio >= threshold) break;
  }

  // If still not meeting threshold after removing all non-core, return what we have
  return result;
}

/**
 * Strict version of prioritizeAndTrim that never exceeds the budget.
 * Used for recovery days where the budget is a hard cap.
 *
 * @param {Array} tasks
 * @param {number} budget
 * @returns {Array}
 */
function prioritizeAndTrimStrict(tasks, budget) {
  if (!tasks || tasks.length === 0) return [];
  if (budget <= 0) return [];

  const sorted = [...tasks].sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const result = [];
  let accumulated = 0;

  for (const task of sorted) {
    const mins = task.estimatedMinutes || 0;
    if (accumulated + mins <= budget) {
      result.push(task);
      accumulated += mins;
    }
  }

  return result;
}

/**
 * Prioritize tasks and trim to fit within a time budget.
 * Tasks are sorted by priority (reviews > phase-core > mistakes > english > politics > project).
 * Accumulates tasks until budget is exhausted.
 * If no tasks fit within budget, returns the single highest-priority task anyway
 * (a plan with at least one task is better than an empty plan).
 *
 * @param {Array} tasks - Array of tasks with { priority, estimatedMinutes, ... }
 * @param {number} budget - Available minutes
 * @returns {Array} Trimmed and ordered tasks fitting within budget
 *
 * Validates: Requirements 2.7
 */
export function prioritizeAndTrim(tasks, budget) {
  if (!tasks || tasks.length === 0) return [];
  if (budget <= 0) return [];

  const sorted = [...tasks].sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const result = [];
  let accumulated = 0;

  for (const task of sorted) {
    const mins = task.estimatedMinutes || 0;
    if (accumulated + mins <= budget) {
      result.push(task);
      accumulated += mins;
    }
  }

  // If nothing fits within budget, include at least the highest-priority task
  // so the plan is never empty when candidates exist
  if (result.length === 0 && sorted.length > 0) {
    result.push(sorted[0]);
  }

  return result;
}

/**
 * Generate a recovery day plan.
 * Cap at 60% of 7-day median minutes, core-only low-intensity tasks.
 *
 * @param {Object} input - PlanInput
 * @returns {Array} Recovery plan tasks
 */
function generateRecoveryPlan(input) {
  const medianMinutes = (input.historyMedian && input.historyMedian.minutes) || input.availableMinutes;
  const recoveryBudget = Math.floor(medianMinutes * 0.6);

  // Only include core-subject tasks from due reviews and candidates
  const candidates = [];

  // Add due reviews that are core subjects
  if (input.dueReviews) {
    for (const review of input.dueReviews) {
      if (CORE_SUBJECTS.has(review.subject)) {
        candidates.push({
          ...review,
          priority: PRIORITY_TIERS.review,
          isRecovery: true,
          estimatedMinutes: review.estimatedMinutes || estimateTaskMinutes(review.topicId, input.topicHistory || new Map()),
        });
      }
    }
  }

  // Add core candidate topics
  if (input.candidateTopics) {
    for (const topic of input.candidateTopics) {
      if (CORE_SUBJECTS.has(topic.subject) && topic.isCore) {
        candidates.push({
          ...topic,
          priority: topic.priority || PRIORITY_TIERS.phaseCore,
          isRecovery: true,
          estimatedMinutes: topic.estimatedMinutes || estimateTaskMinutes(topic.topicId, input.topicHistory || new Map()),
        });
      }
    }
  }

  // For recovery plans, strictly respect the budget — don't force tasks that exceed it
  return prioritizeAndTrimStrict(candidates, recoveryBudget);
}

/**
 * Generate a daily study plan based on input parameters.
 *
 * Algorithm:
 * 1. If consecutiveMissedDays >= 2: generate recovery plan
 * 2. Collect candidates: dueReviews, currentPhaseTopics (filter blocked), mistakes, english/politics/project
 * 3. Estimate minutes for each candidate
 * 4. Enforce core ratio invariant
 * 5. Trim to budget
 * 6. Volume cap: task count <= ceil(7dayMedianTaskCount * 1.15)
 *
 * @param {Object} input - PlanInput
 * @param {number} input.availableMinutes - User's available minutes today
 * @param {string} input.phase - 'foundation' | 'reinforcement' | 'pastExam' | 'sprint'
 * @param {Object} [input.quotas] - Per-subject time quotas
 * @param {number} [input.coreRatioTarget] - Minimum core ratio
 * @param {Array} [input.blockedTopics] - Topics with unmet prerequisites
 * @param {Array} [input.dueReviews] - Review items due today
 * @param {Object} [input.historyMedian] - { taskCount, minutes } 7-day median
 * @param {number} [input.consecutiveMissedDays] - Days since last record
 * @param {Map} [input.topicHistory] - Per-topic completion history
 * @param {Array} [input.candidateTopics] - Array of candidate topic objects
 * @returns {Array} Ordered array of PlannedTask objects
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */
export function generateDailyPlan(input) {
  // Step 1: Recovery day check
  if (isRecoveryDay(input.consecutiveMissedDays || 0)) {
    return generateRecoveryPlan(input);
  }

  const topicHistory = input.topicHistory || new Map();
  const blockedSet = new Set((input.blockedTopics || []).map(t => typeof t === 'string' ? t : t.topicId));
  const candidates = [];

  // Step 2a: Due reviews (highest priority)
  if (input.dueReviews) {
    for (const review of input.dueReviews) {
      candidates.push({
        ...review,
        priority: PRIORITY_TIERS.review,
        category: 'review',
        estimatedMinutes: review.estimatedMinutes || estimateTaskMinutes(review.topicId, topicHistory),
        isRecovery: false,
      });
    }
  }

  // Step 2b: Candidate topics (filter out blocked prerequisites)
  if (input.candidateTopics) {
    for (const topic of input.candidateTopics) {
      // Prerequisite gating: skip blocked topics for reinforcement/pastExam tasks
      if (blockedSet.has(topic.topicId) && (topic.phase === 'reinforcement' || topic.phase === 'pastExam')) {
        continue;
      }

      const priority = topic.priority || assignPriority(topic);
      candidates.push({
        ...topic,
        priority,
        estimatedMinutes: topic.estimatedMinutes || estimateTaskMinutes(topic.topicId, topicHistory),
        isRecovery: false,
      });
    }
  }

  // Step 3: Core ratio enforcement (first pass)
  const phase = input.phase || 'foundation';
  let plan = enforceCoreRatio(candidates, phase);

  // Step 4: Trim to budget
  const budget = input.availableMinutes || 0;
  plan = prioritizeAndTrim(plan, budget);

  // Step 4b: Re-enforce core ratio after trimming (trimming may have altered the ratio)
  plan = enforceCoreRatio(plan, phase);

  // Step 5: Volume cap — task count <= ceil(7dayMedianTaskCount * 1.15)
  if (input.historyMedian && input.historyMedian.taskCount > 0) {
    const maxTasks = Math.ceil(input.historyMedian.taskCount * 1.15);
    if (plan.length > maxTasks) {
      plan = plan.slice(0, maxTasks);
    }
  }

  return plan;
}

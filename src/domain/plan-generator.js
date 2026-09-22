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
const DEFAULT_TASK_MINUTES = 30;
const DEFAULT_PRIORITY = 99;

/** Priority tiers (lower number = higher priority) */
const PRIORITY_TIERS = {
  review: 1,
  phaseCore: 2,
  mistakes: 3,
  english: 4,
  politics: 5,
  project: 6,
};

function isNumericScalar(value) {
  return ['string', 'number', 'bigint'].includes(typeof value);
}

function finiteNumber(value, fallback = 0) {
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  const fallbackNumeric = isNumericScalar(fallback) ? Number(fallback) : Number.NaN;
  if (Number.isFinite(numeric)) return numeric;
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
}

function nonNegativeNumber(value, fallback = 0) {
  const fallbackNumeric = finiteNumber(fallback, 0);
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return fallbackNumeric >= 0 ? fallbackNumeric : 0;
}

function positiveNumber(value, fallback = DEFAULT_TASK_MINUTES) {
  const fallbackNumeric = finiteNumber(fallback, 0);
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return fallbackNumeric > 0 ? fallbackNumeric : 0;
}

function priorityValue(value, fallback = DEFAULT_PRIORITY) {
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  return fallback;
}

function safeText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function taskObjects(value) {
  return arrayValue(value).filter(task => task && typeof task === 'object' && !Array.isArray(task));
}

function normalizePlanTask(task, overrides = {}) {
  const normalized = {
    ...task,
    topicId: safeText(task?.topicId),
    subject: safeText(task?.subject),
    phase: safeText(task?.phase),
    category: safeText(task?.category),
    ...overrides,
  };
  if ('isCore' in task) normalized.isCore = task.isCore === true;
  return normalized;
}

function historyEntry(topicId, topicHistory) {
  if (!topicHistory || typeof topicHistory.get !== 'function') return null;
  try {
    return topicHistory.get(topicId) || null;
  } catch {
    return null;
  }
}

function resolveEstimatedMinutes(task, topicHistory) {
  const explicit = positiveNumber(task?.estimatedMinutes, 0);
  return explicit || estimateTaskMinutes(safeText(task?.topicId), topicHistory);
}

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
  return nonNegativeNumber(consecutiveMissedDays) >= 2;
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
  const entry = historyEntry(topicId, topicHistory);
  if (!entry) return DEFAULT_TASK_MINUTES; // fallback default

  const records = arrayValue(entry.records)
    .map((record) => positiveNumber(record?.minutes, 0))
    .filter((minutes) => minutes > 0);
  if (records.length >= 3) {
    const sorted = records.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  return positiveNumber(entry.baseline, DEFAULT_TASK_MINUTES) || DEFAULT_TASK_MINUTES;
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
  const safeTasks = taskObjects(tasks);
  if (safeTasks.length === 0) return 1;

  let totalMinutes = 0;
  let coreMinutes = 0;

  for (const task of safeTasks) {
    const mins = nonNegativeNumber(task?.estimatedMinutes);
    totalMinutes += mins;
    if (CORE_SUBJECTS.has(task?.subject)) {
      coreMinutes += mins;
    }
  }

  if (totalMinutes <= 0) return 1;
  return Math.min(1, Math.max(0, coreMinutes / totalMinutes));
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
  const explicit = priorityValue(candidate?.priority, 0);
  if (explicit > 0) return explicit;

  const category = safeText(candidate?.category);
  if (category === 'review') return PRIORITY_TIERS.review;
  if (category === 'phaseCore') return PRIORITY_TIERS.phaseCore;
  if (category === 'mistakes') return PRIORITY_TIERS.mistakes;

  const subj = safeText(candidate?.subject).toLowerCase();
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
  let result = taskObjects(tasks);

  // If there are no core tasks at all, we can't enforce the ratio — return as-is
  const hasCoreTask = result.some(t => CORE_SUBJECTS.has(t?.subject));
  if (!hasCoreTask) return result;

  let ratio = computeCoreRatio(result);
  if (ratio >= threshold) return result;

  // Collect non-core tasks sorted by priority descending (lowest priority = highest number removed first)
  const nonCoreTasks = result
    .filter(t => !CORE_SUBJECTS.has(t?.subject))
    .sort((a, b) => priorityValue(b?.priority) - priorityValue(a?.priority));

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
  const safeTasks = taskObjects(tasks);
  const safeBudget = nonNegativeNumber(budget);
  if (safeTasks.length === 0) return [];
  if (safeBudget <= 0) return [];

  const sorted = [...safeTasks].sort((a, b) => priorityValue(a?.priority) - priorityValue(b?.priority));
  const result = [];
  let accumulated = 0;

  for (const task of sorted) {
    const mins = positiveNumber(task?.estimatedMinutes, DEFAULT_TASK_MINUTES);
    if (accumulated + mins <= safeBudget) {
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
  const safeTasks = taskObjects(tasks);
  const safeBudget = nonNegativeNumber(budget);
  if (safeTasks.length === 0) return [];
  if (safeBudget <= 0) return [];

  const sorted = [...safeTasks].sort((a, b) => priorityValue(a?.priority) - priorityValue(b?.priority));

  const result = [];
  let accumulated = 0;

  for (const task of sorted) {
    const mins = positiveNumber(task?.estimatedMinutes, DEFAULT_TASK_MINUTES);
    if (accumulated + mins <= safeBudget) {
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
  const availableMinutes = nonNegativeNumber(input.availableMinutes);
  const medianMinutes = positiveNumber(input.historyMedian?.minutes, availableMinutes);
  const recoveryBudget = Math.floor(medianMinutes * 0.6);

  // Only include core-subject tasks from due reviews and candidates
  const candidates = [];

  // Add due reviews that are core subjects
  if (input.dueReviews) {
    for (const review of taskObjects(input.dueReviews)) {
      if (CORE_SUBJECTS.has(review?.subject)) {
        candidates.push(normalizePlanTask(review, {
          priority: PRIORITY_TIERS.review,
          isRecovery: true,
          estimatedMinutes: resolveEstimatedMinutes(review, input.topicHistory),
        }));
      }
    }
  }

  // Add core candidate topics
  if (input.candidateTopics) {
    for (const topic of taskObjects(input.candidateTopics)) {
      if (CORE_SUBJECTS.has(topic?.subject) && topic?.isCore === true) {
        candidates.push(normalizePlanTask(topic, {
          priority: priorityValue(topic.priority, PRIORITY_TIERS.phaseCore),
          isRecovery: true,
          estimatedMinutes: resolveEstimatedMinutes(topic, input.topicHistory),
        }));
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
 * @param {Object} [input] - PlanInput. Omitted fields fall back to defaults, so
 *   every member is optional even though a full plan needs the first two.
 * @param {number} [input.availableMinutes] - User's available minutes today
 * @param {string} [input.phase] - 'foundation' | 'reinforcement' | 'pastExam' | 'sprint'
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
export function generateDailyPlan(input = {}) {
  // Step 1: Recovery day check
  if (isRecoveryDay(input.consecutiveMissedDays)) {
    return generateRecoveryPlan(input);
  }

  const topicHistory = input.topicHistory;
  const blockedSet = new Set(
    arrayValue(input.blockedTopics)
      .map(t => typeof t === 'string' || typeof t === 'number' || typeof t === 'bigint' ? safeText(t) : safeText(t?.topicId))
      .filter(Boolean)
  );
  const candidates = [];

  // Step 2a: Due reviews (highest priority)
  if (input.dueReviews) {
    for (const review of taskObjects(input.dueReviews)) {
      candidates.push(normalizePlanTask(review, {
        priority: PRIORITY_TIERS.review,
        category: 'review',
        estimatedMinutes: resolveEstimatedMinutes(review, topicHistory),
        isRecovery: false,
      }));
    }
  }

  // Step 2b: Candidate topics (filter out blocked prerequisites)
  if (input.candidateTopics) {
    for (const topic of taskObjects(input.candidateTopics)) {
      const topicId = safeText(topic?.topicId);
      const phase = safeText(topic?.phase);
      // Prerequisite gating: skip blocked topics for reinforcement/pastExam tasks
      if (blockedSet.has(topicId) && (phase === 'reinforcement' || phase === 'pastExam')) {
        continue;
      }

      const priority = assignPriority(topic);
      candidates.push(normalizePlanTask(topic, {
        priority,
        estimatedMinutes: resolveEstimatedMinutes(topic, topicHistory),
        isRecovery: false,
      }));
    }
  }

  // Step 3: Core ratio enforcement (first pass)
  const phase = safeText(input.phase, 'foundation');
  let plan = enforceCoreRatio(candidates, phase);

  // Step 4: Trim to budget
  const budget = nonNegativeNumber(input.availableMinutes);
  plan = prioritizeAndTrim(plan, budget);

  // Step 4b: Re-enforce core ratio after trimming (trimming may have altered the ratio)
  plan = enforceCoreRatio(plan, phase);

  // Step 5: Volume cap — task count <= ceil(7dayMedianTaskCount * 1.15)
  const historyTaskCount = nonNegativeNumber(input.historyMedian?.taskCount);
  if (historyTaskCount > 0) {
    const maxTasks = Math.ceil(historyTaskCount * 1.15);
    if (plan.length > maxTasks) {
      plan = plan.slice(0, maxTasks);
    }
  }

  return plan;
}

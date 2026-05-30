/**
 * Task Contract Module
 * Pure validation logic for task completion evidence, mastery promotion, and demotion.
 * No side effects — all functions are pure.
 */

/**
 * Validates whether a task completion attempt satisfies its contract.
 *
 * @param {Object} task - The task with its contract fields
 * @param {string[]} task.required_artifacts - Artifacts required for completion
 * @param {number} task.required_problem_count - Minimum problems required
 * @param {Object} payload - The user's submission payload
 * @param {string[]} [payload.artifacts] - Artifacts submitted by user
 * @param {number} [payload.problem_count] - Number of problems submitted
 * @param {number} [payload.correct_count] - Number of correct answers
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCompletion(task, payload) {
  const errors = [];

  // Check required_artifacts: each must be present in payload.artifacts
  if (Array.isArray(task.required_artifacts) && task.required_artifacts.length > 0) {
    const submitted = Array.isArray(payload.artifacts) ? payload.artifacts : [];
    for (const artifact of task.required_artifacts) {
      if (!submitted.includes(artifact)) {
        errors.push(`Missing required artifact: ${artifact}`);
      }
    }
  }

  // Check required_problem_count: if > 0, submitted problems must meet requirement
  if (task.required_problem_count > 0) {
    const problemCount = typeof payload.problem_count === 'number' ? payload.problem_count : 0;
    if (problemCount < task.required_problem_count) {
      errors.push(
        `Submitted problems (${problemCount}) less than required (${task.required_problem_count})`
      );
    }
  }

  // Check: if problems > 0, correct_count must be provided
  const problemCount = typeof payload.problem_count === 'number' ? payload.problem_count : 0;
  if (problemCount > 0 && (payload.correct_count === undefined || payload.correct_count === null)) {
    errors.push('correct_count is required when problem_count > 0');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates whether a topic can be promoted to "mastered" status.
 *
 * @param {Object} topicProgress - The topic's progress data
 * @param {number} topicProgress.total_problems - Total problems completed for this topic
 * @param {number} topicProgress.recent_14d_accuracy - Rolling accuracy over last 14 days (0..1)
 * @param {string|Date} topicProgress.last_review - Date of last review (ISO string or Date)
 * @param {string|Date} [today] - Reference date for "today" (defaults to now)
 * @returns {{ canPromote: boolean, unmetCriteria: string[] }}
 */
export function validateMasteryPromotion(topicProgress, today = new Date()) {
  const unmetCriteria = [];
  const now = today instanceof Date ? today : new Date(today);

  // Criterion 1: total_problems >= 30
  if (typeof topicProgress.total_problems !== 'number' || topicProgress.total_problems < 30) {
    unmetCriteria.push(
      `total_problems (${topicProgress.total_problems ?? 0}) must be >= 30`
    );
  }

  // Criterion 2: recent_14d_accuracy >= 0.80
  if (
    typeof topicProgress.recent_14d_accuracy !== 'number' ||
    topicProgress.recent_14d_accuracy < 0.80
  ) {
    unmetCriteria.push(
      `recent_14d_accuracy (${topicProgress.recent_14d_accuracy ?? 0}) must be >= 0.80`
    );
  }

  // Criterion 3: last_review within 7 days
  if (!topicProgress.last_review) {
    unmetCriteria.push('last_review is missing');
  } else {
    const lastReview = topicProgress.last_review instanceof Date
      ? topicProgress.last_review
      : new Date(topicProgress.last_review);
    const diffMs = now.getTime() - lastReview.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      unmetCriteria.push(
        `daysSinceLastReview (${Math.floor(diffDays)}) must be <= 7`
      );
    }
  }

  return { canPromote: unmetCriteria.length === 0, unmetCriteria };
}

/**
 * Checks whether a mastered topic should be demoted based on review accuracy.
 *
 * @param {Object} topic - The topic object
 * @param {string} topic.mastery_status - Current mastery status
 * @param {Object} reviewResult - The review result
 * @param {number} reviewResult.accuracy - Accuracy of the review (0..1)
 * @returns {{ shouldDemote: boolean, newStatus: string }}
 */
export function checkMasteryDemotion(topic, reviewResult) {
  if (topic.mastery_status === 'mastered' && reviewResult.accuracy < 0.60) {
    return { shouldDemote: true, newStatus: 'needs_review' };
  }
  return { shouldDemote: false, newStatus: topic.mastery_status };
}

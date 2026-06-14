/**
 * Task Contract Module
 * Pure validation logic for task completion evidence, mastery promotion, and demotion.
 * No side effects — all functions are pure.
 */

function finiteNumber(value, fallback = 0) {
  const numeric = ['string', 'number', 'bigint'].includes(typeof value) ? Number(value) : Number.NaN;
  const fallbackNumeric = ['string', 'number', 'bigint'].includes(typeof fallback) ? Number(fallback) : Number.NaN;
  if (Number.isFinite(numeric)) return numeric;
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
}

function nonNegativeCount(value, fallback = 0) {
  return Math.round(Math.max(0, finiteNumber(value, fallback)));
}

function isProvided(value) {
  return value !== undefined && value !== null && value !== '';
}

function isNonNegativeNumber(value) {
  const numeric = ['string', 'number', 'bigint'].includes(typeof value) ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0;
}

function parseDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (!['string', 'number'].includes(typeof value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeText(value) {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return '';
  return String(value);
}

function artifactList(value) {
  return Array.isArray(value)
    ? value.map(safeText).filter(Boolean)
    : [];
}

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
export function validateCompletion(task = {}, payload = {}) {
  const errors = [];
  const requiredArtifacts = artifactList(task.required_artifacts);
  const submittedArtifacts = artifactList(payload.artifacts);
  const requiredProblemCount = nonNegativeCount(task.required_problem_count);
  const problemCount = nonNegativeCount(payload.problem_count);
  const correctCount = nonNegativeCount(payload.correct_count);

  if (isProvided(payload.problem_count) && !isNonNegativeNumber(payload.problem_count)) {
    errors.push('problem_count must be a non-negative number');
  }
  if (isProvided(payload.correct_count) && !isNonNegativeNumber(payload.correct_count)) {
    errors.push('correct_count must be a non-negative number');
  }

  // Check required_artifacts: each must be present in payload.artifacts
  if (requiredArtifacts.length > 0) {
    for (const artifact of requiredArtifacts) {
      if (!submittedArtifacts.includes(artifact)) {
        errors.push(`Missing required artifact: ${artifact}`);
      }
    }
  }

  // Check required_problem_count: if > 0, submitted problems must meet requirement
  if (requiredProblemCount > 0) {
    if (problemCount < requiredProblemCount) {
      errors.push(
        `Submitted problems (${problemCount}) less than required (${requiredProblemCount})`
      );
    }
  }

  // Check: if problems > 0, correct_count must be provided
  if (problemCount > 0 && (payload.correct_count === undefined || payload.correct_count === null)) {
    errors.push('correct_count is required when problem_count > 0');
  }
  if (problemCount > 0 && isProvided(payload.correct_count) && correctCount > problemCount) {
    errors.push('correct_count cannot exceed problem_count');
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
export function validateMasteryPromotion(topicProgress = {}, today = new Date()) {
  const unmetCriteria = [];
  const now = parseDate(today);
  const totalProblems = nonNegativeCount(topicProgress.total_problems);
  const recentAccuracy = finiteNumber(topicProgress.recent_14d_accuracy, 0);

  if (!now) {
    unmetCriteria.push('today is invalid');
  }

  // Criterion 1: total_problems >= 30
  if (totalProblems < 30) {
    unmetCriteria.push(
      `total_problems (${totalProblems}) must be >= 30`
    );
  }

  // Criterion 2: recent_14d_accuracy >= 0.80
  if (recentAccuracy < 0.80) {
    unmetCriteria.push(
      `recent_14d_accuracy (${recentAccuracy}) must be >= 0.80`
    );
  }

  // Criterion 3: last_review within 7 days
  if (!topicProgress.last_review) {
    unmetCriteria.push('last_review is missing');
  } else {
    const lastReview = parseDate(topicProgress.last_review);
    if (!lastReview) {
      unmetCriteria.push('last_review is invalid');
    } else if (now) {
      const diffMs = now.getTime() - lastReview.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 7) {
        unmetCriteria.push(
          `daysSinceLastReview (${Math.floor(diffDays)}) must be <= 7`
        );
      }
      if (diffDays < 0) {
        unmetCriteria.push('last_review cannot be in the future');
      }
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
export function checkMasteryDemotion(topic = {}, reviewResult = {}) {
  const currentStatus = topic.mastery_status;
  const accuracy = finiteNumber(reviewResult.accuracy, 1);
  if (currentStatus === 'mastered' && accuracy < 0.60) {
    return { shouldDemote: true, newStatus: 'needs_review' };
  }
  return { shouldDemote: false, newStatus: currentStatus };
}

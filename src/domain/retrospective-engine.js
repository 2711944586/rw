/**
 * Retrospective Engine
 * Pure functions: daily/weekly/monthly signal computation.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

/**
 * Phase thresholds for core ratio signal.
 * Foundation phase has a lower threshold (0.55), all others require 0.65.
 */
const PHASE_CORE_THRESHOLDS = {
  foundation: 0.55,
  reinforcement: 0.65,
  pastExam: 0.65,
  sprint: 0.65,
};

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampedNumber(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function ratioValue(value, fallback = 0) {
  return clampedNumber(value, 0, 1, fallback);
}

function nonNegativeNumber(value, fallback = 0) {
  return clampedNumber(value, 0, Number.POSITIVE_INFINITY, fallback);
}

function nonNegativeCount(value, fallback = 0) {
  return Math.round(nonNegativeNumber(value, fallback));
}

function phaseCoreThreshold(phase) {
  return Object.prototype.hasOwnProperty.call(PHASE_CORE_THRESHOLDS, phase)
    ? PHASE_CORE_THRESHOLDS[phase]
    : 0.65;
}

/**
 * Compute a three-color signal based on value and thresholds.
 * @param {number} value
 * @param {number} greenThreshold - value >= this → green
 * @param {number} yellowThreshold - value >= this → yellow
 * @returns {'green'|'yellow'|'red'}
 */
function threeColorSignal(value, greenThreshold, yellowThreshold) {
  const safeValue = finiteNumber(value, 0);
  const safeGreenThreshold = finiteNumber(greenThreshold, 1);
  const safeYellowThreshold = finiteNumber(yellowThreshold, 0);
  if (safeValue >= safeGreenThreshold) return 'green';
  if (safeValue >= safeYellowThreshold) return 'yellow';
  return 'red';
}

/**
 * Compute daily retrospective signals across 4 dimensions.
 *
 * @param {Object} [input] - DailyRetroInput. Every field is optional: missing or
 *   malformed values are coerced to safe defaults rather than rejected.
 * @param {number} [input.taskCompletionRate] - 0..1
 * @param {number} [input.recordCount] - number of records submitted
 * @param {number} [input.taskCount] - number of tasks planned
 * @param {number} [input.reviewDueProcessedRate] - 0..1
 * @param {number} [input.coreRatio] - 0..1
 * @param {string} [input.phase] - 'foundation'|'reinforcement'|'pastExam'|'sprint'
 * @returns {Object} DailyRetroResult with taskSignal, reviewSignal, coreRatioSignal, recordSignal
 */
export function computeDailyRetro(input = {}) {
  const { taskCompletionRate, recordCount, taskCount, reviewDueProcessedRate, coreRatio, phase } = input;
  const safeTaskCompletionRate = ratioValue(taskCompletionRate);
  const safeReviewDueProcessedRate = ratioValue(reviewDueProcessedRate);
  const safeCoreRatio = ratioValue(coreRatio);
  const safeRecordCount = nonNegativeCount(recordCount);
  const safeTaskCount = nonNegativeCount(taskCount);

  // Task completion signal
  const taskSignal = threeColorSignal(safeTaskCompletionRate, 0.85, 0.60);

  // Review due processed signal
  const reviewSignal = threeColorSignal(safeReviewDueProcessedRate, 0.95, 0.80);

  // Record signal: green if recordCount >= taskCount * 0.9, yellow if >= 0.6, red otherwise
  const recordRatio = safeTaskCount > 0 ? safeRecordCount / safeTaskCount : 1;
  const recordSignal = threeColorSignal(recordRatio, 0.9, 0.6);

  // Core ratio signal: based on phase threshold
  const phaseThreshold = phaseCoreThreshold(phase);
  const coreRatioSignal = threeColorSignal(safeCoreRatio, phaseThreshold, phaseThreshold - 0.10);

  return { taskSignal, reviewSignal, coreRatioSignal, recordSignal };
}

/**
 * Compute weekly retrospective overall signal.
 *
 * @param {Array} dailyResults - Array of DailyRetroResult objects for the week
 * @param {Object} [weekData] - All fields optional; coerced to safe defaults.
 * @param {number} [weekData.totalEffectiveMinutes] - Actual effective minutes this week
 * @param {number} [weekData.plannedMinutes] - Planned minutes target for this week
 * @param {number} [weekData.breakDays] - Number of days with no activity
 * @param {number} [weekData.mistakeRecoveryRate] - 0..1, fraction of mistakes recovered
 * @param {number} [weekData.coreRatioMedian] - Median core ratio for the week
 * @param {string} [weekData.phase] - Current phase
 * @returns {Object} WeeklyRetroResult with overallSignal and signals breakdown
 */
export function computeWeeklyRetro(dailyResults, weekData = {}) {
  const { totalEffectiveMinutes, plannedMinutes, breakDays, mistakeRecoveryRate, coreRatioMedian, phase } = weekData;
  const safeTotalEffectiveMinutes = nonNegativeNumber(totalEffectiveMinutes);
  const safePlannedMinutes = nonNegativeNumber(plannedMinutes);
  const safeBreakDays = nonNegativeCount(breakDays);
  const safeMistakeRecoveryRate = ratioValue(mistakeRecoveryRate);
  const safeCoreRatioMedian = ratioValue(coreRatioMedian);

  const phaseThreshold = phaseCoreThreshold(phase);

  // Red triggers (any one makes overall red)
  const effectiveRatio = safePlannedMinutes > 0 ? safeTotalEffectiveMinutes / safePlannedMinutes : 1;
  const isEffectiveRed = effectiveRatio < 0.70;
  const isBreakDaysRed = safeBreakDays >= 2;
  const isMistakeRecoveryRed = safeMistakeRecoveryRate < 0.50;
  const isCoreRatioRed = safeCoreRatioMedian < phaseThreshold;

  const hasRed = isEffectiveRed || isBreakDaysRed || isMistakeRecoveryRed || isCoreRatioRed;

  const overallSignal = hasRed ? 'red' : 'green';

  return {
    overallSignal,
    signals: {
      effectiveMinutes: isEffectiveRed ? 'red' : 'green',
      breakDays: isBreakDaysRed ? 'red' : 'green',
      mistakeRecovery: isMistakeRecoveryRed ? 'red' : 'green',
      coreRatioMedian: isCoreRatioRed ? 'red' : 'green',
    },
    metrics: {
      effectiveRatio,
      breakDays: safeBreakDays,
      mistakeRecoveryRate: safeMistakeRecoveryRate,
      coreRatioMedian: safeCoreRatioMedian,
    },
  };
}

/**
 * Compute monthly audit comparing actual vs planned cumulative minutes.
 *
 * @param {Object} [monthData] - All fields optional; coerced to safe defaults.
 * @param {number} [monthData.actualMinutes] - Actual cumulative effective minutes
 * @param {Object} [planCurve] - All fields optional; coerced to safe defaults.
 * @param {number} [planCurve.cumulativePlannedMinutes] - Planned cumulative minutes
 * @returns {Object} MonthlyAuditResult
 */
export function computeMonthlyAudit(monthData = {}, planCurve = {}) {
  const { actualMinutes } = monthData;
  const { cumulativePlannedMinutes } = planCurve;
  const safeActualMinutes = nonNegativeNumber(actualMinutes);
  const safeCumulativePlannedMinutes = nonNegativeNumber(cumulativePlannedMinutes);

  const ratio = safeCumulativePlannedMinutes > 0 ? safeActualMinutes / safeCumulativePlannedMinutes : 1;

  const shrinkToCore = shouldShrinkToCore(ratio);
  const tierFallback = shouldTriggerTierFallback(ratio);

  let recommendation;
  if (tierFallback) {
    recommendation = 'tier_fallback';
  } else if (shrinkToCore) {
    recommendation = 'shrink_to_core';
  } else {
    recommendation = 'on_track';
  }

  return {
    ratio,
    shouldShrinkToCore: shrinkToCore,
    shouldTierFallback: tierFallback,
    recommendation,
  };
}

/**
 * Determine if the actual-vs-plan ratio warrants shrinking to core subjects.
 * @param {number} ratio - actualMinutes / cumulativePlannedMinutes
 * @returns {boolean} true if ratio < 0.85
 */
export function shouldShrinkToCore(ratio) {
  return nonNegativeNumber(ratio, 1) < 0.85;
}

/**
 * Determine if the actual-vs-plan ratio warrants a tier fallback trigger.
 * @param {number} ratio - actualMinutes / cumulativePlannedMinutes
 * @returns {boolean} true if ratio < 0.70
 */
export function shouldTriggerTierFallback(ratio) {
  return nonNegativeNumber(ratio, 1) < 0.70;
}

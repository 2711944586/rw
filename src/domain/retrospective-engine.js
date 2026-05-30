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

/**
 * Compute a three-color signal based on value and thresholds.
 * @param {number} value
 * @param {number} greenThreshold - value >= this → green
 * @param {number} yellowThreshold - value >= this → yellow
 * @returns {'green'|'yellow'|'red'}
 */
function threeColorSignal(value, greenThreshold, yellowThreshold) {
  if (value >= greenThreshold) return 'green';
  if (value >= yellowThreshold) return 'yellow';
  return 'red';
}

/**
 * Compute daily retrospective signals across 4 dimensions.
 *
 * @param {Object} input - DailyRetroInput
 * @param {number} input.taskCompletionRate - 0..1
 * @param {number} input.recordCount - number of records submitted
 * @param {number} input.taskCount - number of tasks planned
 * @param {number} input.reviewDueProcessedRate - 0..1
 * @param {number} input.coreRatio - 0..1
 * @param {string} input.phase - 'foundation'|'reinforcement'|'pastExam'|'sprint'
 * @returns {Object} DailyRetroResult with taskSignal, reviewSignal, coreRatioSignal, recordSignal
 */
export function computeDailyRetro(input) {
  const { taskCompletionRate, recordCount, taskCount, reviewDueProcessedRate, coreRatio, phase } = input;

  // Task completion signal
  const taskSignal = threeColorSignal(taskCompletionRate, 0.85, 0.60);

  // Review due processed signal
  const reviewSignal = threeColorSignal(reviewDueProcessedRate, 0.95, 0.80);

  // Record signal: green if recordCount >= taskCount * 0.9, yellow if >= 0.6, red otherwise
  const recordRatio = taskCount > 0 ? recordCount / taskCount : 1;
  const recordSignal = threeColorSignal(recordRatio, 0.9, 0.6);

  // Core ratio signal: based on phase threshold
  const phaseThreshold = PHASE_CORE_THRESHOLDS[phase] || 0.65;
  const coreRatioSignal = threeColorSignal(coreRatio, phaseThreshold, phaseThreshold - 0.10);

  return { taskSignal, reviewSignal, coreRatioSignal, recordSignal };
}

/**
 * Compute weekly retrospective overall signal.
 *
 * @param {Array} dailyResults - Array of DailyRetroResult objects for the week
 * @param {Object} weekData
 * @param {number} weekData.totalEffectiveMinutes - Actual effective minutes this week
 * @param {number} weekData.plannedMinutes - Planned minutes target for this week
 * @param {number} weekData.breakDays - Number of days with no activity
 * @param {number} weekData.mistakeRecoveryRate - 0..1, fraction of mistakes recovered
 * @param {number} weekData.coreRatioMedian - Median core ratio for the week
 * @param {string} weekData.phase - Current phase
 * @returns {Object} WeeklyRetroResult with overallSignal and signals breakdown
 */
export function computeWeeklyRetro(dailyResults, weekData) {
  const { totalEffectiveMinutes, plannedMinutes, breakDays, mistakeRecoveryRate, coreRatioMedian, phase } = weekData;

  const phaseThreshold = PHASE_CORE_THRESHOLDS[phase] || 0.65;

  // Red triggers (any one makes overall red)
  const effectiveRatio = plannedMinutes > 0 ? totalEffectiveMinutes / plannedMinutes : 1;
  const isEffectiveRed = effectiveRatio < 0.70;
  const isBreakDaysRed = breakDays >= 2;
  const isMistakeRecoveryRed = mistakeRecoveryRate < 0.50;
  const isCoreRatioRed = coreRatioMedian < phaseThreshold;

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
      breakDays,
      mistakeRecoveryRate,
      coreRatioMedian,
    },
  };
}

/**
 * Compute monthly audit comparing actual vs planned cumulative minutes.
 *
 * @param {Object} monthData
 * @param {number} monthData.actualMinutes - Actual cumulative effective minutes
 * @param {Object} planCurve
 * @param {number} planCurve.cumulativePlannedMinutes - Planned cumulative minutes
 * @returns {Object} MonthlyAuditResult
 */
export function computeMonthlyAudit(monthData, planCurve) {
  const { actualMinutes } = monthData;
  const { cumulativePlannedMinutes } = planCurve;

  const ratio = cumulativePlannedMinutes > 0 ? actualMinutes / cumulativePlannedMinutes : 1;

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
  return ratio < 0.85;
}

/**
 * Determine if the actual-vs-plan ratio warrants a tier fallback trigger.
 * @param {number} ratio - actualMinutes / cumulativePlannedMinutes
 * @returns {boolean} true if ratio < 0.70
 */
export function shouldTriggerTierFallback(ratio) {
  return ratio < 0.70;
}

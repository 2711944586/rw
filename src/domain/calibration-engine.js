/**
 * Calibration Engine
 * Pure functions: score prediction, confidence intervals, tier fallback.
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

/**
 * Checkpoint thresholds by month (YYYY-MM format).
 */
const CHECKPOINT_THRESHOLDS = {
  '2027-08': 390,
  '2027-10': 405,
  '2027-11': 415,
};

/**
 * Returns the checkpoint threshold for the given date, or null if not a checkpoint month.
 * @param {string} date - ISO date string (e.g., '2027-08-15')
 * @returns {number|null}
 */
export function getCheckpointThreshold(date) {
  if (!date) return null;
  const yearMonth = date.slice(0, 7); // 'YYYY-MM'
  return CHECKPOINT_THRESHOLDS[yearMonth] ?? null;
}

/**
 * Linear Coverage Model prediction.
 * baseScore=250, coverageBonus=coverage*170, accuracyFactor=accuracy*0.8+0.2,
 * timeFactor=min(1.0, minutes/5400)
 * prediction = baseScore + coverageBonus * accuracyFactor * timeFactor
 * 
 * @param {number} coverage - Topic coverage 0..1
 * @param {number} accuracy - Recent 30-day accuracy 0..1
 * @param {number} minutes - Recent 30-day effective minutes
 * @returns {number} predicted score
 */
export function linearCoveragePredict(coverage, accuracy, minutes) {
  const baseScore = 250;
  const coverageBonus = coverage * 170;
  const accuracyFactor = accuracy * 0.8 + 0.2;
  const timeFactor = Math.min(1.0, minutes / 5400);
  return baseScore + coverageBonus * accuracyFactor * timeFactor;
}

/**
 * Mock Regression Model prediction using weighted linear regression.
 * If scores.length >= 2, applies weighted linear regression with recent scores weighted higher.
 * Otherwise returns a fallback with high uncertainty (stddev=30).
 * 
 * @param {number[]} scores - Array of mock exam scores (chronological order)
 * @returns {{ predicted: number, stddev: number }}
 */
export function mockRegressionPredict(scores) {
  if (!scores || scores.length < 2) {
    // Not enough data for regression; return null predicted to signal fallback
    return { predicted: null, stddev: 30 };
  }

  const n = scores.length;

  // Weights: more recent scores weighted higher (linearly increasing)
  const weights = scores.map((_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Weighted linear regression: y = a + b*x, where x is index
  let sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    const x = i;
    const y = scores[i];
    sumWX += w * x;
    sumWY += w * y;
    sumWXX += w * x * x;
    sumWXY += w * x * y;
  }

  const meanX = sumWX / totalWeight;
  const meanY = sumWY / totalWeight;

  const numerator = sumWXY / totalWeight - meanX * meanY;
  const denominator = sumWXX / totalWeight - meanX * meanX;

  let predicted;
  let stddev;

  if (Math.abs(denominator) < 1e-10) {
    // All x values are essentially the same (shouldn't happen with n>=2 but guard)
    predicted = meanY;
    stddev = 30;
  } else {
    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;
    // Predict at the next point (extrapolate one step)
    predicted = intercept + slope * n;

    // Compute weighted standard deviation of residuals
    let sumWResidualSq = 0;
    for (let i = 0; i < n; i++) {
      const fitted = intercept + slope * i;
      const residual = scores[i] - fitted;
      sumWResidualSq += weights[i] * residual * residual;
    }
    stddev = Math.sqrt(sumWResidualSq / totalWeight);
    // Minimum stddev to avoid overly confident predictions
    if (stddev < 5) stddev = 5;
  }

  return { predicted, stddev };
}

/**
 * Generate tier fallback suggestions when predicted lower bound is below threshold.
 * Returns 3 tiers with probability ranges.
 * 
 * @param {number} predictedLower - Lower bound of prediction
 * @param {number} threshold - Checkpoint threshold
 * @returns {Array<{ tier: string, description: string, probabilityRange: [number, number] }>}
 */
export function generateTierFallback(predictedLower, threshold) {
  const gap = threshold - predictedLower;

  // Tier 1: Stay with PKU-SWM (aggressive)
  // Tier 2: Same-tier alternatives
  // Tier 3: Safety net
  return [
    {
      tier: '北大软微主目标',
      description: '继续保留北大软件与微电子学院为主目标，需弥补差距约' + Math.round(gap) + '分',
      probabilityRange: [Math.max(0.05, 0.40 - gap / 100), Math.max(0.15, 0.55 - gap / 100)],
    },
    {
      tier: '同档替补',
      description: '同等级院校替补（如北航、南大软院等）',
      probabilityRange: [0.40, 0.65],
    },
    {
      tier: '稳妥备选',
      description: '准备录取风险更低的双一流高校备选（如华科、武大等）',
      probabilityRange: [0.75, 0.92],
    },
  ];
}

/**
 * Main calibration function — dual-model prediction with confidence interval.
 * 
 * @param {Object} input - CalibrationInput
 * @param {number[]} input.mockScores - Recent mock exam scores
 * @param {number} input.topicCoverage - 0..1
 * @param {number} input.recent30DayAccuracy - 0..1
 * @param {number} input.recent30DayMinutes - Total effective minutes in last 30 days
 * @param {string} input.currentDate - ISO date for checkpoint selection
 * @returns {Object} CalibrationResult
 */
export function calibrate(input) {
  const { mockScores, topicCoverage, recent30DayAccuracy, recent30DayMinutes, currentDate } = input;

  // 1. Linear Coverage Model
  const linearPrediction = linearCoveragePredict(topicCoverage, recent30DayAccuracy, recent30DayMinutes);

  // 2. Mock Regression Model
  const regression = mockRegressionPredict(mockScores);
  let regressionPrediction;
  let stddev;

  if (regression.predicted !== null) {
    regressionPrediction = regression.predicted;
    stddev = regression.stddev;
  } else {
    // Fallback: use linear prediction with high uncertainty
    regressionPrediction = linearPrediction;
    stddev = 30;
  }

  // 3. Combine
  let predicted = (linearPrediction + regressionPrediction) / 2;
  let lowerBound = predicted - 1.5 * stddev;
  let upperBound = predicted + 1.5 * stddev;
  const highUncertainty = Math.abs(linearPrediction - regressionPrediction) >= 15;

  // 5. Clamp predicted to [0, 500]
  predicted = Math.max(0, Math.min(500, predicted));
  // Ensure bounds respect the invariant: lowerBound <= predicted <= upperBound
  lowerBound = Math.min(lowerBound, predicted);
  upperBound = Math.max(upperBound, predicted);

  // 4. Checkpoint check & tier fallback
  const threshold = getCheckpointThreshold(currentDate);
  let tierFallback = null;
  if (threshold !== null && lowerBound < threshold) {
    tierFallback = generateTierFallback(lowerBound, threshold);
  }

  // Compute confidence (simple heuristic based on data availability)
  const hasEnoughMocks = mockScores && mockScores.length >= 2;
  const confidence = hasEnoughMocks ? Math.min(0.9, 0.5 + mockScores.length * 0.1) : 0.3;

  return {
    predictedScore: predicted,
    lowerBound,
    upperBound,
    confidence,
    highUncertainty,
    coverageModel: { predicted: linearPrediction },
    regressionModel: { predicted: regressionPrediction, stddev },
    tierFallback,
  };
}

/**
 * Explainable heuristic priority. Weights are a versioned config,
 * not an optimal policy. The learner can ignore or lock a suggestion.
 */

export const PRIORITY_WEIGHTS_V1 = Object.freeze({
  version: 'heuristic-v1',
  urgency: 0.35,
  weakness: 0.3,
  reviewLoad: 0.2,
  phaseImportance: 0.15,
});

function unit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function scoreTaskPriority(input = {}, weights = PRIORITY_WEIGHTS_V1) {
  const urgency = unit(input.urgency);
  const weakness = unit(input.weakness);
  const reviewLoad = unit(input.reviewLoad);
  const phaseImportance = unit(input.phaseImportance);
  const score = (
    urgency * weights.urgency
    + weakness * weights.weakness
    + reviewLoad * weights.reviewLoad
    + phaseImportance * weights.phaseImportance
  );
  const reasons = [];
  if (urgency >= 0.6) reasons.push('临近到期或已逾期');
  if (weakness >= 0.6) reasons.push('近期正确率或复做保持偏低');
  if (reviewLoad >= 0.6) reasons.push('复盘队列占用高');
  if (phaseImportance >= 0.6) reasons.push('当前阶段把这科当作主干');
  return {
    score: Math.round(score * 1000) / 1000,
    weightsVersion: weights.version,
    reasons,
    locked: Boolean(input.locked),
    enabled: input.enabled !== false,
  };
}

export function compareSchedules(previous = {}, next = {}) {
  const keys = ['overdue', 'completionRate', 'mathShare', 'csShare', 'volatility'];
  return Object.fromEntries(keys.map((key) => [key, {
    previous: Number(previous[key]) || 0,
    next: Number(next[key]) || 0,
    delta: (Number(next[key]) || 0) - (Number(previous[key]) || 0),
  }]));
}

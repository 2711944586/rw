function isNumericScalar(value) {
  return ['string', 'number', 'bigint'].includes(typeof value);
}

export function finiteNumber(value, fallback = 0) {
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric)) return numeric;

  const fallbackNumeric = isNumericScalar(fallback) ? Number(fallback) : Number.NaN;
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
}

export function nonNegativeNumber(value, fallback = 0) {
  const fallbackNumeric = Math.max(0, finiteNumber(fallback, 0));
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallbackNumeric;
}

export function positiveNumber(value, fallback = 1) {
  const fallbackNumeric = nonNegativeNumber(fallback, 1);
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return fallbackNumeric > 0 ? fallbackNumeric : 1;
}

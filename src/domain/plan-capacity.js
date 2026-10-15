/**
 * Compare a day's planned minutes with the time the learner said is available.
 * This does not resize tasks. Locked work stays at its scheduled length.
 */

const OVERFLOW_TOLERANCE_MINUTES = 15;

function wholeMinutes(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

export function planCapacityMessage({ planned = 0, available = 0 } = {}) {
  const plannedMinutes = wholeMinutes(planned);
  const availableMinutes = wholeMinutes(available);
  const overflow = plannedMinutes - availableMinutes;
  if (overflow <= OVERFLOW_TOLERANCE_MINUTES) {
    return { conflict: false, overflow: Math.max(0, overflow), message: "" };
  }
  return {
    conflict: true,
    overflow,
    message: `今日计划 ${plannedMinutes} 分钟，可用 ${availableMinutes} 分钟，超出 ${overflow} 分钟。已锁定的任务保持原时长，其余可改到明天。系统不会悄悄缩短。`
  };
}

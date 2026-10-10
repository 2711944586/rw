/**
 * Explain a review scheduling decision without replacing the D+1..D+30 rule.
 * FSRS stays an optional experiment and never becomes the math/408 grade.
 */

export const REVIEW_QUEUE_STATUSES = Object.freeze(['due', 'overdue', 'deferred', 'done', 'skipped']);

export function explainReviewSchedule({
  status = 'due',
  reason = '',
  fromDate = '',
  toDate = '',
  affectedTaskCount = 0,
} = {}) {
  const safeStatus = REVIEW_QUEUE_STATUSES.includes(status) ? status : 'due';
  const moved = Boolean(fromDate && toDate && fromDate !== toDate);
  const why = reason || (
    safeStatus === 'overdue' ? '已过到期日，仍按原间隔保留，避免静默改写。'
      : safeStatus === 'deferred' ? '本次顺延来自手动或失败后的次日短复盘。'
        : safeStatus === 'done' ? '本次复盘已完成，下一次按通过后的间隔安排。'
          : safeStatus === 'skipped' ? '本次被跳过，不计入通过，也不会拉长间隔。'
            : '到达既定间隔，需要闭卷重做。'
  );
  return {
    status: safeStatus,
    why,
    moved,
    fromDate,
    toDate,
    impact: affectedTaskCount > 0
      ? `同一天还有 ${affectedTaskCount} 项任务会看到这条复盘占用时间。`
      : '不自动改写已锁定的学习任务。',
    overridable: true,
  };
}

/**
 * Mistake records. A mistake can point at a task, a drill, or a mock,
 * and none of those links are required.
 */

export const MISTAKE_TYPES = Object.freeze(['概念', '方法', '计算', '审题', '时间管理', '自定义']);
export const MISTAKE_STATUSES = Object.freeze(['needs-retry', 'mastered', 'archived']);

function text(value, max = 500) {
  if (!['string', 'number'].includes(typeof value)) return '';
  return String(value).trim().slice(0, max);
}

function dateKey(value) {
  const raw = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

export function normalizeMistakeType(value) {
  const label = text(value, 40);
  return MISTAKE_TYPES.includes(label) ? label : '自定义';
}

export function createMistake(input = {}, now = new Date()) {
  const discovered = dateKey(input.discoveredAt) || (now instanceof Date ? now.toISOString().slice(0, 10) : '');
  const id = text(input.id, 80) || `mistake-${discovered}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    id,
    subject: text(input.subject, 40),
    topicId: text(input.topicId, 80),
    source: text(input.source, 80),
    summary: text(input.summary, 240),
    errorType: normalizeMistakeType(input.errorType),
    customType: normalizeMistakeType(input.errorType) === '自定义' ? text(input.customType || input.errorType, 40) : '',
    discoveredAt: discovered,
    history: Array.isArray(input.history) ? input.history.slice(0, 40) : [],
    status: MISTAKE_STATUSES.includes(input.status) ? input.status : 'needs-retry',
    nextReviewDate: dateKey(input.nextReviewDate),
    taskId: text(input.taskId, 80),
    examAttemptId: text(input.examAttemptId, 80),
    updatedAt: text(input.updatedAt, 40) || (now instanceof Date ? now.toISOString() : ''),
  };
}

export function transitionMistake(mistake, status, at = new Date()) {
  if (!mistake || !MISTAKE_STATUSES.includes(status)) return mistake;
  const when = at instanceof Date ? at.toISOString() : String(at || '');
  return {
    ...mistake,
    status,
    history: [...(mistake.history || []), { status, at: when }].slice(-40),
    updatedAt: when,
  };
}

export function mistakesForTopic(mistakes, topicId) {
  const id = text(topicId, 80);
  return (Array.isArray(mistakes) ? mistakes : []).filter((item) => item?.topicId === id && item.status !== 'archived');
}

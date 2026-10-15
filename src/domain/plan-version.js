/**
 * Local plan history. A version stores the task list from before a regenerate
 * so the learner can undo that one day without touching other days.
 */

export const PLAN_VERSION_LIMIT = 20;

function text(value, max) {
  if (!["string", "number"].includes(typeof value)) return "";
  return String(value).trim().slice(0, max);
}

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function snapshotPlanTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter(plain).slice(0, 12).map((task) => ({
    id: text(task.id, 160),
    subject: text(task.subject, 40),
    text: text(task.text, 500),
    minutes: Number.isFinite(Number(task.minutes)) ? Math.max(0, Math.round(Number(task.minutes))) : 0,
    priority: Number.isFinite(Number(task.priority)) ? Math.round(Number(task.priority)) : 0,
    status: text(task.status, 20) || "todo",
    locked: task.locked === true,
    source: text(task.source, 40),
    sourceTaskId: text(task.sourceTaskId, 160),
    carriedFrom: text(task.carriedFrom, 20),
    reviewItemId: text(task.reviewItemId, 160),
    topicId: text(task.topicId, 160)
  }));
}

/**
 * @param {{
 *   date?: string,
 *   reason?: string,
 *   changedTaskIds?: string[],
 *   previousVersionId?: string,
 *   beforeTasks?: object[],
 *   createdAt?: string
 * }} [input]
 */
export function createPlanVersion(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const stamp = text(source.createdAt, 40) || new Date().toISOString();
  const day = text(source.date, 10);
  return {
    id: `plan-${day}-${stamp}`,
    date: day,
    createdAt: stamp,
    reason: text(source.reason, 200),
    changedTaskIds: (Array.isArray(source.changedTaskIds) ? source.changedTaskIds : []).map((id) => text(id, 160)).filter(Boolean).slice(0, 40),
    previousVersionId: text(source.previousVersionId, 200),
    beforeTasks: snapshotPlanTasks(source.beforeTasks)
  };
}

export function appendPlanVersion(versions, version) {
  const current = (Array.isArray(versions) ? versions : []).filter(plain);
  if (!plain(version) || !version.id) return current.slice(-PLAN_VERSION_LIMIT);
  return [...current, version].slice(-PLAN_VERSION_LIMIT);
}

export function undoPlanVersion(versions) {
  const current = (Array.isArray(versions) ? versions : []).filter(plain);
  if (!current.length) return { version: null, versions: current };
  const version = current[current.length - 1];
  return { version, versions: current.slice(0, -1) };
}

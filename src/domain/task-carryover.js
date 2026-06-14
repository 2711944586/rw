/**
 * Helpers for rolling unfinished study tasks forward without inventing
 * extra daily workload.
 */

const DEFAULT_LIMIT = 2;
const DEFAULT_MIN_MINUTES = 25;
const DEFAULT_MAX_MINUTES = 90;
const DEFAULT_TASK_TEXT = "未命名任务";

function isNumericScalar(value) {
  return ["string", "number", "bigint"].includes(typeof value);
}

function finiteNumber(value, fallback = 0) {
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  const fallbackNumeric = isNumericScalar(fallback) ? Number(fallback) : Number.NaN;
  if (Number.isFinite(numeric)) return numeric;
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : 0;
}

function nonNegativeInteger(value, fallback = 0) {
  return Math.round(Math.max(0, finiteNumber(value, fallback)));
}

function positiveNumber(value, fallback) {
  const numeric = isNumericScalar(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return Math.max(0, finiteNumber(fallback, 0));
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeText(value, fallback = "") {
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
}

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

function taskId(task) {
  return safeText(objectValue(task).id);
}

function taskText(task) {
  const item = objectValue(task);
  const text = safeText(item.text) || safeText(item.title) || DEFAULT_TASK_TEXT;
  return text.startsWith("顺延：") ? text : `顺延：${text}`;
}

function boundedMinutes(value, minMinutes, maxMinutes) {
  const minutes = positiveNumber(value, minMinutes);
  return Math.min(maxMinutes, Math.max(minMinutes, minutes));
}

export function isTaskDone(task, taskState = {}) {
  const state = objectValue(taskState);
  const id = taskId(task);
  return task?.status === "done" || Boolean(id && state[id] === true);
}

export function activeTasks(tasks = [], taskState = {}) {
  return arrayValue(tasks).filter((task) => task && task.status !== "shifted" && !task.deleted && !isTaskDone(task, taskState));
}

export function collectCarryoverTasks(weekPlans = {}, taskState = {}, targetDate, options = {}) {
  const plans = objectValue(weekPlans);
  const safeOptions = objectValue(options);
  const safeTargetDate = validDateKey(targetDate);
  const limit = nonNegativeInteger(safeOptions.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT);
  const minMinutes = positiveNumber(safeOptions.minMinutes, DEFAULT_MIN_MINUTES) || DEFAULT_MIN_MINUTES;
  const maxMinutes = Math.max(minMinutes, positiveNumber(safeOptions.maxMinutes, DEFAULT_MAX_MINUTES) || DEFAULT_MAX_MINUTES);
  if (!safeTargetDate || limit <= 0) return [];

  const existingToday = arrayValue(plans[safeTargetDate]);
  const existingSourceIds = new Set(
    existingToday
      .map((task) => {
        const item = objectValue(task);
        return safeText(item.sourceTaskId) || safeText(item.carriedFrom);
      })
      .filter(Boolean)
  );

  return Object.entries(plans)
    .filter(([date]) => validDateKey(date) && date < safeTargetDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([, tasks]) => activeTasks(tasks, taskState))
    .filter((task) => taskId(task) && !existingSourceIds.has(taskId(task)))
    .slice(0, limit)
    .map((task, index) => ({
      ...task,
      id: `${safeTargetDate}-carry-${taskId(task)}`,
      date: safeTargetDate,
      text: taskText(task),
      minutes: boundedMinutes(task.minutes, minMinutes, maxMinutes),
      priority: index + 1,
      status: "todo",
      locked: true,
      source: "carryover",
      sourceTaskId: taskId(task),
      carriedFrom: validDateKey(task.date) || validDateKey(taskId(task).slice(0, 10)) || "",
      completedAt: "",
      recordApplied: false,
      updatedAt: new Date().toISOString()
    }));
}

export function markCarriedSourceTasks(weekPlans = {}, carriedTasks = [], taskState = {}) {
  const plans = objectValue(weekPlans);
  const carried = arrayValue(carriedTasks);
  const sourceIds = new Set(carried.map((task) => safeText(objectValue(task).sourceTaskId)).filter(Boolean));
  if (!sourceIds.size) return [];
  const shiftedTargets = new Map(
    carried
      .map((task) => objectValue(task))
      .filter((task) => safeText(task.sourceTaskId))
      .map((task) => [safeText(task.sourceTaskId), validDateKey(task.date) || ""])
  );
  const shifted = [];

  Object.values(plans).forEach((tasks = []) => {
    arrayValue(tasks).forEach((task) => {
      const id = taskId(task);
      if (!sourceIds.has(id) || isTaskDone(task, taskState)) return;
      task.status = "shifted";
      task.shiftedTo = shiftedTargets.get(id) || "";
      task.updatedAt = new Date().toISOString();
      shifted.push(id);
    });
  });

  return shifted;
}

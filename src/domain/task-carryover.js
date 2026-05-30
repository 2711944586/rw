/**
 * Helpers for rolling unfinished study tasks forward without inventing
 * extra daily workload.
 */

export function isTaskDone(task, taskState = {}) {
  return task?.status === "done" || taskState[task?.id] === true;
}

export function activeTasks(tasks = [], taskState = {}) {
  return tasks.filter((task) => task && task.status !== "shifted" && !task.deleted && !isTaskDone(task, taskState));
}

export function collectCarryoverTasks(weekPlans = {}, taskState = {}, targetDate, options = {}) {
  const limit = options.limit ?? 2;
  const minMinutes = options.minMinutes ?? 25;
  const maxMinutes = options.maxMinutes ?? 90;
  if (!targetDate || limit <= 0) return [];

  const existingToday = weekPlans[targetDate] || [];
  const existingSourceIds = new Set(existingToday.map((task) => task.sourceTaskId || task.carriedFrom || ""));

  return Object.entries(weekPlans)
    .filter(([date]) => date < targetDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([, tasks]) => activeTasks(tasks, taskState))
    .filter((task) => !existingSourceIds.has(task.id))
    .slice(0, limit)
    .map((task, index) => ({
      ...task,
      id: `${targetDate}-carry-${task.id}`,
      date: targetDate,
      text: task.text?.startsWith("顺延：") ? task.text : `顺延：${task.text}`,
      minutes: Math.min(maxMinutes, Math.max(minMinutes, task.minutes || minMinutes)),
      priority: index + 1,
      status: "todo",
      locked: true,
      source: "carryover",
      sourceTaskId: task.id,
      carriedFrom: task.date || task.id?.slice(0, 10) || "",
      completedAt: "",
      recordApplied: false,
      updatedAt: new Date().toISOString()
    }));
}

export function markCarriedSourceTasks(weekPlans = {}, carriedTasks = [], taskState = {}) {
  const sourceIds = new Set(carriedTasks.map((task) => task.sourceTaskId).filter(Boolean));
  if (!sourceIds.size) return [];
  const shifted = [];

  Object.values(weekPlans).forEach((tasks = []) => {
    tasks.forEach((task) => {
      if (!sourceIds.has(task.id) || isTaskDone(task, taskState)) return;
      task.status = "shifted";
      task.shiftedTo = carriedTasks.find((item) => item.sourceTaskId === task.id)?.date || "";
      task.updatedAt = new Date().toISOString();
      shifted.push(task.id);
    });
  });

  return shifted;
}

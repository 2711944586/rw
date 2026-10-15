/**
 * Orders the existing daily tasks with the capacity engine.
 * The engine decides which open tasks fit. Locked tasks stay even when they
 * exceed the available time, and the caller shows that conflict.
 */
import { generateDailyPlan } from "./plan-generator.js";
import { subjectKey } from "./study-strategy.js";

const PHASE_NAMES = {
  A: "foundation",
  F: "pastExam",
  G: "pastExam",
  H: "sprint"
};

function phaseName(phaseId) {
  return PHASE_NAMES[phaseId] || "reinforcement";
}

function engineSubject(subject) {
  const key = subjectKey(subject);
  if (key === "cs408") return "408";
  return key || "review";
}

function candidateFromTask(task, phase) {
  const review = Boolean(task.reviewItemId) || task.source === "carryover";
  return {
    id: task.id,
    topicId: task.topicId || task.id,
    subject: engineSubject(task.subject),
    estimatedMinutes: Number(task.minutes) > 0 ? Number(task.minutes) : 30,
    priority: Number(task.priority) > 0 ? Number(task.priority) : 9,
    phase,
    category: review ? "review" : "phaseCore",
    isCore: ["math", "cs408"].includes(subjectKey(task.subject))
  };
}

export function capacityOrderDailyTasks(tasks, input = {}) {
  const source = (Array.isArray(tasks) ? tasks : []).filter((task) => task && task.id);
  if (!source.length) return [];
  const phase = phaseName(input.phaseId);
  const candidates = source.map((task) => candidateFromTask(task, phase));
  const planned = generateDailyPlan({
    availableMinutes: Number(input.availableMinutes) || 0,
    phase,
    consecutiveMissedDays: Number(input.consecutiveMissedDays) || 0,
    historyMedian: input.historyMedian || { taskCount: 0, minutes: 0 },
    dueReviews: candidates.filter((task) => task.category === "review"),
    candidateTopics: candidates.filter((task) => task.category !== "review")
  });
  const byId = new Map(source.map((task) => [task.id, task]));
  const chosen = [];
  const seen = new Set();
  for (const item of planned) {
    const task = byId.get(item?.id);
    if (!task || seen.has(task.id)) continue;
    seen.add(task.id);
    chosen.push(task);
  }
  const preserved = source.filter((task) => !seen.has(task.id) && (task.locked === true || task.subject === "英语"));
  const reviewFirst = chosen.filter((task) => task.reviewItemId || task.source === "carryover");
  const rest = chosen.filter((task) => !reviewFirst.includes(task));
  return [...reviewFirst, ...preserved, ...rest];
}

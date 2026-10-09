/**
 * Execution loop rules for the production study desk.
 *
 * Pure functions only: completion evidence, plan diff, load signals,
 * review grades, and the five user-facing sync states.
 */

export const LOAD_TIERS = Object.freeze(["bottomline", "normal", "strong"]);
export const REVIEW_GRADES = Object.freeze(["again", "hard", "good", "easy"]);
export const SYNC_STATUS_LABELS = Object.freeze({
  local: "仅本机",
  unconfigured: "仅本机",
  pending: "等待上传",
  syncing: "等待上传",
  synced: "已同步",
  paused: "同步暂停",
  offline: "等待上传",
  error: "等待上传",
  conflict: "冲突待处理"
});

const COMPLETION_FIELDS = new Set([
  "math",
  "cs408",
  "english",
  "politics",
  "project",
  "mathProblems",
  "csProblems",
  "reading"
]);

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampInteger(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function textValue(value, maxLength = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function subjectEntryKey(subject) {
  return {
    数学: "math",
    408: "cs408",
    英语: "english",
    政治: "politics",
    项目: "project",
    补弱: "math"
  }[subject] || "";
}

export function problemFieldForSubject(subject) {
  if (subject === "数学" || subject === "补弱") return "mathProblems";
  if (subject === "408") return "csProblems";
  if (subject === "英语") return "reading";
  return "";
}

/**
 * @param {object} input
 * @returns {{ ok: true, evidence: object } | { ok: false, message: string }}
 */
export function validateCompletionEvidence(input = {}) {
  const minutes = Number(input.minutes);
  const problems = Number(input.problems);
  const mistake = textValue(input.mistake, 300);
  const nextTask = textValue(input.nextTask, 300);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
    return { ok: false, message: "有效分钟请填写 1-240 的整数。" };
  }
  if (!Number.isInteger(problems) || problems < 0 || problems > 999) {
    return { ok: false, message: "题量请填写 0-999 的整数。" };
  }
  if (!mistake) return { ok: false, message: "请写一条错因或收获。" };
  if (!nextTask) return { ok: false, message: "请写明日第一任务。" };
  return {
    ok: true,
    evidence: { minutes, problems, mistake, nextTask }
  };
}

/**
 * Apply verified completion evidence onto one daily record.
 * Returns the next record and the numeric changes that can be undone.
 */
export function applyCompletionEvidence(entry = {}, task = {}, evidence = {}) {
  /** @type {Record<string, any>} */
  const next = { ...entry };
  const changes = [];
  const apply = (field, after) => {
    if (!COMPLETION_FIELDS.has(field)) return;
    const before = finiteNumber(next[field]);
    const value = finiteNumber(after);
    if (before === value) return;
    changes.push({ field, before, after: value });
    next[field] = value;
  };

  const minuteKey = subjectEntryKey(task.subject);
  if (minuteKey) apply(minuteKey, finiteNumber(next[minuteKey]) + evidence.minutes);
  const problemKey = problemFieldForSubject(task.subject);
  if (problemKey) apply(problemKey, finiteNumber(next[problemKey]) + evidence.problems);
  next.quality = clampInteger(next.quality, 1, 5, 3);
  next.nextTask = evidence.nextTask;
  const note = textValue(next.note, 2000);
  const line = `${task.subject || "任务"}：${evidence.mistake}`;
  next.note = note.includes(line) ? note : textValue(note ? `${note}；${line}` : line, 2000);
  return {
    entry: next,
    impact: {
      date: task.date || "",
      changes
    }
  };
}

export function sanitizeLoadTier(value, fallback = "") {
  return LOAD_TIERS.includes(value) ? value : fallback;
}

export function sanitizeSleepHours(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(14, Math.max(0, Math.round(numeric * 10) / 10));
}

export function sanitizeFatigue(value) {
  return clampInteger(value, 1, 5, 3);
}

const LOAD_MARKER = /\[负荷 (bottomline|normal|strong)\]/g;
const SLEEP_MARKER = /\[睡眠 (\d+(?:\.\d)?)h\]/g;
const FATIGUE_MARKER = /\[疲劳 ([1-5])\]/g;

/**
 * Keep load signals inside the daily note so existing cloud columns stay compatible.
 * The structured fields remain on the local record for forms and gates.
 * Omitted signals stay out of the note. A form default must not be written back.
 */
export function encodeLoadNote(note, { loadTier = "", sleepHours = 0, fatigue = null } = {}) {
  const body = textValue(String(note || "").replace(LOAD_MARKER, "").replace(SLEEP_MARKER, "").replace(FATIGUE_MARKER, ""), 1700)
    .replace(/\s+/g, " ")
    .trim();
  const tags = [];
  const tier = sanitizeLoadTier(loadTier, "");
  const sleep = sanitizeSleepHours(sleepHours);
  const tired = Number(fatigue);
  if (tier) tags.push(`[负荷 ${tier}]`);
  if (sleep > 0) tags.push(`[睡眠 ${sleep}h]`);
  if (Number.isInteger(tired) && tired >= 1 && tired <= 5) tags.push(`[疲劳 ${tired}]`);
  return textValue([body, ...tags].filter(Boolean).join(" "), 2000);
}

export function decodeLoadNote(note = "") {
  const text = typeof note === "string" ? note : "";
  const tier = (text.match(/\[负荷 (bottomline|normal|strong)\]/) || [])[1] || "";
  const sleep = Number((text.match(/\[睡眠 (\d+(?:\.\d)?)h\]/) || [])[1] || 0);
  const fatigue = Number((text.match(/\[疲劳 ([1-5])\]/) || [])[1] || 0);
  return {
    loadTier: sanitizeLoadTier(tier, ""),
    sleepHours: sanitizeSleepHours(sleep),
    fatigue: fatigue ? sanitizeFatigue(fatigue) : 0,
    note: text.replace(LOAD_MARKER, "").replace(SLEEP_MARKER, "").replace(FATIGUE_MARKER, "").replace(/\s+/g, " ").trim()
  };
}

/**
 * Bottom-line day when either signal is present:
 * completion stays under 60% for 3 recorded days, or two latest nights are under 7 hours.
 */
export function shouldUseBottomLine(days = []) {
  const recent = Array.isArray(days) ? days.slice(-3) : [];
  const lowCompletion = recent.length >= 3 && recent.every((day) => {
    const planned = finiteNumber(day?.plannedMinutes);
    const done = finiteNumber(day?.doneMinutes);
    return planned > 0 && done / planned < 0.6;
  });
  const nights = (Array.isArray(days) ? days : [])
    .map((day) => sanitizeSleepHours(day?.sleepHours))
    .filter((hours) => hours > 0)
    .slice(-2);
  const shortSleep = nights.length >= 2 && nights.every((hours) => hours < 7);
  return { lowCompletion, shortSleep, active: lowCompletion || shortSleep };
}

export function completionRatio(plannedMinutes, doneMinutes) {
  const planned = finiteNumber(plannedMinutes);
  if (planned <= 0) return 1;
  return Math.min(1, Math.max(0, finiteNumber(doneMinutes) / planned));
}

/**
 * @param {Array<object>} currentTasks
 * @param {Array<object>} nextTasks
 */
export function diffPlan(currentTasks = [], nextTasks = []) {
  const current = Array.isArray(currentTasks) ? currentTasks : [];
  const next = Array.isArray(nextTasks) ? nextTasks : [];
  const nextIds = new Set(next.map((task) => task?.id).filter(Boolean));
  const currentById = new Map(current.filter((task) => task?.id).map((task) => [task.id, task]));
  const kept = [];
  const replaced = [];
  next.forEach((task) => {
    const previous = currentById.get(task.id);
    if (!previous) {
      replaced.push({ id: task.id, reason: "新增", text: task.text || "" });
      return;
    }
    if (previous.locked || previous.status === "done") {
      kept.push({ id: task.id, reason: previous.locked ? "已锁定" : "已完成", text: previous.text || "" });
      return;
    }
    if ((previous.text || "") !== (task.text || "") || Number(previous.minutes) !== Number(task.minutes)) {
      replaced.push({ id: task.id, reason: "内容更新", text: task.text || "" });
      return;
    }
    kept.push({ id: task.id, reason: "保持不变", text: task.text || "" });
  });
  current.forEach((task) => {
    if (!task?.id || nextIds.has(task.id) || task.locked || task.status === "done") return;
    replaced.push({ id: task.id, reason: "移出今日", text: task.text || "" });
  });
  return { kept, replaced };
}

/**
 * Merge a regenerated task list with tasks that must survive regeneration.
 */
export function mergeRegeneratedTasks(currentTasks = [], nextTasks = []) {
  const current = Array.isArray(currentTasks) ? currentTasks : [];
  const protectedTasks = current.filter((task) => task && (task.locked || task.status === "done" || task.status === "shifted"));
  const protectedIds = new Set(protectedTasks.map((task) => task.id));
  const fresh = (Array.isArray(nextTasks) ? nextTasks : []).filter((task) => task && !protectedIds.has(task.id));
  return [...protectedTasks, ...fresh];
}

export function reviewGradeEffect(grade, failStreak = 0) {
  const normalized = REVIEW_GRADES.includes(grade) ? grade : "good";
  const streak = clampInteger(failStreak, 0, 99, 0);
  if (normalized === "again" || normalized === "hard") {
    const nextStreak = streak + 1;
    return {
      passed: false,
      failStreak: nextStreak,
      leech: nextStreak >= 3,
      rescheduleDays: 1,
      quality: normalized === "again" ? 1 : 2
    };
  }
  return {
    passed: true,
    failStreak: 0,
    leech: false,
    rescheduleDays: 0,
    quality: normalized === "easy" ? 5 : 4
  };
}

/**
 * Map internal sync fields onto the five labels a learner should see.
 */
export function presentSyncStatus(sync = {}, options = {}) {
  const configured = options.configured !== false;
  const signedIn = Boolean(options.signedIn);
  const status = sync?.status || "local";
  if (!configured || !signedIn) {
    return { key: "local", label: SYNC_STATUS_LABELS.local, pending: false };
  }
  if (sync?.cloudPaused || status === "paused") {
    return { key: "paused", label: SYNC_STATUS_LABELS.paused, pending: false };
  }
  if (status === "conflict") {
    return { key: "conflict", label: SYNC_STATUS_LABELS.conflict, pending: true };
  }
  if (status === "error" && /duplicate key|conflict|42P10/i.test(String(sync?.lastError || ""))) {
    return { key: "conflict", label: SYNC_STATUS_LABELS.conflict, pending: true };
  }
  if (status === "synced") {
    return { key: "synced", label: SYNC_STATUS_LABELS.synced, pending: false };
  }
  return { key: "pending", label: SYNC_STATUS_LABELS.pending, pending: true };
}

export function weeklyReviewPrompt(date = new Date()) {
  const day = date instanceof Date ? date.getDay() : new Date(date).getDay();
  if (day !== 0) return null;
  return {
    active: true,
    choices: ["总量", "题型难度", "复盘上限", "一个弱项"],
    text: "周日只调整一个变量。写下周一的第一个数学动作和第一个 408 动作。"
  };
}

export const OFFICIAL_CHECKLIST = Object.freeze([
  { id: "brochure-2027-09", due: "2027-09-15", text: "核验北京大学 2028 入学招生简章、专业目录和考试科目。" },
  { id: "site-2027-10", due: "2027-10-20", text: "核验报考点、网上确认时间和初试安排，以研招网当年公告为准。" },
  { id: "ticket-2027-12", due: "2027-12-10", text: "核验准考证、考场路线和考试日作息。" }
]);

export function dueOfficialChecks(today, doneIds = []) {
  const done = new Set(Array.isArray(doneIds) ? doneIds : []);
  return OFFICIAL_CHECKLIST.filter((item) => item.due <= today && !done.has(item.id));
}

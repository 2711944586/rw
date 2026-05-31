import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const PLAN_LOGIC_VERSION = "3.3-start-2026-06-ramp";

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

function normalizeRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1, number > 1 ? number / 100 : number);
}

function asDate(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dateOr(value, fallbackISO) {
  return asDate(value) || fallbackISO.slice(0, 10);
}

function asTimestamp(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function asInteger(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.round(Math.min(max, Math.max(min, number)));
}

function asString(value, fallback = "") {
  const text = value == null ? fallback : String(value);
  return text || fallback;
}

function asStringArray(value, limit = 12) {
  return Array.isArray(value) ? value.map((item) => String(item)).slice(0, limit) : [];
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (key) map.set(key, item);
  });
  return [...map.values()];
}

function taskDateFor(task, fallbackISO) {
  return asDate(task.date || task.task_date) || asDate(task.id?.slice(0, 10)) || fallbackISO.slice(0, 10);
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user || null;
}

export async function signInWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return {
    user: data.user,
    session: data.session
  };
}

export async function signUpWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined
  });
  if (error) throw error;
  return {
    user: data.user,
    session: data.session,
    needsEmailConfirmation: Boolean(data.user && !data.session)
  };
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => data.subscription.unsubscribe();
}

export async function loadCloudState(baseState) {
  const user = await getCurrentUser();
  if (!supabase || !user) return null;

  const [
    profile,
    records,
    tasks,
    reviews,
    topics,
    scores,
    resources,
    snapshots
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("daily_records").select("*").eq("user_id", user.id),
    supabase.from("study_tasks").select("*").eq("user_id", user.id).is("deleted_at", null),
    supabase.from("review_items").select("*").eq("user_id", user.id).is("deleted_at", null),
    supabase.from("topic_progress").select("*").eq("user_id", user.id),
    supabase.from("mock_scores").select("*").eq("user_id", user.id).is("deleted_at", null),
    supabase.from("resources").select("*").eq("user_id", user.id),
    supabase.from("snapshots").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
  ]);

  const errors = [profile, records, tasks, reviews, topics, scores, resources, snapshots]
    .map((result) => result.error)
    .filter(Boolean);
  if (errors.length) throw errors[0];

  const state = structuredClone(baseState);
  if (profile.data) {
    state.settings = {
      ...state.settings,
      ...(profile.data.settings || {}),
      targetExamDate: profile.data.target_exam_date || state.settings.targetExamDate,
      weekdayMinutes: profile.data.weekday_minutes ?? state.settings.weekdayMinutes,
      weekendMinutes: profile.data.weekend_minutes ?? state.settings.weekendMinutes,
      taskCount: profile.data.task_count ?? state.settings.taskCount,
      coreRatio: profile.data.core_ratio ?? state.settings.coreRatio,
      reviewDays: profile.data.review_days || state.settings.reviewDays,
      density: profile.data.density_mode || state.settings.density,
      retroTime: profile.data.retro_time || state.settings.retroTime
    };
  }

  state.entries = Object.fromEntries((records.data || []).map((row) => [row.study_date, {
    math: row.math_minutes || 0,
    cs408: row.cs408_minutes || 0,
    english: row.english_minutes || 0,
    politics: row.politics_minutes || 0,
    project: row.project_minutes || 0,
    mathProblems: row.math_problems || 0,
    csProblems: row.cs408_problems || 0,
    reading: row.reading_count || 0,
    newMistakes: row.new_mistakes || 0,
    fixedMistakes: row.fixed_mistakes || 0,
    quality: row.quality_score || 3,
    nextTask: row.next_task || "",
    note: row.note || "",
    updatedAt: row.updated_at
  }]));

  state.weekPlans = {};
  state.tasks = {};
  (tasks.data || []).forEach((row) => {
    const task = {
      id: row.id,
      date: row.task_date,
      subject: row.subject,
      text: row.title,
      topicId: row.topic_id || "",
      minutes: row.minutes || 0,
      priority: row.priority || 0,
      status: row.status || "todo",
      locked: Boolean(row.locked),
      source: row.source || "generated",
      sourceTaskId: row.source_task_id || "",
      carriedFrom: row.carried_from || "",
      shiftedTo: row.shifted_to || "",
      completedAt: row.completed_at || "",
      recordApplied: Boolean(row.record_applied),
      contractType: row.contract_type || "problems",
      requiredProblemCount: row.required_problem_count || 0,
      requiredAccuracy: row.required_accuracy || 0,
      requiredArtifacts: row.required_artifacts || [],
      minutesMin: row.minutes_min || 0,
      minutesMax: row.minutes_max || 0,
      actualProblems: row.actual_problems || 0,
      actualCorrect: row.actual_correct || 0,
      actualMinutes: row.actual_minutes || 0,
      evidenceSubmitted: Boolean(row.evidence_submitted),
      updatedAt: row.updated_at
    };
    if (!state.weekPlans[task.date]) state.weekPlans[task.date] = [];
    state.weekPlans[task.date].push(task);
    state.tasks[task.id] = task.status === "done";
  });

  state.reviewItems = (reviews.data || []).map((row) => ({
    id: row.id,
    sourceTaskId: row.source_task_id || "",
    subject: row.subject,
    text: row.title,
    round: row.review_round,
    dueDate: row.due_date,
    status: row.status || "due",
    done: row.status === "done",
    delayCount: row.delay_count || 0,
    failureReason: row.failure_reason || "",
    quality: row.quality_score || 0,
    completedAt: row.completed_at || "",
    intervalIndex: row.interval_index || 0,
    failStreak: row.fail_streak || 0,
    lastResult: row.last_result || "",
    lastSubmittedDate: row.last_submitted_date || "",
    topicId: row.topic_id || "",
    updatedAt: row.updated_at
  }));

  state.topics = {};
  state.topicEvidence = {};
  (topics.data || []).forEach((row) => {
    state.topics[row.topic_id] = row.status_value || 0;
    state.topicEvidence[row.topic_id] = {
      problems: row.problems_done || 0,
      accuracy: row.accuracy || 0,
      evidence: row.evidence || "",
      lastReviewDate: row.last_review_date || "",
      totalProblems: row.total_problems || 0,
      recent14dAccuracy: row.recent_14d_accuracy || 0,
      lastReviewAt: row.last_review_at || "",
      masteryStatus: row.mastery_status || "",
      prerequisites: row.prerequisites || []
    };
  });

  state.scores = (scores.data || []).map((row) => ({
    id: row.id,
    date: row.mock_date,
    name: row.name,
    politics: row.politics || 0,
    english: row.english || 0,
    math: row.math || 0,
    cs408: row.cs408 || 0,
    total: row.total || 0,
    note: row.note || "",
    updatedAt: row.updated_at
  }));

  state.resources = Object.fromEntries((resources.data || []).map((row) => [row.resource_key, row.progress || 0]));
  state.snapshots = (snapshots.data || []).map((row) => row.payload).filter(Boolean);
  state.sync = { status: "synced", lastSyncAt: new Date().toISOString(), lastError: "", pending: false };
  state.user = { id: user.id, email: user.email || "" };
  return state;
}

export async function saveCloudState(state) {
  const user = await getCurrentUser();
  if (!supabase || !user) return null;
  const now = new Date().toISOString();

  const profile = {
    user_id: user.id,
    settings: state.settings,
    target_exam_date: asDate(state.settings.targetExamDate),
    weekday_minutes: asInteger(state.settings.weekdayMinutes, 60, 720),
    weekend_minutes: asInteger(state.settings.weekendMinutes, 60, 840),
    task_count: asInteger(state.settings.taskCount, 3, 4),
    core_ratio: asInteger(state.settings.coreRatio, 55, 85),
    review_days: Array.isArray(state.settings.reviewDays) ? state.settings.reviewDays.map((day) => asInteger(day, 1, 365)) : [1, 3, 7, 14, 30],
    density_mode: ["focus", "balanced", "detail"].includes(state.settings.density) ? state.settings.density : "focus",
    retro_time: state.settings.retroTime || "22:00",
    plan_version: state.settings.planLogicVersion || PLAN_LOGIC_VERSION,
    last_synced_at: now,
    updated_at: now
  };

  const records = Object.entries(state.entries || {}).flatMap(([date, entry]) => {
    const studyDate = asDate(date);
    if (!studyDate) return [];
    const row = entry || {};
    return [{
      user_id: user.id,
      study_date: studyDate,
      math_minutes: asInteger(row.math),
      cs408_minutes: asInteger(row.cs408),
      english_minutes: asInteger(row.english),
      politics_minutes: asInteger(row.politics),
      project_minutes: asInteger(row.project),
      math_problems: asInteger(row.mathProblems),
      cs408_problems: asInteger(row.csProblems),
      reading_count: asInteger(row.reading),
      new_mistakes: asInteger(row.newMistakes),
      fixed_mistakes: asInteger(row.fixedMistakes),
      quality_score: asInteger(row.quality || 3, 1, 5),
      next_task: asString(row.nextTask),
      note: asString(row.note),
      updated_at: asTimestamp(row.updatedAt, now)
    }];
  });

  const tasks = uniqueBy(Object.values(state.weekPlans || {}).flat().filter(Boolean).map((task) => ({
    id: asString(task.id),
    user_id: user.id,
    task_date: taskDateFor(task, now),
    subject: asString(task.subject, "复盘"),
    topic_id: asString(task.topicId),
    title: asString(task.text, "回炉错题，写明下次识别信号"),
    minutes: asInteger(task.minutes),
    priority: asInteger(task.priority),
    status: task.status || (state.tasks?.[task.id] === true ? "done" : "todo"),
    locked: Boolean(task.locked),
    source: task.source || "generated",
    source_task_id: asString(task.sourceTaskId || task.source_task_id),
    carried_from: asDate(task.carriedFrom || task.carried_from),
    shifted_to: asDate(task.shiftedTo || task.shifted_to),
    completed_at: asTimestamp(task.completedAt),
    record_applied: Boolean(task.recordApplied),
    contract_type: task.contractType || task.contract_type || "problems",
    required_problem_count: asInteger(task.requiredProblemCount ?? task.required_problem_count),
    required_accuracy: normalizeRatio(task.requiredAccuracy ?? task.required_accuracy),
    required_artifacts: asStringArray(task.requiredArtifacts || task.required_artifacts),
    minutes_min: asInteger(task.minutesMin ?? task.minutes_min),
    minutes_max: asInteger(task.minutesMax ?? task.minutes_max),
    actual_problems: asInteger(task.actualProblems ?? task.actual_problems),
    actual_correct: asInteger(task.actualCorrect ?? task.actual_correct),
    actual_minutes: asInteger(task.actualMinutes ?? task.actual_minutes),
    evidence_submitted: Boolean(task.evidenceSubmitted || task.evidence_submitted),
    updated_at: asTimestamp(task.updatedAt || task.updated_at, now)
  })), (task) => task.id);

  const reviews = uniqueBy((state.reviewItems || []).filter(Boolean).map((item) => ({
    id: asString(item.id),
    user_id: user.id,
    source_task_id: asString(item.sourceTaskId || item.source_task_id),
    subject: asString(item.subject, "复盘"),
    title: asString(item.text || item.title, "复盘"),
    review_round: asString(item.round || item.review_round),
    due_date: asDate(item.dueDate || item.due_date) || now.slice(0, 10),
    status: item.done ? "done" : item.status || "due",
    delay_count: asInteger(item.delayCount || item.delay_count),
    failure_reason: asString(item.failureReason || item.failure_reason),
    quality_score: asInteger(item.quality || item.quality_score, 0, 5),
    completed_at: asTimestamp(item.completedAt || item.completed_at),
    interval_index: asInteger(item.intervalIndex ?? item.interval_index),
    fail_streak: asInteger(item.failStreak ?? item.fail_streak),
    last_result: asString(item.lastResult || item.last_result),
    last_submitted_date: asDate(item.lastSubmittedDate || item.last_submitted_date),
    topic_id: asString(item.topicId || item.topic_id),
    updated_at: asTimestamp(item.updatedAt || item.updated_at, now)
  })), (item) => item.id);

  const topics = Object.entries(state.topics || {}).map(([topicId, value]) => {
    const evidence = state.topicEvidence?.[topicId] || {};
    return {
      user_id: user.id,
      topic_id: topicId,
      status_value: value || 0,
      problems_done: asInteger(evidence.problems),
      accuracy: asInteger(evidence.accuracy, 0, 100),
      evidence: asString(evidence.evidence),
      last_review_date: asDate(evidence.lastReviewDate || evidence.last_review_date),
      total_problems: asInteger(evidence.totalProblems ?? evidence.total_problems ?? evidence.problems),
      recent_14d_accuracy: normalizeRatio(evidence.recent14dAccuracy ?? evidence.recent_14d_accuracy ?? evidence.accuracy),
      last_review_at: asTimestamp(evidence.lastReviewAt || evidence.last_review_at),
      mastery_status: evidence.masteryStatus || evidence.mastery_status || (value >= 2 ? "mastered" : value === 1 ? "needs_review" : "learning"),
      prerequisites: asStringArray(evidence.prerequisites),
      updated_at: asTimestamp(evidence.updatedAt || evidence.updated_at, now)
    };
  }).filter((topic) => topic.topic_id);

  const scores = uniqueBy((state.scores || []).filter(Boolean).map((score) => ({
    id: asString(score.id),
    user_id: user.id,
    mock_date: dateOr(score.date, now),
    name: asString(score.name, "未命名模考"),
    politics: asInteger(score.politics, 0, 100),
    english: asInteger(score.english, 0, 100),
    math: asInteger(score.math, 0, 150),
    cs408: asInteger(score.cs408, 0, 150),
    total: asInteger(score.total || (Number(score.politics || 0) + Number(score.english || 0) + Number(score.math || 0) + Number(score.cs408 || 0)), 0, 500),
    note: asString(score.note),
    updated_at: asTimestamp(score.updatedAt || score.updated_at, now)
  })), (score) => score.id);

  const resources = Object.entries(state.resources || {}).map(([key, value]) => ({
    user_id: user.id,
    resource_key: key,
    progress: Number(value) || 0,
    updated_at: now
  }));

  const deleted = state.deleted || {};
  const deletedRecords = asStringArray(deleted.records, 500).filter(asDate);
  const deletedScores = asStringArray(deleted.scores, 500).filter(Boolean);
  const deletedTasks = asStringArray(deleted.tasks, 500).filter(Boolean);
  const deletedReviews = asStringArray(deleted.reviews, 500).filter(Boolean);
  const operations = [
    ["profiles", supabase.from("profiles").upsert(profile, { onConflict: "user_id" })]
  ];
  if (records.length) operations.push(["daily_records", supabase.from("daily_records").upsert(records, { onConflict: "user_id,study_date" })]);
  if (tasks.length) operations.push(["study_tasks", supabase.from("study_tasks").upsert(tasks, { onConflict: "user_id,id" })]);
  if (reviews.length) operations.push(["review_items", supabase.from("review_items").upsert(reviews, { onConflict: "user_id,id" })]);
  if (topics.length) operations.push(["topic_progress", supabase.from("topic_progress").upsert(topics, { onConflict: "user_id,topic_id" })]);
  if (scores.length) operations.push(["mock_scores", supabase.from("mock_scores").upsert(scores, { onConflict: "user_id,id" })]);
  if (resources.length) operations.push(["resources", supabase.from("resources").upsert(resources, { onConflict: "user_id,resource_key" })]);
  if (deletedRecords.length) {
    operations.push(["daily_records.delete", supabase.from("daily_records").delete().eq("user_id", user.id).in("study_date", deletedRecords)]);
  }
  if (deletedScores.length) {
    operations.push(["mock_scores.delete", supabase.from("mock_scores").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).in("id", deletedScores)]);
  }
  if (deletedTasks.length) {
    operations.push(["study_tasks.delete", supabase.from("study_tasks").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).in("id", deletedTasks)]);
  }
  if (deletedReviews.length) {
    operations.push(["review_items.delete", supabase.from("review_items").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).in("id", deletedReviews)]);
  }

  for (const [tableName, operation] of operations) {
    const { error } = await operation;
    if (error) {
      const details = [error.message, error.details, error.hint].filter(Boolean).join(" ");
      throw new Error(`${tableName}: ${details || error.code || "同步写入失败"}`);
    }
  }
  return { syncedAt: now };
}

export async function saveCloudSnapshot(state, reason = "manual") {
  const user = await getCurrentUser();
  if (!supabase || !user) return;
  const payload = {
    schemaVersion: state.schemaVersion,
    reason,
    createdAt: new Date().toISOString(),
    entries: state.entries,
    reviewItems: state.reviewItems,
    scores: state.scores,
    topics: state.topics,
    topicEvidence: state.topicEvidence,
    settings: state.settings
  };
  const { error } = await supabase.from("snapshots").insert({
    user_id: user.id,
    reason,
    payload
  });
  if (error) throw error;
}

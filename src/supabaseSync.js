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
  return data.user;
}

export async function signUpWithEmail(email, password) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
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
    target_exam_date: state.settings.targetExamDate,
    weekday_minutes: state.settings.weekdayMinutes,
    weekend_minutes: state.settings.weekendMinutes,
    task_count: state.settings.taskCount,
    core_ratio: state.settings.coreRatio,
    review_days: state.settings.reviewDays,
    density_mode: state.settings.density || "focus",
    retro_time: state.settings.retroTime || "22:00",
    plan_version: state.settings.planLogicVersion || PLAN_LOGIC_VERSION,
    last_synced_at: now,
    updated_at: now
  };

  const records = Object.entries(state.entries || {}).map(([date, entry]) => ({
    user_id: user.id,
    study_date: date,
    math_minutes: entry.math || 0,
    cs408_minutes: entry.cs408 || 0,
    english_minutes: entry.english || 0,
    politics_minutes: entry.politics || 0,
    project_minutes: entry.project || 0,
    math_problems: entry.mathProblems || 0,
    cs408_problems: entry.csProblems || 0,
    reading_count: entry.reading || 0,
    new_mistakes: entry.newMistakes || 0,
    fixed_mistakes: entry.fixedMistakes || 0,
    quality_score: entry.quality || 3,
    next_task: entry.nextTask || "",
    note: entry.note || "",
    updated_at: now
  }));

  const tasks = Object.values(state.weekPlans || {}).flat().map((task) => ({
    id: task.id,
    user_id: user.id,
    task_date: taskDateFor(task, now),
    subject: task.subject,
    topic_id: task.topicId || "",
    title: task.text,
    minutes: task.minutes || 0,
    priority: task.priority || 0,
    status: task.status || (state.tasks?.[task.id] === true ? "done" : "todo"),
    locked: Boolean(task.locked),
    source: task.source || "generated",
    source_task_id: task.sourceTaskId || task.source_task_id || "",
    carried_from: asDate(task.carriedFrom || task.carried_from),
    shifted_to: asDate(task.shiftedTo || task.shifted_to),
    completed_at: task.completedAt || null,
    record_applied: Boolean(task.recordApplied),
    contract_type: task.contractType || task.contract_type || "problems",
    required_problem_count: task.requiredProblemCount ?? task.required_problem_count ?? 0,
    required_accuracy: normalizeRatio(task.requiredAccuracy ?? task.required_accuracy),
    required_artifacts: task.requiredArtifacts || task.required_artifacts || [],
    minutes_min: task.minutesMin ?? task.minutes_min ?? 0,
    minutes_max: task.minutesMax ?? task.minutes_max ?? 0,
    actual_problems: task.actualProblems ?? task.actual_problems ?? 0,
    actual_correct: task.actualCorrect ?? task.actual_correct ?? 0,
    actual_minutes: task.actualMinutes ?? task.actual_minutes ?? 0,
    evidence_submitted: Boolean(task.evidenceSubmitted || task.evidence_submitted),
    updated_at: task.updatedAt || now
  }));

  const reviews = (state.reviewItems || []).map((item) => ({
    id: item.id,
    user_id: user.id,
    source_task_id: item.sourceTaskId || "",
    subject: item.subject,
    title: item.text,
    review_round: item.round || "",
    due_date: asDate(item.dueDate || item.due_date) || now.slice(0, 10),
    status: item.done ? "done" : item.status || "due",
    delay_count: item.delayCount || 0,
    failure_reason: item.failureReason || "",
    quality_score: item.quality || 0,
    completed_at: item.completedAt || null,
    interval_index: item.intervalIndex ?? item.interval_index ?? 0,
    fail_streak: item.failStreak ?? item.fail_streak ?? 0,
    last_result: item.lastResult || item.last_result || "",
    last_submitted_date: asDate(item.lastSubmittedDate || item.last_submitted_date),
    topic_id: item.topicId || item.topic_id || "",
    updated_at: item.updatedAt || now
  }));

  const topics = Object.entries(state.topics || {}).map(([topicId, value]) => {
    const evidence = state.topicEvidence?.[topicId] || {};
    return {
      user_id: user.id,
      topic_id: topicId,
      status_value: value || 0,
      problems_done: evidence.problems || 0,
      accuracy: evidence.accuracy || 0,
      evidence: evidence.evidence || "",
      last_review_date: asDate(evidence.lastReviewDate || evidence.last_review_date),
      total_problems: evidence.totalProblems ?? evidence.total_problems ?? evidence.problems ?? 0,
      recent_14d_accuracy: normalizeRatio(evidence.recent14dAccuracy ?? evidence.recent_14d_accuracy ?? evidence.accuracy),
      last_review_at: evidence.lastReviewAt || evidence.last_review_at || null,
      mastery_status: evidence.masteryStatus || evidence.mastery_status || (value >= 2 ? "mastered" : value === 1 ? "needs_review" : "learning"),
      prerequisites: evidence.prerequisites || [],
      updated_at: evidence.updatedAt || now
    };
  });

  const scores = (state.scores || []).map((score) => ({
    id: score.id,
    user_id: user.id,
    mock_date: score.date,
    name: score.name,
    politics: score.politics || 0,
    english: score.english || 0,
    math: score.math || 0,
    cs408: score.cs408 || 0,
    total: score.total || 0,
    note: score.note || "",
    updated_at: score.updatedAt || now
  }));

  const resources = Object.entries(state.resources || {}).map(([key, value]) => ({
    user_id: user.id,
    resource_key: key,
    progress: Number(value) || 0,
    updated_at: now
  }));

  const deleted = state.deleted || {};
  const operations = [
    supabase.from("profiles").upsert(profile, { onConflict: "user_id" })
  ];
  if (records.length) operations.push(supabase.from("daily_records").upsert(records, { onConflict: "user_id,study_date" }));
  if (tasks.length) operations.push(supabase.from("study_tasks").upsert(tasks, { onConflict: "id" }));
  if (reviews.length) operations.push(supabase.from("review_items").upsert(reviews, { onConflict: "id" }));
  if (topics.length) operations.push(supabase.from("topic_progress").upsert(topics, { onConflict: "user_id,topic_id" }));
  if (scores.length) operations.push(supabase.from("mock_scores").upsert(scores, { onConflict: "id" }));
  if (resources.length) operations.push(supabase.from("resources").upsert(resources, { onConflict: "user_id,resource_key" }));
  if (deleted.records?.length) {
    operations.push(supabase.from("daily_records").delete().eq("user_id", user.id).in("study_date", deleted.records));
  }
  if (deleted.scores?.length) {
    operations.push(supabase.from("mock_scores").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).in("id", deleted.scores));
  }
  if (deleted.tasks?.length) {
    operations.push(supabase.from("study_tasks").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).in("id", deleted.tasks));
  }
  if (deleted.reviews?.length) {
    operations.push(supabase.from("review_items").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).in("id", deleted.reviews));
  }

  const results = await Promise.all(operations);
  const error = results.map((result) => result.error).find(Boolean);
  if (error) throw error;
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

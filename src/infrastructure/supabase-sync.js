import {
  CLEAN_START_VERSION,
  DEFAULT_EXAM_DATE as DEFAULT_TARGET_EXAM_DATE,
  DELETED_TYPES,
  PLAN_LOGIC_VERSION,
  PLAN_START_DATE
} from "../config/app-config.js";
import { getSyncConflictKey } from "./sync-contract.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const DEFAULT_REVIEW_DAYS = [1, 3, 7, 14, 30];
const DEFAULT_RETRO_TIME = "22:00";
const DEFAULT_PROFILE_NUMBERS = {
  weekdayMinutes: 180,
  weekendMinutes: 300,
  taskCount: 3,
  coreRatio: 65
};
const DENSITY_MODES = ["focus", "balanced", "detail"];
const MASTERY_STATUSES = ["learning", "needs_review", "mastered"];
const REVIEW_RESULTS = ["pass", "fail", "delay"];
const PLAN_SUBJECTS = ["math", "cs408", "english", "politics", "review", "project"];
const PLAN_INTENSITIES = ["bottomline", "normal", "strong"];
const EXPERIENCE_TRACKS = ["balanced", "mathHeavy", "cs408Heavy", "englishSteady", "latePolitics"];
const DEFAULT_PLAN_CONTROLS = {
  planIntensity: "normal",
  focusSubject: "auto",
  experienceTrack: "balanced",
  reviewLoad: 25,
  maxNewTopics: 3,
  rollingWindowDays: 30,
  enabledSubjects: ["math", "cs408", "english", "politics", "review", "project"]
};

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export let supabase = null;
let supabaseClientPromise = null;

async function getSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (supabase) return supabase;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        supabase = createClient(supabaseUrl, supabaseKey);
        return supabase;
      })
      .catch((error) => {
        supabaseClientPromise = null;
        throw error;
      });
  }
  return supabaseClientPromise;
}

export function hasPersistedCloudSession(storage) {
  if (!supabaseConfigured) return false;
  try {
    const targetStorage = storage || globalThis.localStorage;
    if (!targetStorage) return false;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return Boolean(projectRef && targetStorage.getItem(`sb-${projectRef}-auth-token`));
  } catch {
    return false;
  }
}

function normalizeRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1, number > 1 ? number / 100 : number);
}

function asDate(value) {
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

function dateOr(value, fallbackISO) {
  return asDate(value) || fallbackISO.slice(0, 10);
}

function asTimestamp(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return fallback;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function asInteger(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.round(Math.min(max, Math.max(min, number)));
}

function asString(value, fallback = "") {
  const type = typeof value;
  const text = value == null || !["string", "number", "bigint"].includes(type) ? fallback : String(value);
  return text || fallback;
}

function asStringArray(value, limit = 12, itemMaxLength = 160) {
  return Array.isArray(value)
    ? value.map((item) => safeCloudLabel(item, "", itemMaxLength)).filter(Boolean).slice(0, limit)
    : [];
}

function isOnOrAfterPlanStart(value) {
  const date = asDate(value);
  return Boolean(date && date >= PLAN_START_DATE);
}

function datedIdStarted(id = "") {
  const date = asDate(id);
  return !date || date >= PLAN_START_DATE;
}

function timestampStarted(value, fallbackISO = "") {
  const date = asTimestamp(value || fallbackISO);
  return Boolean(date && date.slice(0, 10) >= PLAN_START_DATE);
}

function topicRowStarted(row, cleanStartAppliedAt) {
  if (!row) return false;
  if (isOnOrAfterPlanStart(row.last_review_date)) return true;
  if (timestampStarted(row.last_review_at)) return true;
  return Boolean(cleanStartAppliedAt && asTimestamp(row.updated_at) >= cleanStartAppliedAt);
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
  return firstCloudDate([task.date, task.task_date, task.id]) || fallbackISO.slice(0, 10);
}

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return false;
}

function asEnum(value, allowed, fallback) {
  const text = asString(value);
  return allowed.includes(text) ? text : fallback;
}

function normalizeReviewDays(value, fallback = DEFAULT_REVIEW_DAYS) {
  const source = Array.isArray(value) ? value : fallback;
  const days = [...new Set(source.map((day) => asInteger(day, 1, 365)).filter(Boolean))].sort((a, b) => a - b);
  return days.length ? days : [...DEFAULT_REVIEW_DAYS];
}

function normalizeDateSetting(value, fallback = DEFAULT_TARGET_EXAM_DATE) {
  return asDate(value) || asDate(fallback) || DEFAULT_TARGET_EXAM_DATE;
}

function normalizeIntegerSetting(value, fallback, min, max, defaultValue = min) {
  const number = Number(value);
  if (Number.isFinite(number)) return asInteger(number, min, max);
  const fallbackNumber = Number(fallback);
  if (Number.isFinite(fallbackNumber)) return asInteger(fallbackNumber, min, max);
  return asInteger(defaultValue, min, max);
}

function normalizeDensityMode(value, fallback = "focus") {
  return asEnum(value, DENSITY_MODES, asEnum(fallback, DENSITY_MODES, "focus"));
}

function normalizeTimeSetting(value, fallback = DEFAULT_RETRO_TIME) {
  const normalize = (source) => {
    const text = asString(source).trim();
    const match = text.match(/^(\d{2}):(\d{2})$/);
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? text : "";
  };
  return normalize(value) || normalize(fallback) || DEFAULT_RETRO_TIME;
}

function normalizePlanVersion(value, fallback = PLAN_LOGIC_VERSION) {
  const text = asString(value).trim();
  if (text && text.length <= 80) return text;
  const fallbackText = asString(fallback).trim();
  return fallbackText && fallbackText.length <= 80 ? fallbackText : PLAN_LOGIC_VERSION;
}

function planSubjectKey(value) {
  const text = asString(value).trim();
  const aliases = {
    "数学": "math",
    "数学一": "math",
    "408": "cs408",
    "英语": "english",
    "英语一": "english",
    "政治": "politics",
    "复盘": "review",
    "补弱": "review",
    "项目": "project"
  };
  return aliases[text] || text;
}

function normalizePlanControlsSetting(value) {
  const source = cloudObject(value);
  const controls = { ...DEFAULT_PLAN_CONTROLS, ...source };
  controls.planIntensity = asEnum(controls.planIntensity, PLAN_INTENSITIES, DEFAULT_PLAN_CONTROLS.planIntensity);
  controls.focusSubject = planSubjectKey(controls.focusSubject);
  if (!["auto", ...PLAN_SUBJECTS].includes(controls.focusSubject)) controls.focusSubject = DEFAULT_PLAN_CONTROLS.focusSubject;
  controls.experienceTrack = asEnum(controls.experienceTrack, EXPERIENCE_TRACKS, DEFAULT_PLAN_CONTROLS.experienceTrack);
  controls.reviewLoad = asInteger(controls.reviewLoad, 15, 60);
  controls.maxNewTopics = asInteger(controls.maxNewTopics, 0, 4);
  controls.rollingWindowDays = asInteger(controls.rollingWindowDays, 7, 60);
  const enabled = Array.isArray(controls.enabledSubjects) ? controls.enabledSubjects : DEFAULT_PLAN_CONTROLS.enabledSubjects;
  controls.enabledSubjects = [...new Set(enabled.map(planSubjectKey).filter((subject) => PLAN_SUBJECTS.includes(subject)))];
  if (!controls.enabledSubjects.some((subject) => subject === "math" || subject === "cs408")) {
    controls.enabledSubjects.push("math", "cs408");
  }
  if (!controls.enabledSubjects.includes("review")) controls.enabledSubjects.push("review");
  return controls;
}

function defaultMasteryStatus(statusValue) {
  return statusValue >= 2 ? "mastered" : statusValue === 1 ? "needs_review" : "learning";
}

function normalizeMasteryStatus(value, statusValue) {
  return asEnum(value, MASTERY_STATUSES, defaultMasteryStatus(statusValue));
}

function safeProfileAssetKey(key) {
  const text = String(key || "").trim();
  if (!text || text.length > 120) return "";
  if (["__proto__", "constructor", "prototype"].includes(text)) return "";
  return text;
}

function safeCloudKey(value) {
  const text = asString(value).trim();
  if (!text || ["__proto__", "constructor", "prototype"].includes(text)) return "";
  return text;
}

function safeCloudLabel(value, fallback, maxLength = 80) {
  if (value == null) return fallback;
  if (!["string", "number", "bigint"].includes(typeof value)) return fallback;
  const text = String(value).trim();
  if (!text || text === "[object Object]" || ["__proto__", "constructor", "prototype"].includes(text)) return fallback;
  return text.slice(0, maxLength);
}

function firstCloudString(values, fallback = "") {
  for (const value of Array.isArray(values) ? values : []) {
    const text = asString(value);
    if (text) return text;
  }
  return fallback;
}

function firstCloudLabel(values, fallback = "", maxLength = 80) {
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeCloudLabel(value, "", maxLength);
    if (text) return text;
  }
  return fallback;
}

function firstCloudInteger(values, min = 0, max = Number.POSITIVE_INFINITY, fallback = min) {
  for (const value of Array.isArray(values) ? values : []) {
    if (value == null || value === "") continue;
    const type = typeof value;
    if (!["string", "number", "bigint"].includes(type)) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return asInteger(number, min, max);
  }
  return asInteger(fallback, min, max);
}

function firstCloudRatio(values, fallback = 0) {
  for (const value of Array.isArray(values) ? values : []) {
    if (value == null || value === "") continue;
    const type = typeof value;
    if (!["string", "number", "bigint"].includes(type)) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return normalizeRatio(number);
  }
  return normalizeRatio(fallback);
}

function firstCloudBoolean(values, fallback = false) {
  for (const value of Array.isArray(values) ? values : []) {
    if (value == null || value === "") continue;
    if (["boolean", "string", "number", "bigint"].includes(typeof value)) return asBoolean(value);
  }
  return Boolean(fallback);
}

function cloudScoreTotal(row) {
  const source = row && typeof row === "object" && !Array.isArray(row) ? row : {};
  const componentTotal = firstCloudInteger([source.politics], 0, 100)
    + firstCloudInteger([source.english], 0, 100)
    + firstCloudInteger([source.math], 0, 150)
    + firstCloudInteger([source.cs408], 0, 150);
  return firstCloudInteger([source.total, componentTotal], 0, 500);
}

function firstCloudKey(values) {
  for (const value of Array.isArray(values) ? values : []) {
    const key = safeCloudKey(value);
    if (key) return key;
  }
  return "";
}

function firstCloudDate(values) {
  for (const value of Array.isArray(values) ? values : []) {
    const date = asDate(value);
    if (date) return date;
  }
  return null;
}

function firstCloudTimestamp(values, fallback = null) {
  for (const value of Array.isArray(values) ? values : []) {
    const timestamp = asTimestamp(value, "");
    if (timestamp) return timestamp;
  }
  return fallback;
}

function firstCloudStringArray(values, limit = 12, itemMaxLength = 160) {
  for (const value of Array.isArray(values) ? values : []) {
    const items = asStringArray(value, limit, itemMaxLength);
    if (items.length) return items;
  }
  return [];
}

function safeDeletedId(type, id) {
  return type === "records" ? asDate(id) || "" : safeCloudKey(id);
}

function asDeletedIdArray(type, value, limit = 500) {
  return asStringArray(value, limit).map((id) => safeDeletedId(type, id)).filter(Boolean);
}

function sanitizeCloudCustomTasks(value) {
  return (Array.isArray(value) ? value : []).filter(Boolean).map((task, index) => {
    const row = task || {};
    return {
      id: asString(row.id, `custom-${index + 1}`),
      subject: asString(row.subject, "复盘"),
      text: asString(row.text),
      minutes: asInteger(row.minutes, 10, 240),
      updatedAt: firstCloudTimestamp([row.updatedAt, row.updated_at], "")
    };
  }).filter((task) => task.text);
}

function sanitizeCloudProject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  Object.entries(value).forEach(([rawKey, rawValue]) => {
    const key = safeProfileAssetKey(rawKey);
    if (!key) return;
    if (key === "updatedAt" || key === "updated_at") {
      const updatedAt = asTimestamp(rawValue, "");
      if (updatedAt) result.updatedAt = updatedAt;
      return;
    }
    result[key] = asBoolean(rawValue);
  });
  return result;
}

function sanitizeCloudDeleted(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    records: asDeletedIdArray("records", source.records).filter((date) => isOnOrAfterPlanStart(date)),
    scores: asDeletedIdArray("scores", source.scores),
    tasks: asDeletedIdArray("tasks", source.tasks),
    reviews: asDeletedIdArray("reviews", source.reviews)
  };
}

function sanitizeCloudDeletedMeta(value, deleted = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(DELETED_TYPES.map((type) => {
    const ids = new Set(asDeletedIdArray(type, deleted[type], 500));
    const rows = source[type] && typeof source[type] === "object" && !Array.isArray(source[type]) ? source[type] : {};
    return [type, Object.fromEntries(Object.entries(rows).flatMap(([id, timestamp]) => {
      const key = safeDeletedId(type, id);
      const deletedAt = asTimestamp(timestamp, "");
      return key && ids.has(key) && deletedAt ? [[key, deletedAt]] : [];
    }))];
  }));
}

function sanitizeCloudProfileSettings(value) {
  const source = cloudObject(value);
  const settings = {};
  const cleanStartVersion = asString(source.cleanStartVersion).trim();
  const cleanStartAppliedAt = asTimestamp(source.cleanStartAppliedAt, "");
  const customTasksUpdatedAt = asTimestamp(source.customTasksUpdatedAt, "");
  const resourcesUpdatedAt = asTimestamp(source.resourcesUpdatedAt, "");
  const lastSavedAt = asTimestamp(source.lastSavedAt, "");
  const lastExportDate = asDate(source.lastExportDate);

  if (cleanStartVersion && cleanStartVersion.length <= 80) settings.cleanStartVersion = cleanStartVersion;
  if (cleanStartAppliedAt) settings.cleanStartAppliedAt = cleanStartAppliedAt;
  if (customTasksUpdatedAt) settings.customTasksUpdatedAt = customTasksUpdatedAt;
  if (resourcesUpdatedAt) settings.resourcesUpdatedAt = resourcesUpdatedAt;
  if (lastSavedAt) settings.lastSavedAt = lastSavedAt;
  if (lastExportDate) settings.lastExportDate = lastExportDate;
  if (Object.prototype.hasOwnProperty.call(source, "density")) settings.density = normalizeDensityMode(source.density);
  if (Object.prototype.hasOwnProperty.call(source, "reviewDays")) settings.reviewDays = normalizeReviewDays(source.reviewDays);
  if (Object.prototype.hasOwnProperty.call(source, "planControls")) settings.planControls = normalizePlanControlsSetting(source.planControls);
  if (Object.prototype.hasOwnProperty.call(source, "efficiencyModeApplied")) settings.efficiencyModeApplied = asBoolean(source.efficiencyModeApplied);
  if (Object.prototype.hasOwnProperty.call(source, "rampSettingsApplied")) settings.rampSettingsApplied = asBoolean(source.rampSettingsApplied);
  return settings;
}

function sanitizeCloudSnapshotPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const allowedKeys = [
    "schemaVersion",
    "entries",
    "scores",
    "topics",
    "topicEvidence",
    "tasks",
    "weekPlans",
    "project",
    "resources",
    "settings",
    "customTasks",
    "reviewItems",
    "deleted",
    "deletedMeta",
    "cleanStartArchive"
  ];
  return Object.fromEntries(allowedKeys.flatMap((key) => (
    Object.prototype.hasOwnProperty.call(payload, key) ? [[key, payload[key]]] : []
  )));
}

function cloneStateForCloudMerge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON cloning for plain persisted state.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
}

function isPlainCloudObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloudRows(result) {
  return Array.isArray(result?.data) ? result.data.filter(isPlainCloudObject) : [];
}

function cloudObject(value) {
  return isPlainCloudObject(value) ? value : {};
}

function planTaskRows(value) {
  return Object.values(cloudObject(value)).flatMap((tasks) => Array.isArray(tasks) ? tasks : []);
}

function normalizeCloudSnapshot(row) {
  const payloadSource = row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : null;
  if (!payloadSource) return null;
  const payload = payloadSource.payload && typeof payloadSource.payload === "object" && !Array.isArray(payloadSource.payload)
    ? payloadSource.payload
    : payloadSource;
  return {
    reason: firstCloudString([row.reason, payloadSource.reason], "manual"),
    createdAt: firstCloudTimestamp([row.created_at, payloadSource.createdAt, payloadSource.created_at], ""),
    payload: sanitizeCloudSnapshotPayload(payload)
  };
}

function splitProfileSettings(settings) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const {
    customTasks,
    project,
    deleted,
    deletedMeta,
    deleted_meta: deletedMetaSnake,
    ...settingsOnly
  } = source;
  const sanitizedDeleted = sanitizeCloudDeleted(deleted);
  return {
    settings: sanitizeCloudProfileSettings(settingsOnly),
    customTasks: sanitizeCloudCustomTasks(customTasks),
    project: sanitizeCloudProject(project),
    deleted: sanitizedDeleted,
    deletedMeta: sanitizeCloudDeletedMeta(deletedMeta ?? deletedMetaSnake, sanitizedDeleted)
  };
}

function buildProfileSettingsPayload(state) {
  if (!isPlainCloudObject(state)) state = {};
  const { settings } = splitProfileSettings(state.settings || {});
  const deleted = sanitizeCloudDeleted(state.deleted || {});
  return {
    ...settings,
    customTasks: sanitizeCloudCustomTasks(state.customTasks || []),
    project: sanitizeCloudProject(state.project || {}),
    deleted,
    deletedMeta: sanitizeCloudDeletedMeta(state.deletedMeta || {}, deleted)
  };
}

function mergeDeletedTombstones(localDeleted = {}, cloudDeleted = {}) {
  const mergeList = (type) => [...new Set([
    ...(Array.isArray(cloudDeleted?.[type]) ? cloudDeleted[type] : []),
    ...(Array.isArray(localDeleted?.[type]) ? localDeleted[type] : [])
  ].map((item) => safeDeletedId(type, item)).filter(Boolean))];
  return Object.fromEntries(DELETED_TYPES.map((type) => [type, mergeList(type)]));
}

function timestampMs(value) {
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return 0;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function mergeDeletedTombstoneMeta(localMeta = {}, cloudMeta = {}, mergedDeleted = {}) {
  return Object.fromEntries(DELETED_TYPES.map((type) => {
    const ids = new Set(asDeletedIdArray(type, mergedDeleted[type], 500));
    const rows = {};
    ids.forEach((id) => {
      const localTime = asTimestamp(localMeta?.[type]?.[id], "");
      const cloudTime = asTimestamp(cloudMeta?.[type]?.[id], "");
      const latest = timestampMs(cloudTime) > timestampMs(localTime) ? cloudTime : localTime;
      if (latest) rows[id] = latest;
    });
    return [type, rows];
  }));
}

function deletedTombstoneBatches(ids = [], type, deletedMeta = {}, fallbackISO) {
  const grouped = new Map();
  asDeletedIdArray(type, ids, 500).forEach((id) => {
    const deletedAt = asTimestamp(deletedMeta?.[type]?.[id], fallbackISO) || fallbackISO;
    if (!id || !deletedAt) return;
    if (!grouped.has(deletedAt)) grouped.set(deletedAt, []);
    grouped.get(deletedAt).push(id);
  });
  return [...grouped.entries()].map(([deletedAt, batchIds]) => ({ deletedAt, ids: batchIds }));
}

export async function getCurrentUser() {
  const client = await getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

/**
 * Read the locally persisted session first. This keeps startup and auth
 * redirects reliable without requiring an extra user lookup round trip.
 */
export async function getCurrentSession() {
  const client = await getSupabaseClient();
  if (!client?.auth) return { user: null, session: null };
  if (typeof client.auth.getSession === "function") {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return {
      user: data?.session?.user || null,
      session: data?.session || null
    };
  }
  return { user: await getCurrentUser(), session: null };
}

export async function signInWithEmail(email, password) {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return {
    user: data.user,
    session: data.session
  };
}

export async function signUpWithEmail(email, password) {
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
  const { data, error } = await client.auth.signUp({
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
  const client = await getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export function onAuthChange(callback) {
  if (!supabaseConfigured || typeof callback !== "function") return () => {};

  let subscription = null;
  let active = true;
  const subscribe = (client) => {
    if (!active || !client) return;
    try {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        try {
          const result = callback(session?.user || null);
          if (result && typeof result.catch === "function") {
            result.catch(() => {});
          }
        } catch {
          // Auth listeners should not break Supabase internals or later listeners.
        }
      });
      subscription = data?.subscription || null;
    } catch {
      subscription = null;
    }
  };

  if (supabase) {
    subscribe(supabase);
  } else {
    getSupabaseClient().then(subscribe).catch(() => {});
  }

  return () => {
    active = false;
    try {
      subscription?.unsubscribe?.();
    } catch {
      // Ignore unsubscribe failures during teardown.
    }
  };
}

const CLOUD_PAGE_SIZE = 500;

async function loadAllCloudRows(buildPageQuery) {
  const rows = [];
  for (let from = 0; ; from += CLOUD_PAGE_SIZE) {
    const { data, error } = await buildPageQuery(from, from + CLOUD_PAGE_SIZE - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < CLOUD_PAGE_SIZE) return { data: rows, error: null };
  }
}

export async function loadCloudState(baseState) {
  const user = await getCurrentUser();
  if (!supabase || !user) return null;

  const [
    profile,
    records,
    tasks,
    reviews,
    deletedTasks,
    deletedReviews,
    topics,
    scores,
    deletedScores,
    resources,
    snapshots
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    loadAllCloudRows((from, to) => supabase.from("daily_records").select("*").eq("user_id", user.id).gte("study_date", PLAN_START_DATE).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("study_tasks").select("*").eq("user_id", user.id).gte("task_date", PLAN_START_DATE).is("deleted_at", null).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("review_items").select("*").eq("user_id", user.id).gte("due_date", PLAN_START_DATE).is("deleted_at", null).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("study_tasks").select("id,source_task_id,task_date,deleted_at").eq("user_id", user.id).gte("task_date", PLAN_START_DATE).not("deleted_at", "is", null).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("review_items").select("id,source_task_id,due_date,deleted_at").eq("user_id", user.id).gte("due_date", PLAN_START_DATE).not("deleted_at", "is", null).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("topic_progress").select("*").eq("user_id", user.id).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("mock_scores").select("*").eq("user_id", user.id).gte("mock_date", PLAN_START_DATE).is("deleted_at", null).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("mock_scores").select("id,mock_date,deleted_at").eq("user_id", user.id).gte("mock_date", PLAN_START_DATE).not("deleted_at", "is", null).range(from, to)),
    loadAllCloudRows((from, to) => supabase.from("resources").select("*").eq("user_id", user.id).range(from, to)),
    supabase.from("snapshots").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
  ]);

  const errors = [profile, records, tasks, reviews, deletedTasks, deletedReviews, topics, scores, deletedScores, resources, snapshots]
    .map((result) => result.error)
    .filter(Boolean);
  if (errors.length) throw errors[0];

  const state = cloneStateForCloudMerge(baseState);
  const profileRow = cloudObject(profile.data);
  const recordRows = cloudRows(records);
  const taskRows = cloudRows(tasks);
  const reviewRows = cloudRows(reviews);
  const deletedTaskRows = cloudRows(deletedTasks);
  const deletedReviewRows = cloudRows(deletedReviews);
  const topicRows = cloudRows(topics);
  const scoreRows = cloudRows(scores);
  const deletedScoreRows = cloudRows(deletedScores);
  const resourceRows = cloudRows(resources);
  const snapshotRows = cloudRows(snapshots);
  const {
    settings: profileSettings,
    customTasks: profileCustomTasks,
    project: profileProject,
    deleted: profileDeleted,
    deletedMeta: profileDeletedMeta
  } = splitProfileSettings(profileRow.settings);
  const profileCleanStartVersion = profileSettings.cleanStartVersion || "";
  const cloudCleanStarted = profileCleanStartVersion === CLEAN_START_VERSION;
  const cleanStartAppliedAt = asTimestamp(profileSettings.cleanStartAppliedAt) || `${PLAN_START_DATE}T00:00:00.000Z`;
  state.cloudMeta = {
    cleanStartVersion: profileCleanStartVersion,
    cleanStartAppliedAt
  };
  if (Object.keys(profileRow).length > 0) {
    const localSettings = cloudObject(state.settings);
    state.settings = {
      ...localSettings,
      ...profileSettings,
      targetExamDate: normalizeDateSetting(profileRow.target_exam_date, localSettings.targetExamDate),
      weekdayMinutes: normalizeIntegerSetting(profileRow.weekday_minutes, localSettings.weekdayMinutes, 60, 720, DEFAULT_PROFILE_NUMBERS.weekdayMinutes),
      weekendMinutes: normalizeIntegerSetting(profileRow.weekend_minutes, localSettings.weekendMinutes, 60, 840, DEFAULT_PROFILE_NUMBERS.weekendMinutes),
      taskCount: normalizeIntegerSetting(profileRow.task_count, localSettings.taskCount, 3, 4, DEFAULT_PROFILE_NUMBERS.taskCount),
      coreRatio: normalizeIntegerSetting(profileRow.core_ratio, localSettings.coreRatio, 55, 85, DEFAULT_PROFILE_NUMBERS.coreRatio),
      reviewDays: normalizeReviewDays(profileRow.review_days, localSettings.reviewDays),
      density: normalizeDensityMode(profileRow.density_mode, localSettings.density),
      retroTime: normalizeTimeSetting(profileRow.retro_time, localSettings.retroTime),
      planLogicVersion: normalizePlanVersion(profileRow.plan_version, localSettings.planLogicVersion)
    };
  }
  state.customTasks = profileCustomTasks;
  state.project = profileProject;

  state.entries = Object.fromEntries(recordRows.flatMap((row) => {
    const studyDate = asDate(row.study_date);
    if (!studyDate || !isOnOrAfterPlanStart(studyDate)) return [];
    return [[studyDate, {
      math: asInteger(row.math_minutes),
      cs408: asInteger(row.cs408_minutes),
      english: asInteger(row.english_minutes),
      politics: asInteger(row.politics_minutes),
      project: asInteger(row.project_minutes),
      mathProblems: asInteger(row.math_problems),
      csProblems: asInteger(row.cs408_problems),
      reading: asInteger(row.reading_count),
      newMistakes: asInteger(row.new_mistakes),
      fixedMistakes: asInteger(row.fixed_mistakes),
      quality: firstCloudInteger([row.quality_score, 3], 1, 5, 3),
      nextTask: asString(row.next_task),
      note: asString(row.note),
      updatedAt: asTimestamp(row.updated_at, "")
    }]];
  }));

  state.weekPlans = {};
  state.tasks = {};
  taskRows.forEach((row) => {
    const id = safeCloudKey(row.id);
    const date = asDate(row.task_date);
    if (!id || !date || !isOnOrAfterPlanStart(date) || !datedIdStarted(row.source_task_id)) return;
    const task = {
      id,
      date,
      subject: asString(row.subject, "复盘"),
      text: asString(row.title, "回炉错题，写明下次识别信号"),
      topicId: safeCloudKey(row.topic_id),
      minutes: asInteger(row.minutes),
      priority: asInteger(row.priority),
      status: asEnum(row.status, ["todo", "done", "shifted", "delayed", "failed"], "todo"),
      locked: asBoolean(row.locked),
      source: safeCloudLabel(row.source, "generated"),
      sourceTaskId: safeCloudKey(row.source_task_id),
      carriedFrom: asDate(row.carried_from) || "",
      shiftedTo: asDate(row.shifted_to) || "",
      completedAt: asTimestamp(row.completed_at, ""),
      recordApplied: asBoolean(row.record_applied),
      contractType: safeCloudLabel(row.contract_type, "problems", 40),
      requiredProblemCount: asInteger(row.required_problem_count),
      requiredAccuracy: normalizeRatio(row.required_accuracy),
      requiredArtifacts: asStringArray(row.required_artifacts),
      minutesMin: asInteger(row.minutes_min),
      minutesMax: asInteger(row.minutes_max),
      actualProblems: asInteger(row.actual_problems),
      actualCorrect: asInteger(row.actual_correct),
      actualMinutes: asInteger(row.actual_minutes),
      evidenceSubmitted: asBoolean(row.evidence_submitted),
      updatedAt: asTimestamp(row.updated_at, "")
    };
    if (!state.weekPlans[task.date]) state.weekPlans[task.date] = [];
    state.weekPlans[task.date].push(task);
    state.tasks[task.id] = task.status === "done";
  });

  state.reviewItems = reviewRows
    .flatMap((row) => {
      const id = safeCloudKey(row.id);
      const dueDate = asDate(row.due_date);
      if (!id || !dueDate || !isOnOrAfterPlanStart(dueDate) || !datedIdStarted(row.source_task_id)) return [];
      return [{
        id,
        sourceTaskId: safeCloudKey(row.source_task_id),
        subject: asString(row.subject, "复盘"),
        text: asString(row.title, "复盘"),
        round: asString(row.review_round),
        dueDate,
        status: asEnum(row.status, ["due", "done", "delayed", "failed"], "due"),
        done: row.status === "done",
        delayCount: asInteger(row.delay_count),
        failureReason: asString(row.failure_reason),
        quality: asInteger(row.quality_score, 0, 5),
        completedAt: asTimestamp(row.completed_at, ""),
        intervalIndex: asInteger(row.interval_index),
        failStreak: asInteger(row.fail_streak),
        lastResult: asEnum(row.last_result, REVIEW_RESULTS, ""),
        lastSubmittedDate: asDate(row.last_submitted_date) || "",
        topicId: safeCloudKey(row.topic_id),
        updatedAt: asTimestamp(row.updated_at, "")
      }];
    });

  state.topics = {};
  state.topicEvidence = {};
  (cloudCleanStarted ? topicRows.filter((row) => topicRowStarted(row, cleanStartAppliedAt)) : []).forEach((row) => {
    const topicId = safeCloudKey(row.topic_id);
    if (!topicId) return;
    const statusValue = asInteger(row.status_value, 0, 2);
    state.topics[topicId] = statusValue;
    state.topicEvidence[topicId] = {
      problems: asInteger(row.problems_done),
      accuracy: asInteger(row.accuracy, 0, 100),
      evidence: asString(row.evidence),
      lastReviewDate: asDate(row.last_review_date) || "",
      totalProblems: asInteger(row.total_problems),
      recent14dAccuracy: normalizeRatio(row.recent_14d_accuracy),
      lastReviewAt: asTimestamp(row.last_review_at, ""),
      masteryStatus: normalizeMasteryStatus(row.mastery_status, statusValue),
      prerequisites: asStringArray(row.prerequisites),
      updatedAt: asTimestamp(row.updated_at, "")
    };
  });

  state.scores = scoreRows.flatMap((row) => {
    const id = safeCloudKey(row.id);
    const date = asDate(row.mock_date);
    if (!id || !date || !isOnOrAfterPlanStart(date)) return [];
    return [{
      id,
      date,
      name: asString(row.name, "未命名模考"),
      politics: asInteger(row.politics, 0, 100),
      english: asInteger(row.english, 0, 100),
      math: asInteger(row.math, 0, 150),
      cs408: asInteger(row.cs408, 0, 150),
      total: cloudScoreTotal(row),
      note: asString(row.note),
      updatedAt: asTimestamp(row.updated_at, "")
    }];
  });

  state.resources = Object.fromEntries(resourceRows.flatMap((row) => {
    const key = safeProfileAssetKey(row.resource_key);
    return key ? [[key, asInteger(row.progress, 0, 100)]] : [];
  }));
  const profileAndLocalDeleted = mergeDeletedTombstones(state.deleted, profileDeleted);
  const profileAndLocalDeletedMeta = mergeDeletedTombstoneMeta(state.deletedMeta, profileDeletedMeta, profileAndLocalDeleted);
  const cloudSoftDeleted = {
    records: [],
    scores: deletedScoreRows
      .filter((row) => isOnOrAfterPlanStart(row.mock_date) && safeCloudKey(row.id))
      .map((row) => safeCloudKey(row.id)),
    tasks: deletedTaskRows
      .filter((row) => isOnOrAfterPlanStart(row.task_date) && datedIdStarted(row.source_task_id) && safeCloudKey(row.id))
      .map((row) => safeCloudKey(row.id)),
    reviews: deletedReviewRows
      .filter((row) => isOnOrAfterPlanStart(row.due_date) && datedIdStarted(row.source_task_id) && safeCloudKey(row.id))
      .map((row) => safeCloudKey(row.id))
  };
  const cloudSoftDeletedMeta = {
    records: {},
    scores: Object.fromEntries(deletedScoreRows
      .filter((row) => isOnOrAfterPlanStart(row.mock_date) && safeCloudKey(row.id) && asTimestamp(row.deleted_at, ""))
      .map((row) => [safeCloudKey(row.id), asTimestamp(row.deleted_at, "")])),
    tasks: Object.fromEntries(deletedTaskRows
      .filter((row) => isOnOrAfterPlanStart(row.task_date) && datedIdStarted(row.source_task_id) && safeCloudKey(row.id) && asTimestamp(row.deleted_at, ""))
      .map((row) => [safeCloudKey(row.id), asTimestamp(row.deleted_at, "")])),
    reviews: Object.fromEntries(deletedReviewRows
      .filter((row) => isOnOrAfterPlanStart(row.due_date) && datedIdStarted(row.source_task_id) && safeCloudKey(row.id) && asTimestamp(row.deleted_at, ""))
      .map((row) => [safeCloudKey(row.id), asTimestamp(row.deleted_at, "")]))
  };
  state.deleted = mergeDeletedTombstones(profileAndLocalDeleted, cloudSoftDeleted);
  state.deletedMeta = mergeDeletedTombstoneMeta(profileAndLocalDeletedMeta, cloudSoftDeletedMeta, state.deleted);
  state.snapshots = snapshotRows.map(normalizeCloudSnapshot).filter(Boolean);
  state.sync = { status: "synced", lastSyncAt: new Date().toISOString(), lastError: "", pending: false };
  state.user = { id: user.id, email: user.email || "" };
  return state;
}

export async function saveCloudState(state, options = {}) {
  if (asBoolean(state?.sync?.cloudPaused) && !options.force) return { skipped: true, reason: "cloud-paused" };
  if (asBoolean(state?.sync?.localImportPending) && !options.force) return { skipped: true, reason: "local-import-pending" };
  const user = await getCurrentUser();
  if (!supabase || !user) return { skipped: true, reason: "not-authenticated" };
  const now = new Date().toISOString();
  const sourceState = isPlainCloudObject(state) ? state : {};
  const settingsState = cloudObject(sourceState.settings);

  const profile = {
    user_id: user.id,
    settings: buildProfileSettingsPayload(state),
    target_exam_date: normalizeDateSetting(settingsState.targetExamDate),
    weekday_minutes: normalizeIntegerSetting(settingsState.weekdayMinutes, undefined, 60, 720, 60),
    weekend_minutes: normalizeIntegerSetting(settingsState.weekendMinutes, undefined, 60, 840, 60),
    task_count: normalizeIntegerSetting(settingsState.taskCount, undefined, 3, 4, 3),
    core_ratio: normalizeIntegerSetting(settingsState.coreRatio, undefined, 55, 85, 55),
    review_days: normalizeReviewDays(settingsState.reviewDays),
    density_mode: normalizeDensityMode(settingsState.density),
    retro_time: normalizeTimeSetting(settingsState.retroTime),
    plan_version: normalizePlanVersion(settingsState.planLogicVersion),
    last_synced_at: now,
    updated_at: now
  };

  const entryMap = isPlainCloudObject(sourceState.entries) ? sourceState.entries : {};
  const taskMap = isPlainCloudObject(sourceState.weekPlans) ? sourceState.weekPlans : {};
  const taskState = isPlainCloudObject(sourceState.tasks) ? sourceState.tasks : {};
  const topicMap = isPlainCloudObject(sourceState.topics) ? sourceState.topics : {};
  const topicEvidenceMap = isPlainCloudObject(sourceState.topicEvidence) ? sourceState.topicEvidence : {};
  const resourceMap = isPlainCloudObject(sourceState.resources) ? sourceState.resources : {};

  const records = Object.entries(entryMap).flatMap(([date, entry]) => {
    const studyDate = asDate(date);
    if (!studyDate || !isOnOrAfterPlanStart(studyDate)) return [];
    const row = isPlainCloudObject(entry) ? entry : {};
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
      quality_score: firstCloudInteger([row.quality, row.quality_score, 3], 1, 5, 3),
      next_task: asString(row.nextTask),
      note: asString(row.note),
      updated_at: asTimestamp(row.updatedAt, now)
    }];
  });

  const tasks = uniqueBy(planTaskRows(taskMap).flatMap((task) => {
    if (!isPlainCloudObject(task)) return [];
    const id = safeCloudKey(task.id);
    if (!id) return [];
    const status = asEnum(task.status, ["todo", "done", "shifted", "delayed", "failed"], taskState[id] === true ? "done" : "todo");
    return [{
      id,
      user_id: user.id,
      task_date: taskDateFor(task, now),
      subject: asString(task.subject, "复盘"),
      topic_id: firstCloudKey([task.topicId, task.topic_id]),
      title: firstCloudString([task.text, task.title], "回炉错题，写明下次识别信号"),
      minutes: asInteger(task.minutes),
      priority: asInteger(task.priority),
      status,
      locked: asBoolean(task.locked),
      source: safeCloudLabel(task.source, "generated"),
      source_task_id: firstCloudKey([task.sourceTaskId, task.source_task_id]),
      carried_from: firstCloudDate([task.carriedFrom, task.carried_from]),
      shifted_to: firstCloudDate([task.shiftedTo, task.shifted_to]),
      completed_at: firstCloudTimestamp([task.completedAt, task.completed_at]),
      record_applied: asBoolean(task.recordApplied),
      contract_type: firstCloudLabel([task.contractType, task.contract_type], "problems", 40),
      required_problem_count: firstCloudInteger([task.requiredProblemCount, task.required_problem_count]),
      required_accuracy: firstCloudRatio([task.requiredAccuracy, task.required_accuracy]),
      required_artifacts: firstCloudStringArray([task.requiredArtifacts, task.required_artifacts]),
      minutes_min: firstCloudInteger([task.minutesMin, task.minutes_min]),
      minutes_max: firstCloudInteger([task.minutesMax, task.minutes_max]),
      actual_problems: firstCloudInteger([task.actualProblems, task.actual_problems]),
      actual_correct: firstCloudInteger([task.actualCorrect, task.actual_correct]),
      actual_minutes: firstCloudInteger([task.actualMinutes, task.actual_minutes]),
      evidence_submitted: firstCloudBoolean([task.evidenceSubmitted, task.evidence_submitted]),
      deleted_at: null,
      updated_at: firstCloudTimestamp([task.updatedAt, task.updated_at], now)
    }];
  })
    .filter((task) => isOnOrAfterPlanStart(task.task_date) && datedIdStarted(task.source_task_id)), (task) => task.id);

  const reviews = uniqueBy((Array.isArray(sourceState.reviewItems) ? sourceState.reviewItems : []).flatMap((item) => {
    if (!isPlainCloudObject(item)) return [];
    const id = safeCloudKey(item.id);
    if (!id) return [];
    const status = asBoolean(item.done) ? "done" : asEnum(item.status, ["due", "done", "delayed", "failed"], "due");
    return [{
      id,
      user_id: user.id,
      source_task_id: firstCloudKey([item.sourceTaskId, item.source_task_id]),
      subject: asString(item.subject, "复盘"),
      title: asString(item.text, "") || asString(item.title, "复盘"),
      review_round: firstCloudString([item.round, item.review_round]),
      due_date: firstCloudDate([item.dueDate, item.due_date, item.nextDueAt, item.next_due_at]) || now.slice(0, 10),
      status,
      delay_count: firstCloudInteger([item.delayCount, item.delay_count]),
      failure_reason: firstCloudString([item.failureReason, item.failure_reason]),
      quality_score: firstCloudInteger([item.quality, item.quality_score], 0, 5),
      completed_at: firstCloudTimestamp([item.completedAt, item.completed_at]),
      interval_index: firstCloudInteger([item.intervalIndex, item.interval_index]),
      fail_streak: firstCloudInteger([item.failStreak, item.fail_streak]),
      last_result: asEnum(firstCloudString([item.lastResult, item.last_result]), REVIEW_RESULTS, ""),
      last_submitted_date: firstCloudDate([item.lastSubmittedDate, item.last_submitted_date]),
      topic_id: firstCloudKey([item.topicId, item.topic_id]),
      deleted_at: null,
      updated_at: firstCloudTimestamp([item.updatedAt, item.updated_at], now)
    }];
  })
    .filter((item) => isOnOrAfterPlanStart(item.due_date) && datedIdStarted(item.source_task_id)), (item) => item.id);

  const topics = Object.entries(topicMap).flatMap(([topicId, value]) => {
    const safeTopicId = safeCloudKey(topicId);
    if (!safeTopicId) return [];
    const evidence = cloudObject(topicEvidenceMap[safeTopicId]);
    const statusValue = asInteger(value, 0, 2);
    return [{
      user_id: user.id,
      topic_id: safeTopicId,
      status_value: statusValue,
      problems_done: asInteger(evidence.problems),
      accuracy: asInteger(evidence.accuracy, 0, 100),
      evidence: asString(evidence.evidence),
      last_review_date: firstCloudDate([evidence.lastReviewDate, evidence.last_review_date]),
      total_problems: firstCloudInteger([evidence.totalProblems, evidence.total_problems, evidence.problems]),
      recent_14d_accuracy: firstCloudRatio([evidence.recent14dAccuracy, evidence.recent_14d_accuracy, evidence.accuracy]),
      last_review_at: firstCloudTimestamp([evidence.lastReviewAt, evidence.last_review_at]),
      mastery_status: normalizeMasteryStatus(firstCloudString([evidence.masteryStatus, evidence.mastery_status]), statusValue),
      prerequisites: asStringArray(evidence.prerequisites),
      updated_at: firstCloudTimestamp([evidence.updatedAt, evidence.updated_at], now)
    }];
  }).filter((topic) => topic.topic_id && topicRowStarted(topic, asTimestamp(settingsState.cleanStartAppliedAt) || now));

  const scores = uniqueBy((Array.isArray(sourceState.scores) ? sourceState.scores : []).flatMap((score) => {
    if (!isPlainCloudObject(score)) return [];
    const id = safeCloudKey(score.id);
    if (!id) return [];
    return [{
      id,
      user_id: user.id,
      mock_date: dateOr(score.date, now),
      name: asString(score.name, "未命名模考"),
      politics: asInteger(score.politics, 0, 100),
      english: asInteger(score.english, 0, 100),
      math: asInteger(score.math, 0, 150),
      cs408: asInteger(score.cs408, 0, 150),
      total: cloudScoreTotal(score),
      note: asString(score.note),
      deleted_at: null,
      updated_at: firstCloudTimestamp([score.updatedAt, score.updated_at], now)
    }];
  }).filter((score) => isOnOrAfterPlanStart(score.mock_date)), (score) => score.id);

  const resources = Object.entries(resourceMap).flatMap(([key, value]) => {
    const resourceKey = safeProfileAssetKey(key);
    return resourceKey ? [{
      user_id: user.id,
      resource_key: resourceKey,
      progress: asInteger(value, 0, 100),
      updated_at: now
    }] : [];
  });

  const deleted = sourceState.deleted || {};
  const deletedMeta = sourceState.deletedMeta || {};
  const deletedRecords = asDeletedIdArray("records", deleted.records, 500).filter(isOnOrAfterPlanStart);
  const deletedScores = asDeletedIdArray("scores", deleted.scores, 500);
  const deletedTasks = asDeletedIdArray("tasks", deleted.tasks, 500);
  const deletedReviews = asDeletedIdArray("reviews", deleted.reviews, 500);
  const deletedRecordBatches = deletedTombstoneBatches(deletedRecords, "records", deletedMeta, now);
  const deletedScoreBatches = deletedTombstoneBatches(deletedScores, "scores", deletedMeta, now);
  const deletedTaskBatches = deletedTombstoneBatches(deletedTasks, "tasks", deletedMeta, now);
  const deletedReviewBatches = deletedTombstoneBatches(deletedReviews, "reviews", deletedMeta, now);
  const operations = [
    ["profiles", supabase.from("profiles").upsert(profile, { onConflict: getSyncConflictKey("profiles") })]
  ];
  operations.push(["daily_records.cleanStart", supabase.from("daily_records").delete().eq("user_id", user.id).lt("study_date", PLAN_START_DATE)]);
  operations.push(["study_tasks.cleanStart", supabase.from("study_tasks").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).lt("task_date", PLAN_START_DATE).is("deleted_at", null)]);
  operations.push(["review_items.cleanStart", supabase.from("review_items").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).lt("due_date", PLAN_START_DATE).is("deleted_at", null)]);
  operations.push(["mock_scores.cleanStart", supabase.from("mock_scores").update({ deleted_at: now, updated_at: now }).eq("user_id", user.id).lt("mock_date", PLAN_START_DATE).is("deleted_at", null)]);
  if (settingsState.cleanStartVersion === CLEAN_START_VERSION) {
    const cleanStartAppliedAt = asTimestamp(settingsState.cleanStartAppliedAt) || now;
    operations.push(["topic_progress.cleanStart", supabase.from("topic_progress").delete().eq("user_id", user.id).lt("updated_at", cleanStartAppliedAt)]);
  }
  if (records.length) operations.push(["daily_records", supabase.from("daily_records").upsert(records, { onConflict: getSyncConflictKey("daily_records") })]);
  if (tasks.length) operations.push(["study_tasks", supabase.from("study_tasks").upsert(tasks, { onConflict: getSyncConflictKey("study_tasks") })]);
  if (reviews.length) operations.push(["review_items", supabase.from("review_items").upsert(reviews, { onConflict: getSyncConflictKey("review_items") })]);
  if (topics.length) operations.push(["topic_progress", supabase.from("topic_progress").upsert(topics, { onConflict: getSyncConflictKey("topic_progress") })]);
  if (scores.length) operations.push(["mock_scores", supabase.from("mock_scores").upsert(scores, { onConflict: getSyncConflictKey("mock_scores") })]);
  if (resources.length) operations.push(["resources", supabase.from("resources").upsert(resources, { onConflict: getSyncConflictKey("resources") })]);
  deletedRecordBatches.forEach((batch) => {
    operations.push(["daily_records.delete", supabase.from("daily_records").delete().eq("user_id", user.id).in("study_date", batch.ids).lte("updated_at", batch.deletedAt)]);
  });
  deletedScoreBatches.forEach((batch) => {
    operations.push(["mock_scores.delete", supabase.from("mock_scores").update({ deleted_at: batch.deletedAt, updated_at: batch.deletedAt }).eq("user_id", user.id).in("id", batch.ids).lte("updated_at", batch.deletedAt)]);
  });
  deletedTaskBatches.forEach((batch) => {
    operations.push(["study_tasks.delete", supabase.from("study_tasks").update({ deleted_at: batch.deletedAt, updated_at: batch.deletedAt }).eq("user_id", user.id).in("id", batch.ids).lte("updated_at", batch.deletedAt)]);
  });
  deletedReviewBatches.forEach((batch) => {
    operations.push(["review_items.delete", supabase.from("review_items").update({ deleted_at: batch.deletedAt, updated_at: batch.deletedAt }).eq("user_id", user.id).in("id", batch.ids).lte("updated_at", batch.deletedAt)]);
  });

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
  if (asBoolean(state?.sync?.cloudPaused) || asBoolean(state?.sync?.localImportPending)) return;
  const user = await getCurrentUser();
  if (!supabase || !user) return;
  const snapshotReason = asString(reason, "manual").slice(0, 120) || "manual";
  const payload = buildCloudSnapshotPayload(state, snapshotReason);
  const { error } = await supabase.from("snapshots").insert({
    user_id: user.id,
    reason: snapshotReason,
    payload
  });
  if (error) throw error;
}

function buildCloudSnapshotPayload(state, reason = "manual") {
  if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
  const reasonType = typeof reason;
  const snapshotReason = (reason == null || !["string", "number", "bigint"].includes(reasonType) ? "manual" : String(reason)).slice(0, 120) || "manual";
  const payload = {
    schemaVersion: state.schemaVersion,
    reason: snapshotReason,
    createdAt: new Date().toISOString(),
    entries: state.entries,
    scores: state.scores,
    topics: state.topics,
    topicEvidence: state.topicEvidence,
    tasks: state.tasks,
    weekPlans: state.weekPlans,
    reviewItems: state.reviewItems,
    settings: state.settings,
    customTasks: state.customTasks,
    project: state.project,
    resources: state.resources,
    deleted: state.deleted,
    deletedMeta: state.deletedMeta,
    cleanStartArchive: state.cleanStartArchive
  };
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(payload, (_key, value) => {
      if (typeof value === "bigint") return String(value);
      if (value && typeof value === "object") {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    });
    return json ? JSON.parse(json) : {};
  } catch {
    return {
      reason: snapshotReason,
      createdAt: payload.createdAt
    };
  }
}

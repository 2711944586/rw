/**
 * Production application. `src/main.js` imports this module after local recovery.
 *
 * This file still owns state, routing, forms and most rendering. The modules
 * listed in `scripts/verify-module-boundaries.mjs` are the tested replacement
 * and must not be started beside this file.
 */
import {
  designReferences,
  executionBoundaries,
  sourceRegistry
} from "./data/reference-data.js";
import {
  auditCadenceRules,
  foundationDailySequence,
  foundationPlan,
  highStandards,
  learningPath,
  liveFactChecks,
  memoryCurveRules,
  methodEvidence,
  monthlyPlan,
  phases,
  projectItems,
  rampBudgets,
  resourceProgressItems,
  reviewOutcomeRules,
  scoreTargets,
  studyMetricRules,
  subjectAcceptanceRules,
  subjectMethods,
  syllabus,
  syllabusGroupTypeMeta,
  syllabusGroupTypes,
  systemRules,
  taskBlueprints
} from "./data/study-content.js";
import {
  adaptiveAdjustmentRules,
  dailyLoadTemplates,
  dailyOperatingSchedule,
  dailyStudyProtocols,
  detailedPhasePlans,
  learningScienceRules,
  phasePlanById,
  phaseSubjectPlan,
  planChain,
  startup28DayPlan,
  subjectResourceStacks,
  weeklyCycleForDate,
  weeklyStudyCycle
} from "./data/detailed-study-plan.js";
import {
  oversightFeatureRoadmap,
  resourceGovernanceRules,
  resourceStageControl,
  resourceSubjectGovernance,
  studyCapacityPolicy,
  studyPlanCorrections
} from "./data/study-plan-governance.js";

import {
  getCurrentSession,
  hasPersistedCloudSession,
  loadCloudState,
  onAuthChange,
  saveCloudSnapshot,
  saveCloudState,
  sendPasswordRecoveryEmail,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  supabaseConfigured,
  updateRecoveredPassword
} from "./infrastructure/supabase-sync.js";

import {
  escapeAttr,
  escapeHTML as escapeHtml,
  safeExternalUrl
} from "./utils/html.js";

import { STORAGE_KEYS } from "./core/storage-contract.js";
import { DEFAULT_VIEW_ID, isKnownViewId } from "./core/route-contract.js";
import { createBrowserStorage } from "./infrastructure/browser-storage.js";
import { clearRecoveryCopy, persistRecoveryCopy } from "./infrastructure/recovery-store.js";
import {
  APP_BUILD,
  CLEAN_START_VERSION,
  DEFAULT_EXAM_DATE,
  DEFAULT_EXAM_DATE_STATUS,
  DELETED_TYPES,
  DENSITY_BUTTON_SELECTOR,
  MAX_IMPORT_FILE_BYTES,
  PLAN_LOGIC_VERSION,
  PLAN_START_DATE,
  SCHEMA_VERSION,
  SOURCE_CHECK_DATE,
  STORAGE_FAILURE_NOTICE_INTERVAL_MS,
  TARGET_TOTAL_HOURS
} from "./config/app-config.js";
import { hydrateIcons } from "./ui/icon-registry.js";
import { createViewRenderCoordinator } from "./ui/view-render-coordinator.js";
import { initWorkspaceController } from "./ui/workspace-controller.js";
import {
  bindPasswordVisibility,
  focusAuthPanel,
  renderAuthPanelState,
  setAuthPanelBusy
} from "./ui/auth-panel.js";
import {
  renderResourceDossierTemplate,
  renderStartupCalendarTemplate
} from "./ui/study-plan-templates.js";
import {
  applyDensityMode as applyDensityModeToDocument,
  densityModeMeta,
  normalizeDensityMode
} from "./ui/density-controller.js";

import {
  collectCarryoverTasks,
  isTaskDone,
  markCarriedSourceTasks
} from "./domain/task-carryover.js";
import {
  applyCompletionEvidence,
  diffPlan,
  decodeLoadNote,
  dueOfficialChecks,
  encodeLoadNote,
  mergeRegeneratedTasks,
  presentSyncStatus,
  reviewGradeEffect,
  reviewPosture,
  sanitizeLoadTier,
  sanitizeSleepHours,
  shouldUseBottomLine,
  validateCompletionEvidence,
  weeklyReviewPrompt
} from "./domain/execution-loop.js";

import {
  DEFAULT_PLAN_CONTROLS,
  applyPlanControls,
  buildRollingReviewWindows,
  getPhaseStrategy,
  getSyllabusFramework,
  normalizePlanControls,
  recommendPlanAdjustment,
  reviewLoadSignal,
  strategySources,
  subjectKey,
  subjectLabel,
  subjectPlanWeights
} from "./domain/study-strategy.js";

const {
  APP_STATE: STORAGE_KEY,
  LEGACY_APP_STATE: LEGACY_STORAGE_KEY,
  LEGACY_MODULAR_STATE: STATE_MANAGER_STORAGE_KEY,
  STATE_DIRTY_MAP: STATE_MANAGER_DIRTY_KEY,
  OFFLINE_DIRTY_QUEUE: OFFLINE_DIRTY_QUEUE_KEY,
  LEGACY_DIRTY_MAP: LEGACY_DIRTY_MAP_KEY,
  LEGACY_OFFLINE_CACHE: LEGACY_OFFLINE_CACHE_KEY,
  LEGACY_OFFLINE_DIRTY_QUEUE: LEGACY_DIRTY_QUEUE_KEY
} = STORAGE_KEYS;
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const defaultSettings = {
  weekdayMinutes: 180,
  weekendMinutes: 300,
  taskCount: 3,
  coreRatio: 65,
  density: "focus",
  lastExportDate: "",
  targetExamDate: DEFAULT_EXAM_DATE,
  reviewDays: [1, 3, 7, 14, 30],
  planControls: { ...DEFAULT_PLAN_CONTROLS },
  notificationsEnabled: false,
  officialChecksDone: []
};

const browserStorage = createBrowserStorage(window.localStorage);
const { read: readStorage, write: writeStorage } = browserStorage;

function clearAppLocalStorage() {
  void clearRecoveryCopy();
  return browserStorage.removeMany([
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    STATE_MANAGER_STORAGE_KEY,
    STATE_MANAGER_DIRTY_KEY,
    OFFLINE_DIRTY_QUEUE_KEY,
    LEGACY_DIRTY_MAP_KEY,
    LEGACY_OFFLINE_CACHE_KEY,
    LEGACY_DIRTY_QUEUE_KEY,
    STORAGE_KEYS.UI_PREFERENCES
  ]);
}

function consumeResetRequest() {
  try {
    const url = new URL(window.location.href);
    const resetValue = url.searchParams.get("reset");
    if (!["1", "true", "yes"].includes(String(resetValue || "").toLowerCase())) {
      return { requested: false, confirmed: false, cleared: false };
    }
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash || "#dashboard"}`);
    if (!window.confirm("确认清理本浏览器里的学习数据和缓存？建议先导出备份。")) {
      return { requested: true, confirmed: false, cleared: false };
    }
    const cleared = clearAppLocalStorage();
    return { requested: true, confirmed: true, cleared };
  } catch {
    return { requested: false, confirmed: false, cleared: false };
  }
}

const resetRequest = consumeResetRequest();
let state = loadState();
let currentUser = null;
let syncTimer = null;
let appStarted = false;
let workspaceRenderer = null;
let stopCloudAuthListener = null;
let authRequestInFlight = false;
let passwordRecoveryPending = false;
let legacyImportPending = Boolean(readStorage(LEGACY_STORAGE_KEY) && !readStorage(STORAGE_KEY));
let lastStorageFailureNoticeAt = 0;
let selectedResourceSubject = "math";
let selectedStartupWeek = 0;
let lastAuthResult = {
  status: "idle",
  title: "账号状态",
  message: "填写邮箱和密码后，可以注册新账号或登录同步。"
};

async function bootstrapApp() {
  try {
    setDefaultDates();
    hydrateIcons();
    bindNavigation();
    initWorkspaceController();
    bindDensityControls();
    bindForms();
    bindSyllabusTabs();
    bindImportExport();
    bindQuickEntry();
    bindRecords();
    bindSettings();
    bindAuth();
    bindWeekPlanner();
    bindNetworkStatus();
    const upgradeSaved = upgradeGeneratedPlans();
    await initCloudSession();
    renderAll();
    initRoute();
    appStarted = true;
    if (upgradeSaved === false) setLocalSaveResult(false, "启动升级已保存", "计划升级状态已写入本机缓存。", "启动升级未写入本机缓存");
    if (resetRequest.confirmed && resetRequest.cleared) {
      showToast("已清理本机缓存，当前为全新本机数据。");
    } else if (resetRequest.confirmed && !resetRequest.cleared) {
      showToast("本机缓存未完全清理，请在账号面板重试或手动导出后清理浏览器存储。");
    }
    if (!browserStorage.available) showToast("浏览器暂时禁止本机存储，页面可操作，但刷新后本机数据可能不会保留。");
  } catch (error) {
    console.error("[rw] app initialization failed", error);
    installRecoveryMode(error);
  }
}

// Under Vitest the module is imported only to reach the pure state layer that is
// exported at the bottom of this file. Running the real bootstrap in that case
// would rewire the whole page before every test, so it is skipped. Production and
// dev builds always take the branch below.
//
// Integration tests that DO want the real wiring set `globalThis.__RW_BOOTSTRAP__`
// before importing this module (see `tests/support/bootstrap-harness.js`). That
// is what makes the production orchestrator behaviour-testable instead of only
// pattern-matchable — the flag has no effect outside the test runtime.
const IS_TEST_RUNTIME = import.meta.env?.MODE === "test";
const BOOTSTRAP_REQUESTED = !IS_TEST_RUNTIME || globalThis.__RW_BOOTSTRAP__ === true;

if (BOOTSTRAP_REQUESTED) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapApp, { once: true });
  } else {
    bootstrapApp();
  }
}

function loadState() {
  if (resetRequest.confirmed) {
    const resetState = freshState();
    if (!resetRequest.cleared) {
      resetState.sync = {
        ...resetState.sync,
        status: "local",
        lastError: "local-reset-incomplete",
        pending: false
      };
    }
    return resetState;
  }

  const currentRaw = readStorage(STORAGE_KEY);
  const legacyRaw = readStorage(LEGACY_STORAGE_KEY);
  const raw = currentRaw || legacyRaw;
  if (!raw) return freshState();
  try {
    const next = migrateState(JSON.parse(raw));
    if (!currentRaw && legacyRaw) {
      next.sync = {
        ...next.sync,
        status: "local",
        localImportPending: true,
        pending: false
      };
    }
    return next;
  } catch {
    return freshState();
  }
}

function migrateState(parsed) {
  try {
    const source = parsed && typeof parsed === "object" ? parsed : {};
    const parsedSettings = source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)
      ? source.settings
      : {};
    const {
      customTasks: settingsCustomTasks,
      project: settingsProject,
      resources: settingsResources,
      ...settingsInput
    } = parsedSettings;
    const settings = { ...defaultSettings, ...settingsInput };
    // Numeric settings are resolved from the raw payload, not from the already
    // default-filled object. Spreading `defaultSettings` first always populates
    // the camelCase field, which would shadow the legacy snake_case fallback and
    // silently reset a pre-camelCase payload back to the defaults.
    settings.weekdayMinutes = firstIntegerValue([settingsInput.weekdayMinutes, settingsInput.weekday_minutes, defaultSettings.weekdayMinutes], 60, 720, defaultSettings.weekdayMinutes);
    settings.weekendMinutes = firstIntegerValue([settingsInput.weekendMinutes, settingsInput.weekend_minutes, defaultSettings.weekendMinutes], 60, 840, defaultSettings.weekendMinutes);
    settings.taskCount = firstIntegerValue([settingsInput.taskCount, settingsInput.task_count, defaultSettings.taskCount], 3, 4, defaultSettings.taskCount);
    settings.coreRatio = firstIntegerValue([settingsInput.coreRatio, settingsInput.core_ratio, defaultSettings.coreRatio], 55, 85, defaultSettings.coreRatio);
    // Runs after normalisation so the efficiency downgrade wins over whatever the
    // payload carried, instead of being overwritten by the clamped raw value.
    if (!settings.efficiencyModeApplied) {
      if (settings.taskCount === 4) settings.taskCount = 3;
      if (!source.settings || source.settings.density === "balanced") settings.density = "focus";
      settings.efficiencyModeApplied = true;
    }
    if (!["focus", "balanced", "detail"].includes(settings.density)) settings.density = "focus";
    settings.targetExamDate = sanitizeDateOrFallback(settings.targetExamDate, DEFAULT_EXAM_DATE) || DEFAULT_EXAM_DATE;
    settings.reviewDays = Array.isArray(settings.reviewDays)
      ? [...new Set(settings.reviewDays.map((day) => sanitizeInteger(day, 1, 365)).filter(Boolean))].sort((a, b) => a - b)
      : [...defaultSettings.reviewDays];
    settings.planControls = normalizePlanControls(settings.planControls);
    settings.notificationsEnabled = sanitizeBoolean(settings.notificationsEnabled);
    settings.officialChecksDone = sanitizeStringList(settings.officialChecksDone, 12, 80);
    const rawEntries = sanitizeEntries(source.entries || {});
    const rawScores = sanitizeScores(source.scores || []);
    const rawWeekPlans = sanitizeWeekPlans(source.weekPlans || {});
    const rawReviewItems = sanitizeReviewItems(source.reviewItems || []);
    const rawTopics = sanitizeNumericObject(source.topics || {}, 0, 2, true);
    const rawTopicEvidence = sanitizeTopicEvidence(source.topicEvidence || {});
    const startArchive = buildCleanStartArchive({
      entries: rawEntries,
      scores: rawScores,
      weekPlans: rawWeekPlans,
      reviewItems: rawReviewItems,
      topics: rawTopics,
      topicEvidence: rawTopicEvidence,
      previousArchive: source.cleanStartArchive
    });
    const cleanStartApplied = settings.cleanStartVersion === CLEAN_START_VERSION;
    const entries = filterEntriesFromStart(rawEntries);
    const scores = filterScoresFromStart(rawScores);
    const topics = cleanStartApplied ? rawTopics : {};
    const topicEvidence = cleanStartApplied ? filterTopicEvidenceFromStart(rawTopicEvidence) : {};
    const rawTasks = sanitizeTaskState(source.tasks || {}, rawWeekPlans);
    const hasTopLevelProject = Object.prototype.hasOwnProperty.call(source, "project");
    const hasTopLevelResources = Object.prototype.hasOwnProperty.call(source, "resources");
    const hasTopLevelCustomTasks = Object.prototype.hasOwnProperty.call(source, "customTasks");
    const resourcesState = sanitizeNumericObject(hasTopLevelResources ? source.resources : settingsResources, 0, 100);
    const customTasksState = hasTopLevelCustomTasks ? source.customTasks : settingsCustomTasks;
    const deleted = filterDeletedFromStart(sanitizeDeleted(source.deleted || {}));
    const deletedMeta = sanitizeDeletedMeta(source.deletedMeta ?? source.deleted_meta ?? {}, deleted);
    settings.cleanStartVersion = CLEAN_START_VERSION;
    settings.cleanStartAppliedAt = settings.cleanStartAppliedAt || startArchive.archivedAt;
    const nextState = {
      schemaVersion: SCHEMA_VERSION,
      entries,
      scores,
      topics,
      topicEvidence,
      tasks: filterTaskStateFromStart(rawTasks, rawWeekPlans),
      weekPlans: filterWeekPlansFromStart(rawWeekPlans),
      project: sanitizeProjectState(hasTopLevelProject ? source.project : settingsProject),
      resources: resourcesState,
      settings,
      customTasks: sanitizeCustomTasks(customTasksState || []),
      reviewItems: filterReviewItemsFromStart(rawReviewItems),
      deleted,
      deletedMeta,
      snapshots: sanitizeSnapshots(source.snapshots || []),
      cleanStartArchive: startArchive,
      sync: defaultSyncState(source.sync),
      user: sanitizeUser(source.user)
    };
    return applyTombstones(nextState);
  } catch (error) {
    // Silently returning `freshState()` here would discard every stored record
    // without a trace. Surface the failure instead so a migration bug is
    // diagnosable rather than presenting as "my data disappeared".
    console.error("[rw] migrateState failed; falling back to a fresh state", error);
    return freshState();
  }
}

function sanitizeBoolean(value) {
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

function isPlainStateObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stateObject(value) {
  return isPlainStateObject(value) ? value : {};
}

function stateArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeScalarText(value, fallback = "", maxLength = 2000) {
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return fallback;
  const text = String(value);
  return text ? text.slice(0, maxLength) : fallback;
}

function safeErrorMessage(error, fallback = "未知错误", maxLength = 500) {
  const safeFallback = safeScalarText(fallback, "未知错误", maxLength) || "未知错误";
  const direct = safeScalarText(error, "", maxLength);
  if (direct) return direct;
  const source = error instanceof Error || isPlainStateObject(error) ? error : null;
  if (!source) return safeFallback;
  for (const field of [source.message, source.error_description, source.details, source.hint, source.code]) {
    const text = safeScalarText(field, "", maxLength);
    if (text) return text;
  }
  return safeFallback;
}

function sanitizeDateKey(value) {
  const text = safeScalarText(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : "";
}

function firstDateKey(values) {
  for (const value of stateArray(values)) {
    const date = sanitizeDateKey(value);
    if (date) return date;
  }
  return "";
}

function sanitizeDateOrFallback(value, fallback = "") {
  if (value == null) return fallback;
  if (!["string", "number", "bigint"].includes(typeof value)) return "";
  const text = safeScalarText(value);
  return text.trim() ? sanitizeDateKey(text) : fallback;
}

function ensureSettingsContainer() {
  const current = stateObject(state.settings);
  const settings = { ...defaultSettings, ...current };
  // Same reason as in migrateState: resolve from the stored payload so the legacy
  // snake_case fallback is reachable when only that form is present.
  settings.weekdayMinutes = firstIntegerValue([current.weekdayMinutes, current.weekday_minutes, defaultSettings.weekdayMinutes], 60, 720, defaultSettings.weekdayMinutes);
  settings.weekendMinutes = firstIntegerValue([current.weekendMinutes, current.weekend_minutes, defaultSettings.weekendMinutes], 60, 840, defaultSettings.weekendMinutes);
  settings.taskCount = firstIntegerValue([current.taskCount, current.task_count, defaultSettings.taskCount], 3, 4, defaultSettings.taskCount);
  settings.coreRatio = firstIntegerValue([current.coreRatio, current.core_ratio, defaultSettings.coreRatio], 55, 85, defaultSettings.coreRatio);
  if (!["focus", "balanced", "detail"].includes(settings.density)) settings.density = "focus";
  settings.targetExamDate = sanitizeDateOrFallback(settings.targetExamDate, DEFAULT_EXAM_DATE) || DEFAULT_EXAM_DATE;
  settings.reviewDays = Array.isArray(settings.reviewDays)
    ? [...new Set(settings.reviewDays.map((day) => sanitizeInteger(day, 1, 365)).filter(Boolean))].sort((a, b) => a - b)
    : [...defaultSettings.reviewDays];
  settings.planControls = normalizePlanControls(settings.planControls);
  state.settings = settings;
  return state.settings;
}

function defaultSyncState(sync = {}) {
  const source = stateObject(sync);
  const status = ["local", "pending", "syncing", "synced", "error", "offline", "paused", "unconfigured"].includes(source.status)
    ? source.status
    : "local";
  return {
    status,
    lastSyncAt: safeScalarText(source.lastSyncAt, "", 80),
    lastError: safeScalarText(source.lastError, "", 500),
    pending: sanitizeBoolean(source.pending),
    localImportPending: sanitizeBoolean(source.localImportPending),
    cloudPaused: sanitizeBoolean(source.cloudPaused)
  };
}

function ensureSyncContainer() {
  state.sync = defaultSyncState(state.sync);
  return state.sync;
}

function ensureTombstoneContainers() {
  const deletedSource = stateObject(state.deleted);
  const deletedMetaSource = stateObject(state.deletedMeta);
  state.deleted = Object.fromEntries(DELETED_TYPES.map((type) => [type, stateArray(deletedSource[type])]));
  state.deletedMeta = Object.fromEntries(DELETED_TYPES.map((type) => [type, stateObject(deletedMetaSource[type])]));
  return { deleted: state.deleted, deletedMeta: state.deletedMeta };
}

function ensureRuntimeContainers() {
  ensureSettingsContainer();
  ensureSyncContainer();
  ensureTombstoneContainers();
  return state;
}

function ensurePlanContainers() {
  state.weekPlans = stateObject(state.weekPlans);
  state.tasks = stateObject(state.tasks);
  return state.weekPlans;
}

function planTasksForDate(date) {
  const weekPlans = ensurePlanContainers();
  weekPlans[date] = stateArray(weekPlans[date]).filter(isPlainStateObject);
  return weekPlans[date];
}

function weekPlanEntries() {
  const weekPlans = ensurePlanContainers();
  return Object.keys(weekPlans).map((date) => [date, planTasksForDate(date)]);
}

function ensureLearningContainers() {
  state.entries = stateObject(state.entries);
  state.scores = stateArray(state.scores).filter(isPlainStateObject);
  state.reviewItems = stateArray(state.reviewItems).filter(isPlainStateObject);
  return state;
}

function entryRow(date) {
  const row = ensureLearningContainers().entries[date];
  return isPlainStateObject(row) ? row : null;
}

function scoreRows() {
  return ensureLearningContainers().scores;
}

function reviewRows() {
  return ensureLearningContainers().reviewItems;
}

function ensureAssetContainers() {
  state.project = stateObject(state.project);
  state.resources = stateObject(state.resources);
  state.customTasks = stateArray(state.customTasks).filter(isPlainStateObject);
  return state;
}

function customTaskRows() {
  return ensureAssetContainers().customTasks;
}

function ensureKnowledgeContainers() {
  state.topics = stateObject(state.topics);
  state.topicEvidence = Object.fromEntries(
    Object.entries(stateObject(state.topicEvidence)).filter(([, evidence]) => isPlainStateObject(evidence))
  );
  return state;
}

function normalizeTopicStatus(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(2, Math.max(0, Math.round(number))) : 0;
}

function topicStateValue(id) {
  return normalizeTopicStatus(ensureKnowledgeContainers().topics[id]);
}

function topicEvidenceRow(id) {
  return stateObject(ensureKnowledgeContainers().topicEvidence[id]);
}

function safeStateKey(key, maxLength = 160) {
  const type = typeof key;
  if (!["string", "number", "boolean", "bigint"].includes(type)) return "";
  const text = String(key).trim();
  if (!text || text.length > maxLength || ["__proto__", "constructor", "prototype"].includes(text)) return "";
  return text;
}

function firstSafeStateKey(values, maxLength = 160) {
  for (const value of stateArray(values)) {
    const key = safeStateKey(value, maxLength);
    if (key) return key;
  }
  return "";
}

function safeStateLabel(value, fallback = "", maxLength = 80) {
  const type = typeof value;
  if (!["string", "number", "boolean", "bigint"].includes(type)) return fallback;
  return safeStateKey(value, maxLength) || fallback;
}

function sanitizeEnum(value, allowedValues, fallback = "") {
  const label = safeStateLabel(value, "", 80);
  return allowedValues.includes(label) ? label : fallback;
}

function sanitizeStringList(value, limit = 12, itemMaxLength = 160) {
  return stateArray(value).flatMap((item) => {
    const type = typeof item;
    if (!["string", "number", "boolean", "bigint"].includes(type)) return [];
    const text = String(item).trim();
    return text && safeStateKey(text, itemMaxLength) ? [text] : [];
  }).slice(0, limit);
}

function firstStringList(values, limit = 12, itemMaxLength = 160) {
  for (const value of stateArray(values)) {
    const list = sanitizeStringList(value, limit, itemMaxLength);
    if (list.length) return list;
  }
  return [];
}

function sanitizeProjectState(project) {
  if (!isPlainStateObject(project)) return {};
  const result = {};
  Object.entries(project).forEach(([rawKey, rawValue]) => {
    const key = safeStateKey(rawKey, 120);
    if (!key) return;
    if (key === "updatedAt" || key === "updated_at") {
      result.updatedAt = safeScalarText(rawValue, "", 80);
      return;
    }
    result[key] = sanitizeBoolean(rawValue);
  });
  return result;
}

function sanitizeNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function sanitizeInteger(value, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.round(sanitizeNumber(value, min, max));
}

function firstNumberValue(values, min = 0, max = Number.POSITIVE_INFINITY, fallback = min) {
  for (const value of stateArray(values)) {
    if (value == null || value === "") continue;
    if (!["string", "number", "bigint"].includes(typeof value)) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return Math.min(max, Math.max(min, number));
  }
  return sanitizeNumber(fallback, min, max);
}

function firstIntegerValue(values, min = 0, max = Number.POSITIVE_INFINITY, fallback = min) {
  return Math.round(firstNumberValue(values, min, max, fallback));
}

function statedFatigue(values) {
  for (const value of stateArray(values)) {
    if (value == null || value === "" || value === 0) continue;
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= 5) return number;
  }
  return null;
}

function sanitizeText(value, fallback = "", maxLength = 2000) {
  return safeScalarText(value, fallback, maxLength);
}

function firstTextValue(values, fallback = "", maxLength = 2000) {
  for (const value of stateArray(values)) {
    const text = sanitizeText(value, "", maxLength);
    if (text) return text;
  }
  return fallback;
}

function firstStateLabel(values, fallback = "", maxLength = 80) {
  for (const value of stateArray(values)) {
    const label = safeStateLabel(value, "", maxLength);
    if (label) return label;
  }
  return fallback;
}

function firstEnumValue(values, allowedValues, fallback = "") {
  for (const value of stateArray(values)) {
    const label = sanitizeEnum(value, allowedValues, "");
    if (label) return label;
  }
  return fallback;
}

function booleanValue(value) {
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return { ok: true, value: true };
    if (["false", "0", "no", "off", ""].includes(normalized)) return { ok: true, value: false };
    return { ok: false, value: false };
  }
  if (typeof value === "number") return { ok: Number.isFinite(value), value: Number.isFinite(value) && value !== 0 };
  if (typeof value === "bigint") return { ok: true, value: value !== 0n };
  return { ok: false, value: false };
}

function firstBooleanValue(values, fallback = false) {
  for (const value of stateArray(values)) {
    const result = booleanValue(value);
    if (result.ok) return result.value;
  }
  return fallback;
}

function sanitizeEntries(entries) {
  if (!isPlainStateObject(entries)) return {};
  return Object.fromEntries(Object.entries(entries).flatMap(([rawDate, entry]) => {
    const date = sanitizeDateKey(rawDate);
    if (!date) return [];
    const row = isPlainStateObject(entry) ? entry : {};
    const decodedLoad = decodeLoadNote(row.note);
    return [[date, {
      math: sanitizeNumber(row.math),
      cs408: sanitizeNumber(row.cs408),
      english: sanitizeNumber(row.english),
      politics: sanitizeNumber(row.politics),
      project: sanitizeNumber(row.project),
      mathProblems: sanitizeNumber(row.mathProblems),
      csProblems: sanitizeNumber(row.csProblems),
      reading: sanitizeNumber(row.reading),
      newMistakes: sanitizeNumber(row.newMistakes),
      fixedMistakes: sanitizeNumber(row.fixedMistakes),
      quality: firstIntegerValue([row.quality, row.quality_score, 3], 1, 5, 3),
      nextTask: sanitizeText(row.nextTask, "", 1000),
      note: encodeLoadNote(decodedLoad.note, {
        loadTier: sanitizeLoadTier(row.loadTier ?? row.load_tier, decodedLoad.loadTier),
        sleepHours: sanitizeSleepHours(row.sleepHours ?? row.sleep_hours ?? decodedLoad.sleepHours),
        fatigue: statedFatigue([row.fatigue, decodedLoad.fatigue])
      }),
      sleepHours: sanitizeSleepHours(row.sleepHours ?? row.sleep_hours ?? decodedLoad.sleepHours),
      fatigue: statedFatigue([row.fatigue, decodedLoad.fatigue]),
      loadTier: sanitizeLoadTier(row.loadTier ?? row.load_tier, decodedLoad.loadTier),
      updatedAt: sanitizeText(row.updatedAt, "", 80)
    }]];
  }));
}

function sanitizeScores(scores) {
  return (Array.isArray(scores) ? scores : []).flatMap((score) => {
    if (!isPlainStateObject(score)) return [];
    const row = score;
    const id = safeStateKey(row.id) || uid("score");
    const date = sanitizeDateOrFallback(row.date, planTodayISO());
    if (!date) return [];
    const politics = sanitizeNumber(row.politics, 0, 100);
    const english = sanitizeNumber(row.english, 0, 100);
    const math = sanitizeNumber(row.math, 0, 150);
    const cs408 = sanitizeNumber(row.cs408, 0, 150);
    return [{
      id,
      date,
      name: sanitizeText(row.name, "未命名模考", 120),
      politics,
      english,
      math,
      cs408,
      total: politics + english + math + cs408,
      note: sanitizeText(row.note, "", 2000),
      updatedAt: sanitizeText(row.updatedAt, "", 80)
    }];
  });
}

function sanitizeNumericObject(object, min = 0, max = Number.POSITIVE_INFINITY, integer = false) {
  if (!isPlainStateObject(object)) return {};
  return Object.fromEntries(Object.entries(object).flatMap(([rawKey, value]) => {
    const key = safeStateKey(rawKey);
    return key ? [[key, integer ? sanitizeInteger(value, min, max) : sanitizeNumber(value, min, max)]] : [];
  }));
}

function sanitizeTopicEvidence(evidenceMap) {
  if (!isPlainStateObject(evidenceMap)) return {};
  return Object.fromEntries(Object.entries(evidenceMap).flatMap(([rawTopicId, evidence]) => {
    const topicId = safeStateKey(rawTopicId);
    if (!topicId) return [];
    const row = isPlainStateObject(evidence) ? evidence : {};
    return [[topicId, {
      problems: sanitizeNumber(row.problems),
      accuracy: sanitizeNumber(row.accuracy, 0, 100),
      evidence: sanitizeText(row.evidence, "", 2000),
      lastReviewDate: sanitizeText(row.lastReviewDate, "", 40),
      totalProblems: firstNumberValue([row.totalProblems, row.total_problems]),
      recent14dAccuracy: normalizeRatio(firstNumberValue([row.recent14dAccuracy, row.recent_14d_accuracy])),
      lastReviewAt: firstTextValue([row.lastReviewAt, row.last_review_at], "", 80),
      masteryStatus: firstEnumValue([row.masteryStatus, row.mastery_status], ["learning", "needs_review", "mastered"], ""),
      prerequisites: sanitizeStringList(row.prerequisites),
      updatedAt: firstTextValue([row.updatedAt, row.updated_at], "", 80)
    }]];
  }));
}

function sanitizeWeekPlans(weekPlans) {
  if (!isPlainStateObject(weekPlans)) return {};
  return Object.fromEntries(Object.entries(weekPlans).flatMap(([rawDate, tasks]) => {
    const date = sanitizeDateKey(rawDate);
    if (!date) return [];
    return [[date, (Array.isArray(tasks) ? tasks : [])
      .filter(isPlainStateObject)
      .map((task, index) => sanitizeTask(task, date, index))]];
  }));
}

function sanitizeTask(task, date, index = 0) {
  const row = isPlainStateObject(task) ? task : {};
  const status = sanitizeEnum(row.status, ["todo", "done", "shifted", "delayed", "failed"], "todo");
  const taskId = safeStateKey(row.id) || `${date}-${index}`;
  return {
    id: taskId,
    date: sanitizeDateOrFallback(row.date, date) || date,
    subject: normalizeSubjectLabel(row.subject),
    text: sanitizeText(row.text, "回炉错题，写明下次识别信号", 1000),
    topicId: firstSafeStateKey([row.topicId, row.topic_id]),
    minutes: sanitizeInteger(row.minutes, 0, 240),
    priority: sanitizeInteger(row.priority || index + 1, 1, 99),
    status,
    locked: sanitizeBoolean(row.locked),
    source: safeStateLabel(row.source, "generated"),
    sourceTaskId: firstSafeStateKey([row.sourceTaskId, row.source_task_id]),
    carriedFrom: firstDateKey([row.carriedFrom, row.carried_from]),
    shiftedTo: firstDateKey([row.shiftedTo, row.shifted_to]),
    reviewItemId: safeStateKey(row.reviewItemId),
    completedAt: firstTextValue([row.completedAt, row.completed_at], "", 80),
    recordApplied: firstBooleanValue([row.recordApplied, row.record_applied]),
    recordImpact: firstTaskRecordImpact([row.recordImpact, row.record_impact]),
    updatedAt: firstTextValue([row.updatedAt, row.updated_at], "", 80),
    contractType: firstStateLabel([row.contractType, row.contract_type], "problems", 40),
    requiredProblemCount: firstIntegerValue([row.requiredProblemCount, row.required_problem_count], 0, 999),
    requiredAccuracy: normalizeRatio(firstNumberValue([row.requiredAccuracy, row.required_accuracy])),
    requiredArtifacts: firstStringList([row.requiredArtifacts, row.required_artifacts], 8),
    minutesMin: firstIntegerValue([row.minutesMin, row.minutes_min], 0, 240),
    minutesMax: firstIntegerValue([row.minutesMax, row.minutes_max], 0, 240),
    actualProblems: firstIntegerValue([row.actualProblems, row.actual_problems], 0, 999),
    actualCorrect: firstIntegerValue([row.actualCorrect, row.actual_correct], 0, 999),
    actualMinutes: firstIntegerValue([row.actualMinutes, row.actual_minutes], 0, 720),
    evidenceSubmitted: firstBooleanValue([row.evidenceSubmitted, row.evidence_submitted])
  };
}

function normalizeTaskRecordImpact(impact) {
  if (!impact || typeof impact !== "object") return null;
  const allowedFields = new Set(["math", "cs408", "english", "politics", "project", "mathProblems", "csProblems", "reading"]);
  const changes = (Array.isArray(impact.changes) ? impact.changes : [])
    .map((change) => {
      const field = safeScalarText(change.field, "", 40) || safeScalarText(change.key, "", 40);
      return {
        field,
        before: sanitizeNumber(change.before, 0, 100000),
        after: sanitizeNumber(change.after, 0, 100000)
      };
    })
    .filter((change) => allowedFields.has(change.field) && change.before !== change.after)
    .slice(0, 12);

  if (!changes.length) return null;
  return {
    date: sanitizeDateKey(impact.date),
    changes
  };
}

function firstTaskRecordImpact(values) {
  for (const value of stateArray(values)) {
    const impact = normalizeTaskRecordImpact(value);
    if (impact) return impact;
  }
  return null;
}

function sanitizeReviewItems(items) {
  return (Array.isArray(items) ? items : []).filter(isPlainStateObject).flatMap((item) => {
    const done = sanitizeBoolean(item.done);
    const status = sanitizeEnum(item.status, ["due", "done", "delayed", "failed"], done ? "done" : "due");
    const dueDate = firstDateKey([item.dueDate, item.due_date]) || (item.dueDate == null && item.due_date == null ? planTodayISO() : "");
    if (!dueDate) return [];
    return [{
      id: safeStateKey(item.id) || uid("review"),
      sourceTaskId: firstSafeStateKey([item.sourceTaskId, item.source_task_id]),
      subject: normalizeSubjectLabel(item.subject),
      text: firstTextValue([item.text, item.title], "", 1000),
      round: firstTextValue([item.round, item.review_round], "", 40),
      dueDate,
      status,
      done: done || status === "done",
      delayCount: firstIntegerValue([item.delayCount, item.delay_count], 0, 99),
      failureReason: firstTextValue([item.failureReason, item.failure_reason], "", 1000),
      quality: firstIntegerValue([item.quality, item.quality_score], 0, 5),
      completedAt: firstTextValue([item.completedAt, item.completed_at], "", 80),
      intervalIndex: firstIntegerValue([item.intervalIndex, item.interval_index], 0, 99),
      failStreak: firstIntegerValue([item.failStreak, item.fail_streak], 0, 99),
      leech: sanitizeBoolean(item.leech),
      lastResult: firstEnumValue([item.lastResult, item.last_result], ["pass", "fail", "delay", "again", "hard", "good", "easy"], ""),
      lastSubmittedDate: firstDateKey([item.lastSubmittedDate, item.last_submitted_date]),
      topicId: firstSafeStateKey([item.topicId, item.topic_id]),
      updatedAt: firstTextValue([item.updatedAt, item.updated_at], "", 80)
    }];
  });
}

function isOnOrAfterPlanStart(date = "") {
  const dateKey = sanitizeDateKey(date);
  return Boolean(dateKey && dateKey >= PLAN_START_DATE);
}

function filterEntriesFromStart(entries = {}) {
  return Object.fromEntries(Object.entries(stateObject(entries)).filter(([date]) => isOnOrAfterPlanStart(date)));
}

function filterScoresFromStart(scores = []) {
  return stateArray(scores).filter((score) => isPlainStateObject(score) && isOnOrAfterPlanStart(score.date));
}

function filterWeekPlansFromStart(weekPlans = {}) {
  return Object.fromEntries(Object.entries(stateObject(weekPlans)).flatMap(([date, tasks]) => (
    isOnOrAfterPlanStart(date) ? [[date, stateArray(tasks)]] : []
  )));
}

function sanitizeTaskState(tasks = {}, weekPlans = {}) {
  const next = {};
  if (isPlainStateObject(tasks)) Object.entries(tasks).forEach(([id, done]) => {
    const key = safeStateKey(id);
    if (key) next[key] = sanitizeBoolean(done);
  });
  Object.values(stateObject(weekPlans)).flatMap(stateArray).filter(isPlainStateObject).forEach((task) => {
    if (!task.id || typeof next[task.id] !== "undefined") return;
    next[task.id] = task.status === "done";
  });
  return next;
}

function taskIdDate(id = "") {
  const date = safeScalarText(id).slice(0, 10);
  return sanitizeDateKey(date);
}

function hasMalformedDatePrefix(value = "") {
  const date = safeScalarText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !sanitizeDateKey(date);
}

function taskDateFromWeekPlans(id, weekPlans = {}) {
  if (hasMalformedDatePrefix(id)) return "__invalid_date__";
  const directDate = taskIdDate(id);
  if (directDate) return directDate;
  for (const [date, tasks] of Object.entries(stateObject(weekPlans))) {
    if (stateArray(tasks).some((task) => isPlainStateObject(task) && task.id === id)) return date;
  }
  return "";
}

function filterTaskStateFromStart(tasks = {}, weekPlans = {}) {
  if (!isPlainStateObject(tasks)) return {};
  return Object.fromEntries(Object.entries(tasks).filter(([id]) => {
    const date = taskDateFromWeekPlans(id, weekPlans);
    if (date === "__invalid_date__") return false;
    return !date || isOnOrAfterPlanStart(date);
  }));
}

function filterReviewItemsFromStart(items = []) {
  return stateArray(items).filter((item) => {
    if (!isPlainStateObject(item)) return false;
    if (
      hasMalformedDatePrefix(item.dueDate) ||
      hasMalformedDatePrefix(item.due_date) ||
      hasMalformedDatePrefix(item.nextDueAt) ||
      hasMalformedDatePrefix(item.next_due_at) ||
      hasMalformedDatePrefix(item.sourceTaskId) ||
      hasMalformedDatePrefix(item.source_task_id)
    ) return false;
    const dueDate = firstDateKey([item.dueDate, item.due_date, item.nextDueAt, item.next_due_at]);
    const sourceDate = taskIdDate(firstSafeStateKey([item.sourceTaskId, item.source_task_id]));
    return isOnOrAfterPlanStart(dueDate) && (!sourceDate || isOnOrAfterPlanStart(sourceDate));
  });
}

function filterTopicEvidenceFromStart(evidenceMap = {}) {
  return Object.fromEntries(Object.entries(stateObject(evidenceMap)).filter(([, evidence]) => {
    if (!isPlainStateObject(evidence)) return false;
    if (hasMalformedDatePrefix(evidence.lastReviewDate) || hasMalformedDatePrefix(evidence.lastReviewAt)) return false;
    const date = firstDateKey([evidence.lastReviewDate, evidence.lastReviewAt]);
    return !date || isOnOrAfterPlanStart(date);
  }));
}

function filterDeletedFromStart(deleted = {}) {
  const source = stateObject(deleted);
  return {
    records: stateArray(source.records).filter((date) => isOnOrAfterPlanStart(date)),
    scores: [...stateArray(source.scores)],
    tasks: stateArray(source.tasks).filter((id) => {
      if (hasMalformedDatePrefix(id)) return false;
      const date = taskIdDate(id);
      return !date || isOnOrAfterPlanStart(date);
    }),
    reviews: stateArray(source.reviews).filter((id) => {
      if (hasMalformedDatePrefix(id)) return false;
      const date = taskIdDate(id);
      return !date || isOnOrAfterPlanStart(date);
    })
  };
}

function buildCleanStartArchive({ entries, scores, weekPlans, reviewItems, topics, topicEvidence, previousArchive }) {
  const archivedEntries = Object.keys(stateObject(entries)).filter((date) => !isOnOrAfterPlanStart(date));
  const archivedScores = stateArray(scores).filter((score) => isPlainStateObject(score) && !isOnOrAfterPlanStart(score.date)).length;
  const archivedWeekPlans = Object.keys(stateObject(weekPlans)).filter((date) => !isOnOrAfterPlanStart(date));
  const archivedReviews = stateArray(reviewItems).filter((item) => isPlainStateObject(item) && !isOnOrAfterPlanStart(item.dueDate)).length;
  const topicCount = Object.keys(stateObject(topics)).length;
  const evidenceCount = Object.keys(stateObject(topicEvidence)).length;
  const safePreviousArchive = stateObject(previousArchive);
  const archivedAt = safePreviousArchive.version === CLEAN_START_VERSION && safePreviousArchive.archivedAt
    ? safePreviousArchive.archivedAt
    : new Date().toISOString();
  return {
    ...safePreviousArchive,
    version: CLEAN_START_VERSION,
    startDate: PLAN_START_DATE,
    archivedAt,
    note: `${PLAN_START_DATE} 从头开始；早于起点的数据仅归档，不再参与计划、统计和复盘。`,
    counts: {
      entriesBeforeStart: archivedEntries.length,
      scoresBeforeStart: archivedScores,
      weekPlanDaysBeforeStart: archivedWeekPlans.length,
      reviewsBeforeStart: archivedReviews,
      previousTopicMarks: previousArchive?.counts?.previousTopicMarks ?? topicCount,
      previousTopicEvidence: previousArchive?.counts?.previousTopicEvidence ?? evidenceCount
    },
    entryDates: archivedEntries.slice(0, 120),
    weekPlanDates: archivedWeekPlans.slice(0, 120)
  };
}

function sanitizeCustomTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter(isPlainStateObject).map((task) => ({
    id: safeStateKey(task.id) || uid("custom"),
    subject: normalizeSubjectLabel(task.subject),
    text: sanitizeText(task.text, "", 1000),
    minutes: sanitizeInteger(task.minutes, 10, 240),
    updatedAt: firstTextValue([task.updatedAt, task.updated_at], "", 80)
  })).filter((task) => task.text);
}

function sanitizeDeleted(deleted) {
  const source = isPlainStateObject(deleted) ? deleted : {};
  const asArray = (value) => Array.isArray(value) ? value.map((item) => safeStateKey(item)).filter(Boolean) : [];
  return {
    records: (Array.isArray(source.records) ? source.records.map(sanitizeDateKey).filter(Boolean) : []),
    scores: asArray(source.scores),
    tasks: asArray(source.tasks),
    reviews: asArray(source.reviews)
  };
}

function normalizeTimestamp(value, fallback = "") {
  const text = safeScalarText(value, "", 80);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function sanitizeDeletedMeta(deletedMeta, deleted = {}) {
  const source = isPlainStateObject(deletedMeta) ? deletedMeta : {};
  return Object.fromEntries(DELETED_TYPES.map((type) => {
    const ids = new Set(Array.isArray(deleted[type]) ? deleted[type].map((item) => String(item)) : []);
    const rows = isPlainStateObject(source[type]) ? source[type] : {};
    return [type, Object.fromEntries(Object.entries(rows).flatMap(([id, value]) => {
      const key = safeStateKey(id);
      const timestamp = normalizeTimestamp(value);
      return key && ids.has(key) && timestamp ? [[key, timestamp]] : [];
    }))];
  }));
}

function normalizeRatio(value) {
  const number = sanitizeNumber(value, 0, 100);
  return number > 1 ? number / 100 : number;
}

function sanitizeSnapshots(snapshots) {
  return stateArray(snapshots).filter(isPlainStateObject).slice(0, 5).map((snapshot) => {
    const row = snapshot;
    return {
      reason: sanitizeSnapshotReason(row.reason),
      createdAt: safeScalarText(row.createdAt, "", 80) || safeScalarText(row.created_at, "", 80),
      payload: sanitizeSnapshotPayload(row.payload && typeof row.payload === "object" ? row.payload : row)
    };
  });
}

function sanitizeSnapshotReason(value) {
  const type = typeof value;
  if (!["string", "number", "boolean", "bigint"].includes(type)) return "manual";
  const text = String(value).trim().slice(0, 120);
  if (!text || ["__proto__", "constructor", "prototype"].includes(text)) return "manual";
  return text;
}

function snapshotRows(snapshots) {
  return stateArray(snapshots).filter((snapshot) => isPlainStateObject(snapshot) && isPlainStateObject(snapshot.payload));
}

function sanitizeSnapshotPayload(payload) {
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
  return cloneJson(Object.fromEntries(allowedKeys.flatMap((key) => (
    Object.prototype.hasOwnProperty.call(payload, key) ? [[key, payload[key]]] : []
  ))));
}

function cloneJson(value, fallback = {}) {
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(value, (key, current) => {
      if (typeof current === "bigint") return String(current);
      if (current && typeof current === "object") {
        if (seen.has(current)) return undefined;
        seen.add(current);
      }
      return current;
    });
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeUserText(value, maxLength = 254) {
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return "";
  return safeStateKey(value, maxLength);
}

function sanitizeUser(user) {
  if (!isPlainStateObject(user)) return null;
  const id = sanitizeUserText(user.id, 160);
  const email = sanitizeUserText(user.email, 254);
  if (!id && !email) return null;
  return {
    id,
    email
  };
}

function freshState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    entries: {},
    scores: [],
    topics: {},
    topicEvidence: {},
    tasks: {},
    weekPlans: {},
    project: {},
    resources: {},
    settings: {
      ...defaultSettings,
      planControls: normalizePlanControls(defaultSettings.planControls),
      efficiencyModeApplied: true,
      cleanStartVersion: CLEAN_START_VERSION,
      cleanStartAppliedAt: new Date().toISOString()
    },
    customTasks: [],
    reviewItems: [],
    deleted: { records: [], scores: [], tasks: [], reviews: [] },
    deletedMeta: { records: {}, scores: {}, tasks: {}, reviews: {} },
    snapshots: [],
    sync: { status: "local", lastSyncAt: "", lastError: "", pending: false, localImportPending: false, cloudPaused: false },
    user: null
  };
}

function saveState(options = {}) {
  state = applyTombstones(state);
  state.schemaVersion = SCHEMA_VERSION;
  ensureRuntimeContainers();
  state.settings.lastSavedAt = new Date().toISOString();
  const payload = JSON.stringify(state);
  const saved = writeStorage(STORAGE_KEY, payload);
  void persistRecoveryCopy(payload);
  if (!saved) {
    state.sync = { ...state.sync, status: "local", lastError: "local-storage-unavailable", pending: false };
    notifyStorageWriteFailure();
  }
  renderSyncStatus();
  if (!options.skipCloud) queueCloudSync();
  return saved;
}

function notifyStorageWriteFailure() {
  const now = Date.now();
  if (now - lastStorageFailureNoticeAt < STORAGE_FAILURE_NOTICE_INTERVAL_MS) return;
  lastStorageFailureNoticeAt = now;
  setAuthResult("error", "本机缓存不可用", "浏览器阻止写入本机缓存，请先导出备份；刷新后本次更改可能不会保留。");
  renderStorageStatus();
  renderAuthPanel();
}

function setLocalSaveResult(saved, successTitle, successMessage, failureTitle) {
  setAuthResult(saved ? "success" : "error", saved ? successTitle : failureTitle, saved
    ? successMessage
    : "浏览器阻止写入本机缓存；本次更改只保留在当前页面。请立即导出备份，刷新前不要关闭页面。");
}

function bindCloudAuthListener() {
  if (stopCloudAuthListener) return;
  stopCloudAuthListener = onAuthChange((user, event) => {
    // Login and logout actions perform their own pull/cleanup. Ignore the
    // matching Supabase event while that request is still settling to avoid a
    // second concurrent merge that can overwrite the visible state.
    if (authRequestInFlight) return;
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoveryPending = true;
      currentUser = user;
      state.user = user ? { id: user.id, email: user.email || "" } : null;
      renderSyncStatus();
      renderAuthPanel();
      openAuthDialog();
      setAuthResult("pending", "验证已通过", "请为当前账号设置新密码。");
      focusAuthPanel(user, true);
      return;
    }
    return handleCloudAuthChange(user);
  });
}

async function handleCloudAuthChange(user) {
  currentUser = user;
  state.user = user ? { id: user.id, email: user.email || "" } : null;
  let localSaved;
  if (user) {
    const pullResult = await pullCloudState();
    localSaved = pullResult?.localSaved !== false;
  } else {
    state.sync = {
      ...state.sync,
      status: state.sync?.cloudPaused ? "paused" : "local",
      pending: false,
      lastError: "not-authenticated"
    };
    localSaved = saveState({ skipCloud: true });
  }
  renderSyncStatus();
  renderAll();
  renderAuthPanel();
  if (!localSaved) {
    setLocalSaveResult(false, "账号会话状态已保存", "账号会话状态已写入本机缓存。", "账号会话状态未写入本机缓存");
  }
}

/**
 * Detect a Supabase auth redirect (email confirmation, recovery, magic link or
 * an error callback) in the current URL. These land before a session exists in
 * storage, so they must be allowed to boot the cloud client.
 */
function hasCloudAuthRedirect() {
  try {
    const raw = `${window.location.hash || ""}&${window.location.search || ""}`;
    return /(?:^|[?&#])(?:access_token|refresh_token|error_description|error_code)=/i.test(raw)
      || /(?:^|[?&#])type=(?:signup|recovery|invite|magiclink|email_change)/i.test(raw);
  } catch {
    return false;
  }
}

async function initCloudSession() {
  if (!supabaseConfigured) {
    currentUser = null;
    state.user = null;
    renderSyncStatus();
    return;
  }
  // The Supabase SDK is a ~209 kB dynamic chunk. It must not be fetched for a
  // browser that has never held a cloud session. `onAuthChange` and
  // `getCurrentSession` both require the client, so the SDK would load here.
  // Only continue when a session is persisted, or when the URL carries an auth
  // redirect that is about to establish one.
  if (!hasPersistedCloudSession() && !hasCloudAuthRedirect()) {
    currentUser = null;
    state.user = null;
    renderSyncStatus();
    return;
  }
  // Subscribe before reading the session so email-confirmation redirects and
  // sessions restored by Supabase are handled even when localStorage is empty.
  bindCloudAuthListener();
  try {
    const sessionResult = await getCurrentSession();
    currentUser = sessionResult?.user || null;
    if (currentUser) {
      state.user = { id: currentUser.id, email: currentUser.email || "" };
      await pullCloudState();
    }
  } catch (error) {
    currentUser = null;
    state.user = null;
    const message = friendlyAuthError(error);
    lastAuthResult = {
      status: "error",
      title: "云端会话不可用",
      message
    };
    state.sync = { ...state.sync, status: "error", lastError: safeErrorMessage(error, "云端会话不可用"), pending: false };
    const saved = saveState({ skipCloud: true });
    if (!saved) {
      lastAuthResult = {
        status: "error",
        title: "云端会话状态未写入本机缓存",
        message: `${message} 浏览器阻止写入本机缓存；请立即导出备份，刷新前不要关闭页面。`
      };
    }
    renderAuthPanel();
  }
  renderSyncStatus();
}

async function pullCloudState() {
  if (!currentUser || !supabaseConfigured) {
    const reason = currentUser && !supabaseConfigured ? "unconfigured" : "not-authenticated";
    if (!currentUser) state.user = null;
    state.sync = {
      ...state.sync,
      status: state.sync?.cloudPaused ? "paused" : (currentUser ? "unconfigured" : "local"),
      pending: false,
      lastError: reason
    };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    return { ok: false, reason, localSaved };
  }
  if (state.sync?.cloudPaused) {
    state.sync = { ...state.sync, status: "paused", pending: false };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    return { ok: false, reason: "cloud-paused", localSaved };
  }
  if (state.sync?.localImportPending) {
    state.sync = { ...state.sync, status: "pending", pending: true };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    return { ok: false, reason: "local-import-pending", localSaved };
  }
  try {
    state = enforceCleanStartState(state);
    state.sync = { ...state.sync, status: "syncing", lastError: "" };
    renderSyncStatus();
    const cloudState = await loadCloudState(state);
    if (!cloudState) {
      currentUser = null;
      state.user = null;
      state.sync = { ...state.sync, status: "local", pending: false, lastError: "not-authenticated" };
      const localSaved = saveState({ skipCloud: true });
      renderSyncStatus();
      renderAuthPanel();
      return { ok: false, reason: "not-authenticated", localSaved };
    }
    if (cloudState) {
      state = migrateState(mergeStateByUpdatedAt(state, cloudState));
      state.sync = {
        status: "synced",
        lastSyncAt: new Date().toISOString(),
        lastError: "",
        pending: false,
        localImportPending: false,
        cloudPaused: false
      };
      legacyImportPending = false;
      const localSaved = saveState({ skipCloud: true });
      return { ok: true, pulled: true, localSaved };
    }
    return { ok: true, pulled: true, localSaved: true };
  } catch (error) {
    const message = safeErrorMessage(error, "拉取云端失败");
    state.sync = { ...state.sync, status: conflictSyncStatus(message), lastError: message, pending: true };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    return { ok: false, reason: "pull-failed", error: message, localSaved };
  }
}

function mergeStateByUpdatedAt(localState, cloudState) {
  const cloudCleanStarted = cloudState.cloudMeta
    ? cloudState.cloudMeta.cleanStartVersion === CLEAN_START_VERSION
    : cloudState.settings?.cleanStartVersion === CLEAN_START_VERSION;
  const mergedTopics = mergeTopicState(localState, cloudState, cloudCleanStarted);
  const mergedDeleted = mergeDeletedTombstones(localState.deleted, cloudState.deleted);
  const mergedDeletedMeta = mergeDeletedTombstoneMeta(localState.deletedMeta, cloudState.deletedMeta, mergedDeleted);
  const merged = applyTombstones({
    ...localState,
    ...cloudState,
    settings: mergeSettingsByVersionedAssets(localState, cloudState),
    entries: mergeObjectsByUpdatedAt(localState.entries, cloudState.entries),
    tasks: { ...localState.tasks, ...cloudState.tasks },
    weekPlans: mergeWeekPlans(localState.weekPlans, cloudState.weekPlans),
    reviewItems: mergeArrayById(localState.reviewItems, cloudState.reviewItems),
    scores: mergeArrayById(localState.scores, cloudState.scores),
    customTasks: mergeCustomTasks(localState, cloudState),
    project: mergeVersionedObject(localState.project, cloudState.project),
    topics: mergedTopics.topics,
    topicEvidence: mergedTopics.topicEvidence,
    resources: mergeVersionedObject(
      localState.resources,
      cloudState.resources,
      localState.settings?.resourcesUpdatedAt,
      cloudState.settings?.resourcesUpdatedAt
    ),
    deleted: mergedDeleted,
    deletedMeta: mergedDeletedMeta,
    sync: cloudState.sync,
    user: cloudState.user
  });
  return enforceCleanStartState(merged);
}

function enforceCleanStartState(nextState) {
  const clean = migrateState({
    ...nextState,
    settings: {
      ...(nextState.settings || {}),
      cleanStartVersion: (nextState.settings || {}).cleanStartVersion
    }
  });
  return {
    ...clean,
    sync: nextState.sync,
    user: nextState.user
  };
}

function timestampMs(value) {
  const type = typeof value;
  if (!["string", "number", "bigint"].includes(type)) return 0;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function mergeArrayById(localItems = [], cloudItems = []) {
  const map = new Map();
  [...stateArray(localItems), ...stateArray(cloudItems)].filter(isPlainStateObject).forEach((item) => {
    const dateKey = safeScalarText(item.date, "", 80);
    const nameKey = safeScalarText(item.name, "", 120);
    const id = safeStateKey(item.id) || safeStateKey(dateKey || nameKey ? `${dateKey}-${nameKey}` : "");
    if (!id) return;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
      return;
    }
    const oldTime = timestampMs(existing.updatedAt || existing.completedAt || existing.date);
    const newTime = timestampMs(item.updatedAt || item.completedAt || item.date);
    map.set(id, newTime >= oldTime ? item : existing);
  });
  return [...map.values()];
}

function mergeSettingsByVersionedAssets(localState = {}, cloudState = {}) {
  const local = stateObject(localState);
  const cloud = stateObject(cloudState);
  const localSettings = stateObject(local.settings);
  const cloudSettings = stateObject(cloud.settings);
  const settings = { ...localSettings, ...cloudSettings };
  ["customTasksUpdatedAt", "resourcesUpdatedAt"].forEach((key) => {
    const localTime = timestampMs(localSettings[key]);
    const cloudTime = timestampMs(cloudSettings[key]);
    if (localTime || cloudTime) settings[key] = cloudTime > localTime ? cloudSettings[key] : localSettings[key];
  });
  return settings;
}

function mergeCustomTasks(localState = {}, cloudState = {}) {
  const local = stateObject(localState);
  const cloud = stateObject(cloudState);
  const localTime = timestampMs(stateObject(local.settings).customTasksUpdatedAt);
  const cloudTime = timestampMs(stateObject(cloud.settings).customTasksUpdatedAt);
  if (localTime || cloudTime) return stateArray(cloudTime > localTime ? cloud.customTasks : local.customTasks).filter(isPlainStateObject);
  return mergeArrayById(local.customTasks, cloud.customTasks);
}

function mergeTopicState(localState = {}, cloudState = {}, cloudCleanStarted = false) {
  const local = stateObject(localState);
  const cloud = stateObject(cloudState);
  if (!cloudCleanStarted) {
    return {
      topics: { ...stateObject(local.topics) },
      topicEvidence: { ...stateObject(local.topicEvidence) }
    };
  }
  const localTopics = stateObject(local.topics);
  const cloudTopics = stateObject(cloud.topics);
  const localEvidence = stateObject(local.topicEvidence);
  const cloudEvidence = stateObject(cloud.topicEvidence);
  const ids = new Set([
    ...Object.keys(localTopics),
    ...Object.keys(cloudTopics),
    ...Object.keys(localEvidence),
    ...Object.keys(cloudEvidence)
  ]);
  const topics = {};
  const topicEvidence = {};
  ids.forEach((id) => {
    const localTime = timestampMs(localEvidence[id]?.updatedAt);
    const cloudTime = timestampMs(cloudEvidence[id]?.updatedAt);
    const hasCloud = Object.prototype.hasOwnProperty.call(cloudTopics, id) || Object.prototype.hasOwnProperty.call(cloudEvidence, id);
    const useCloud = localTime || cloudTime ? cloudTime > localTime : hasCloud;
    const primaryTopics = useCloud ? cloudTopics : localTopics;
    const fallbackTopics = useCloud ? localTopics : cloudTopics;
    const primaryEvidence = useCloud ? cloudEvidence : localEvidence;
    const fallbackEvidence = useCloud ? localEvidence : cloudEvidence;
    if (Object.prototype.hasOwnProperty.call(primaryTopics, id)) topics[id] = primaryTopics[id];
    else if (Object.prototype.hasOwnProperty.call(fallbackTopics, id)) topics[id] = fallbackTopics[id];
    if (isPlainStateObject(primaryEvidence[id])) topicEvidence[id] = primaryEvidence[id];
    else if (isPlainStateObject(fallbackEvidence[id])) topicEvidence[id] = fallbackEvidence[id];
  });
  return { topics, topicEvidence };
}

function mergeVersionedObject(localObject = {}, cloudObject = {}, localUpdatedAt = "", cloudUpdatedAt = "") {
  const local = stateObject(localObject);
  const cloud = stateObject(cloudObject);
  const localTime = timestampMs(localUpdatedAt || local.updatedAt);
  const cloudTime = timestampMs(cloudUpdatedAt || cloud.updatedAt);
  if (localTime || cloudTime) return cloudTime > localTime ? { ...cloud } : { ...local };
  return { ...local, ...cloud };
}

function mergeObjectsByUpdatedAt(localObject = {}, cloudObject = {}) {
  const result = { ...stateObject(localObject) };
  Object.entries(stateObject(cloudObject)).forEach(([key, value]) => {
    if (!safeStateKey(key) || !isPlainStateObject(value)) return;
    const existing = result[key];
    if (!isPlainStateObject(existing)) {
      result[key] = value;
      return;
    }
    const oldTime = timestampMs(existing.updatedAt);
    const newTime = timestampMs(value.updatedAt);
    result[key] = newTime >= oldTime ? value : existing;
  });
  return result;
}

function mergeWeekPlans(localPlans = {}, cloudPlans = {}) {
  const local = stateObject(localPlans);
  const cloud = stateObject(cloudPlans);
  const dates = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  const result = {};
  dates.forEach((date) => {
    result[date] = mergeArrayById(local[date], cloud[date]);
  });
  return result;
}

function mergeDeletedTombstones(localDeleted = {}, cloudDeleted = {}) {
  const mergeList = (type) => [...new Set([
    ...(Array.isArray(cloudDeleted?.[type]) ? cloudDeleted[type] : []),
    ...(Array.isArray(localDeleted?.[type]) ? localDeleted[type] : [])
  ].map((item) => String(item)).filter(Boolean))];
  return Object.fromEntries(DELETED_TYPES.map((type) => [type, mergeList(type)]));
}

function mergeDeletedTombstoneMeta(localMeta = {}, cloudMeta = {}, mergedDeleted = {}) {
  return Object.fromEntries(DELETED_TYPES.map((type) => {
    const ids = new Set(Array.isArray(mergedDeleted[type]) ? mergedDeleted[type].map((item) => String(item)) : []);
    const rows = {};
    ids.forEach((id) => {
      const localTime = normalizeTimestamp(localMeta?.[type]?.[id]);
      const cloudTime = normalizeTimestamp(cloudMeta?.[type]?.[id]);
      const latest = timestampMs(cloudTime) > timestampMs(localTime) ? cloudTime : localTime;
      if (latest) rows[id] = latest;
    });
    return [type, rows];
  }));
}

function shouldApplyTombstone(deletedMeta = {}, type, id, activeUpdatedAt = "") {
  const deletedAt = timestampMs(stateObject(stateObject(deletedMeta)[type])[id]);
  const activeAt = timestampMs(activeUpdatedAt);
  return !(deletedAt && activeAt && activeAt > deletedAt);
}

function pruneTombstone(nextState, type, id) {
  if (!Array.isArray(nextState.deleted?.[type])) return;
  nextState.deleted[type] = nextState.deleted[type].filter((item) => item !== id);
  if (isPlainStateObject(nextState.deletedMeta?.[type])) delete nextState.deletedMeta[type][id];
}

function applyTombstones(nextState) {
  if (!isPlainStateObject(nextState)) nextState = {};
  nextState.entries = stateObject(nextState.entries);
  nextState.scores = stateArray(nextState.scores).filter(isPlainStateObject);
  nextState.reviewItems = stateArray(nextState.reviewItems).filter(isPlainStateObject);
  nextState.weekPlans = Object.fromEntries(Object.entries(stateObject(nextState.weekPlans)).map(([date, tasks]) => [date, stateArray(tasks).filter(isPlainStateObject)]));
  nextState.tasks = stateObject(nextState.tasks);
  const deletedSource = stateObject(nextState.deleted);
  const deletedMetaSource = stateObject(nextState.deletedMeta);
  nextState.deleted = Object.fromEntries(DELETED_TYPES.map((type) => [type, stateArray(deletedSource[type])]));
  nextState.deletedMeta = Object.fromEntries(DELETED_TYPES.map((type) => [type, stateObject(deletedMetaSource[type])]));
  const deleted = nextState.deleted;
  const deletedMeta = nextState.deletedMeta;
  stateArray(deleted.records).forEach((date) => {
    const entry = nextState.entries?.[date];
    if (entry && !shouldApplyTombstone(deletedMeta, "records", date, entry.updatedAt)) {
      pruneTombstone(nextState, "records", date);
      return;
    }
    delete nextState.entries[date];
  });
  if (stateArray(deleted.scores).length) {
    const ids = new Set(stateArray(deleted.scores));
    nextState.scores = nextState.scores.filter((score) => {
      if (!ids.has(score.id)) return true;
      if (shouldApplyTombstone(deletedMeta, "scores", score.id, score.updatedAt)) return false;
      pruneTombstone(nextState, "scores", score.id);
      return true;
    });
  }
  if (stateArray(deleted.reviews).length) {
    const ids = new Set(stateArray(deleted.reviews));
    nextState.reviewItems = nextState.reviewItems.filter((item) => {
      if (!ids.has(item.id)) return true;
      if (shouldApplyTombstone(deletedMeta, "reviews", item.id, item.updatedAt || item.completedAt)) return false;
      pruneTombstone(nextState, "reviews", item.id);
      return true;
    });
  }
  if (stateArray(deleted.tasks).length) {
    const ids = new Set(stateArray(deleted.tasks));
    Object.keys(nextState.weekPlans).forEach((date) => {
      nextState.weekPlans[date] = nextState.weekPlans[date].filter((task) => {
        if (!ids.has(task.id)) return true;
        if (shouldApplyTombstone(deletedMeta, "tasks", task.id, task.updatedAt || task.completedAt)) return false;
        pruneTombstone(nextState, "tasks", task.id);
        return true;
      });
    });
    const remainingIds = new Set(stateArray(nextState.deleted?.tasks));
    remainingIds.forEach((id) => delete nextState.tasks[id]);
  }
  return nextState;
}

function markDeleted(type, id) {
  if (!DELETED_TYPES.includes(type) || !id) return;
  const { deleted, deletedMeta } = ensureTombstoneContainers();
  if (id && !deleted[type].includes(id)) deleted[type].push(id);
  if (id) deletedMeta[type][id] = new Date().toISOString();
}

function unmarkDeleted(type, id) {
  if (!DELETED_TYPES.includes(type) || !id) return;
  const { deleted, deletedMeta } = ensureTombstoneContainers();
  deleted[type] = deleted[type].filter((item) => item !== id);
  delete deletedMeta[type][id];
}

function queueCloudSync() {
  ensureSyncContainer();
  if (!currentUser || !supabaseConfigured) {
    state.sync = {
      ...state.sync,
      status: state.sync?.cloudPaused ? "paused" : (currentUser ? "unconfigured" : "local"),
      pending: false
    };
    saveState({ skipCloud: true });
    return;
  }
  if (state.sync?.localImportPending) {
    state.sync = { ...state.sync, status: "pending", pending: true };
    saveState({ skipCloud: true });
    return;
  }
  if (state.sync?.cloudPaused) {
    state.sync = { ...state.sync, status: "paused", pending: false };
    saveState({ skipCloud: true });
    return;
  }
  if (navigator && navigator.onLine === false) {
    state.sync = { ...state.sync, status: "offline", pending: true };
    saveState({ skipCloud: true });
    return;
  }
  state.sync = { ...state.sync, status: "pending", pending: true };
  saveState({ skipCloud: true });
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncNow, 650);
}

async function syncNow(options = {}) {
  if (!currentUser || !supabaseConfigured) {
    const reason = currentUser && !supabaseConfigured ? "unconfigured" : "not-authenticated";
    if (!currentUser) state.user = null;
    state.sync = {
      ...state.sync,
      status: state.sync?.cloudPaused ? "paused" : (currentUser ? "unconfigured" : "local"),
      pending: false,
      lastError: reason
    };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    return { ok: false, reason, localSaved };
  }
  if (state.sync?.localImportPending && !options.force) {
    state.sync = { ...state.sync, status: "pending", pending: true };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    showToast("检测到旧版本地数据。请在账号面板选择导入云端或保留本机。");
    return { ok: false, reason: "local-import-pending", localSaved };
  }
  if (state.sync?.cloudPaused && !options.force) {
    state.sync = { ...state.sync, status: "paused", pending: false };
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    showToast("云端同步已暂停。若要写入云端，请在账号面板点击“导入云端”。");
    return { ok: false, reason: "cloud-paused", localSaved };
  }
  if (navigator && navigator.onLine === false) {
    state.sync = { ...state.sync, status: "offline", pending: true };
    const localSaved = saveState({ skipCloud: true });
    renderAuthPanel();
    return { ok: false, reason: "offline", localSaved };
  }
  try {
    state = enforceCleanStartState(state);
    state.sync = { ...state.sync, status: "syncing", lastError: "" };
    renderSyncStatus();
    const result = await saveCloudState(state, {
      force: Boolean(options.force),
      expectedUserId: currentUser?.id || ""
    });
    if (result?.skipped) {
      const reason = result.reason || "sync-skipped";
      if (reason === "not-authenticated") {
        currentUser = null;
        state.user = null;
      }
      state.sync = {
        ...state.sync,
        status: reason === "cloud-paused" ? "paused" : (reason === "local-import-pending" ? "pending" : "local"),
        pending: reason === "local-import-pending",
        lastError: reason
      };
      const localSaved = saveState({ skipCloud: true });
      renderSyncStatus();
      renderAuthPanel();
      return { ok: false, reason, localSaved };
    }
    state.sync = {
      status: "synced",
      lastSyncAt: result?.syncedAt || new Date().toISOString(),
      lastError: "",
      pending: false,
      localImportPending: false,
      cloudPaused: false
    };
    legacyImportPending = false;
    const localSaved = saveState({ skipCloud: true });
    renderSyncStatus();
    renderAuthPanel();
    return { ok: true, syncedAt: state.sync.lastSyncAt, localSaved };
  } catch (error) {
    const message = safeErrorMessage(error, "同步失败");
    state.sync = { ...state.sync, status: conflictSyncStatus(message), lastError: message, pending: true };
    const localSaved = saveState({ skipCloud: true });
    const syncError = friendlySyncError(message);
    setAuthResult("error", localSaved ? "同步失败" : "同步状态未写入本机缓存", localSaved
      ? syncError
      : `浏览器阻止写入本机缓存；同步错误状态未保存。原始错误：${syncError}`);
    renderSyncStatus();
    renderAuthPanel();
    return { ok: false, reason: "sync-error", error: message, localSaved };
  }
}

function conflictSyncStatus(message) {
  return /duplicate key|conflict|42P10/i.test(String(message || "")) ? "conflict" : "error";
}

function syncDisplayStatus(sync = state.sync) {
  const status = sync?.status;
  if (sync?.cloudPaused && !["pending", "syncing", "offline", "error", "conflict"].includes(status)) return "paused";
  return status;
}

function renderSyncStatus() {
  ensureSyncContainer();
  const presented = presentSyncStatus(state.sync, {
    configured: supabaseConfigured,
    signedIn: Boolean(currentUser)
  });
  const status = presented.key === "local" ? syncDisplayStatus() : presented.key;
  const label = presented.label;
  const syncedAt = state.sync?.lastSyncAt ? state.sync.lastSyncAt.slice(5, 16).replace("T", " ") : "";
  const errorSuffix = presented.key === "conflict" && state.sync?.lastError
    ? ` · ${shortSyncError(state.sync.lastError)}`
    : (presented.key === "synced" && syncedAt ? ` · ${syncedAt}` : "");
  setText("syncStatusText", `${label}${errorSuffix}`);
  const pill = document.getElementById("syncPill");
  if (pill) pill.dataset.status = presented.key || status || "local";
  setText("sideDataSave", syncedAt ? `同步 ${syncedAt}` : label);
  const authButton = document.getElementById("authOpenBtn");
  if (authButton) {
    const labelNode = authButton.querySelector("span");
    if (labelNode) labelNode.textContent = currentUser ? "账号" : "登录";
    authButton.title = currentUser ? `账号：${currentUser.email || "已登录"}` : "登录与云同步";
  }
}

function shortSyncError(message) {
  return safeScalarText(message, "", 200).split(":").slice(0, 2).join(":").slice(0, 42);
}

function friendlySyncError(message) {
  const text = safeScalarText(message, "未知错误", 500);
  if (text.includes("duplicate key")) return `${text}。本地有重复记录，请导出备份后再点同步；系统已保留本机数据。`;
  if (text.includes("no unique or exclusion constraint") || text.includes("42P10")) return `${text}。数据库主键还没更新，请重新执行 supabase/schema.sql 后再同步。`;
  if (text.includes("violates row-level security")) return `${text}。当前账号没有权限写入这条数据，请退出后重新登录。`;
  if (text.includes("Could not find") || text.includes("column")) return `${text}。数据库 schema 可能不是最新，请重新执行 supabase/schema.sql。`;
  if (text.includes("invalid input syntax") || text.includes("date/time field")) return `${text}。某条本地记录日期格式不合法，请导出备份后修正。`;
  return text;
}

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function planTodayISO() {
  return todayISO() < PLAN_START_DATE ? PLAN_START_DATE : todayISO();
}

function setDefaultDates() {
  const today = planTodayISO();
  document.getElementById("entryDate").value = today;
  document.getElementById("scoreDate").value = today;
}

function uid(prefix = "id") {
  return `${prefix}-${window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function parseDate(value) {
  const text = sanitizeDateKey(value) || PLAN_START_DATE;
  return new Date(`${text}T00:00:00`);
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentPhase(dateValue = planTodayISO()) {
  const current = parseDate(dateValue);
  return phases.find((phase) => current >= parseDate(phase.start) && current <= parseDate(phase.end)) || phases[0];
}

function bindNavigation() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".nav-item[data-view], [data-jump]");
    if (!button) return;
    const view = button.dataset.view || button.dataset.jump;
    if (!isValidView(view)) return;
    event.preventDefault();
    setRoute(view);
  }, true);

  window.addEventListener("hashchange", () => {
    normalizeHashRoute({ moveFocus: true });
  });

  window.addEventListener("pageshow", () => {
    normalizeHashRoute();
  });
  document.documentElement.dataset.navBound = "1";
}

function bindDensityControls() {
  document.querySelectorAll(DENSITY_BUTTON_SELECTOR).forEach((button) => {
    button.addEventListener("click", () => {
      ensureSettingsContainer();
      state.settings.density = button.dataset.density;
      const saved = saveState();
      applyDensityMode();
      setLocalSaveResult(saved, "信息密度已切换", `当前为：${densityLabel(state.settings.density)}。`, "信息密度未写入本机缓存");
    });
  });
  applyDensityMode();
}

function densityLabel(value) {
  return densityModeMeta(value).label;
}

function applyDensityMode() {
  ensureSettingsContainer();
  const density = normalizeDensityMode(state.settings.density, "balanced");
  state.settings.density = density;
  applyDensityModeToDocument(density);
}

function initRoute() {
  normalizeHashRoute();
}

function setRoute(viewId) {
  if (!isValidView(viewId)) return false;
  switchView(viewId, { moveFocus: true });
  if (window.location.hash !== `#${viewId}`) {
    window.history.replaceState(null, "", `#${viewId}`);
  }
  scrollToTop();
  return true;
}

function isValidView(viewId) {
  return isKnownViewId(viewId) && document.getElementById(viewId)?.classList.contains("view");
}

function currentHashView() {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  } catch {
    return window.location.hash.replace(/^#/, "").trim();
  }
}

function normalizeHashRoute(options = {}) {
  const view = currentHashView();
  const nextView = isValidView(view) ? view : DEFAULT_VIEW_ID;
  switchView(nextView, options);
  if (window.location.hash !== `#${nextView}`) {
    window.history.replaceState(null, "", `#${nextView}`);
  }
  scrollToTop();
  return nextView;
}

function activeViewId() {
  return document.querySelector(".view.active")?.id || "";
}

function bindForms() {
  document.getElementById("entryDate").addEventListener("change", loadEntryForm);
  document.getElementById("entryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    ensureLearningContainers();
    const date = document.getElementById("entryDate").value || planTodayISO();
    const entry = readEntryFormValues();
    if (!validateEntryForm(entry)) return;
    unmarkDeleted("records", date);
    state.entries[date] = {
      math: entry.math,
      cs408: entry.cs408,
      english: entry.english,
      politics: entry.politics,
      project: entry.project,
      quality: entry.quality,
      mathProblems: entry.mathProblems,
      csProblems: entry.csProblems,
      reading: entry.reading,
      newMistakes: entry.newMistakes,
      fixedMistakes: entry.fixedMistakes,
      sleepHours: sanitizeSleepHours(entry.sleepHours),
      fatigue: statedFatigue([document.getElementById("fatigueScore")?.value]),
      loadTier: sanitizeLoadTier(document.getElementById("loadTier")?.value, ""),
      nextTask: document.getElementById("nextTask").value.trim(),
      note: encodeLoadNote(document.getElementById("note").value.trim(), {
        loadTier: sanitizeLoadTier(document.getElementById("loadTier")?.value, ""),
        sleepHours: sanitizeSleepHours(entry.sleepHours),
        fatigue: statedFatigue([document.getElementById("fatigueScore")?.value])
      }),
      updatedAt: new Date().toISOString()
    };
    const saved = saveState();
    clearEntryValidation();
    renderAll();
    setLocalSaveResult(saved, "今日记录已保存", "进度已更新。", "今日记录未写入本机缓存");
  });

  document.getElementById("scoreForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const scores = scoreRows();
    const score = {
      id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      date: document.getElementById("scoreDate").value || planTodayISO(),
      name: document.getElementById("scoreName").value.trim() || "未命名模考",
      politics: readNumber("scorePol"),
      english: readNumber("scoreEng"),
      math: readNumber("scoreMath"),
      cs408: readNumber("scoreCs"),
      note: document.getElementById("scoreNote")?.value.trim() || ""
    };
    score.total = score.politics + score.english + score.math + score.cs408;
    if (!validateScoreForm(score)) return;
    const editingId = event.target.dataset.editingScore;
    if (editingId) {
      score.id = editingId;
      score.updatedAt = new Date().toISOString();
      unmarkDeleted("scores", editingId);
      state.scores = scores.map((item) => item.id === editingId ? score : item);
      delete event.target.dataset.editingScore;
    } else {
      score.updatedAt = new Date().toISOString();
      unmarkDeleted("scores", score.id);
      scores.push(score);
    }
    state.scores.sort((a, b) => a.date.localeCompare(b.date));
    const saved = saveState();
    event.target.reset();
    clearScoreValidation();
    document.getElementById("scoreDate").value = planTodayISO();
    renderAll();
    setLocalSaveResult(saved, "模考成绩已保存", "成绩曲线已更新。", "模考成绩未写入本机缓存");
  });

  document.getElementById("regenTasks").addEventListener("click", () => renderTasks());
  document.getElementById("generatePlanBtn")?.addEventListener("click", () => {
    const result = regenerateTodayPlan();
    if (!result) return;
    setLocalSaveResult(result?.saved !== false, "今日计划已重新生成", result.message, "今日计划未写入本机缓存");
  });

  document.querySelectorAll("#scorePol, #scoreEng, #scoreMath, #scoreCs").forEach((input) => {
    input.addEventListener("input", clearScoreValidation);
  });

  document.querySelectorAll(entryFieldSelector()).forEach((input) => {
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  });
}

function readEntryFormValues() {
  return {
    math: readOptionalEntryNumber("mathMin", 0),
    cs408: readOptionalEntryNumber("csMin", 0),
    english: readOptionalEntryNumber("engMin", 0),
    politics: readOptionalEntryNumber("polMin", 0),
    project: readOptionalEntryNumber("projectMin", 0),
    quality: readOptionalEntryNumber("qualityScore", 3),
    mathProblems: readOptionalEntryNumber("mathProblems", 0),
    csProblems: readOptionalEntryNumber("csProblems", 0),
    reading: readOptionalEntryNumber("readingCount", 0),
    newMistakes: readOptionalEntryNumber("newMistakes", 0),
    fixedMistakes: readOptionalEntryNumber("fixedMistakes", 0),
    sleepHours: readOptionalEntryNumber("sleepHours", 0),
    fatigue: readOptionalEntryNumber("fatigueScore", null)
  };
}

function readOptionalEntryNumber(id, fallback) {
  const raw = document.getElementById(id)?.value.trim() || "";
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function validateEntryForm(entry) {
  const fields = entryFieldRules(entry).map((field) => ({
    ...field,
    input: document.getElementById(field.id),
    valid: isValidEntryValue(field.value, field.min, field.max, { optional: field.optional, decimal: field.decimal })
  }));
  const invalidField = fields.find((field) => !field.valid);
  fields.forEach((field) => field.input?.setAttribute("aria-invalid", String(!field.valid)));
  if (!invalidField) return true;
  invalidField.input?.focus();
  showToast("今日记录的时长、题量和错题数需填写为非负整数，质量评分为 1-5 的整数。");
  return false;
}

function entryFieldRules(entry) {
  return [
    { id: "mathMin", value: entry.math, min: 0 },
    { id: "csMin", value: entry.cs408, min: 0 },
    { id: "engMin", value: entry.english, min: 0 },
    { id: "polMin", value: entry.politics, min: 0 },
    { id: "projectMin", value: entry.project, min: 0 },
    { id: "qualityScore", value: entry.quality, min: 1, max: 5 },
    { id: "mathProblems", value: entry.mathProblems, min: 0 },
    { id: "csProblems", value: entry.csProblems, min: 0 },
    { id: "readingCount", value: entry.reading, min: 0 },
    { id: "newMistakes", value: entry.newMistakes, min: 0 },
    { id: "fixedMistakes", value: entry.fixedMistakes, min: 0 },
    { id: "sleepHours", value: entry.sleepHours, min: 0, max: 14, decimal: true },
    { id: "fatigueScore", value: entry.fatigue, min: 1, max: 5, optional: true }
  ];
}

function isValidEntryValue(value, min, max = Infinity, options = {}) {
  if (options.optional && (value == null || value === "")) return true;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return false;
  if (options.decimal) return Math.round(value * 10) === value * 10;
  return Number.isInteger(value);
}

function entryFieldSelector() {
  return "#mathMin, #csMin, #engMin, #polMin, #projectMin, #qualityScore, #mathProblems, #csProblems, #readingCount, #newMistakes, #fixedMistakes, #sleepHours, #fatigueScore";
}

function clearEntryValidation() {
  document.querySelectorAll(entryFieldSelector()).forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
}

function validateScoreForm(score) {
  const fields = scoreFieldRules(score).map((field) => ({
    ...field,
    input: document.getElementById(field.id),
    valid: isValidScoreValue(field.value, field.max)
  }));
  const invalidField = fields.find((field) => !field.valid);
  const hasScore = fields.some((field) => field.value > 0);
  fields.forEach((field) => {
    field.input?.setAttribute("aria-invalid", String(invalidField ? !field.valid : !hasScore));
  });
  if (!invalidField && hasScore) return true;
  (invalidField?.input || fields[0]?.input)?.focus();
  if (invalidField) {
    showToast("模考分数需填写为整数：政治/英语 0-100，数学/408 0-150。");
    return false;
  }
  showToast("请至少填写一科模考分数。");
  return false;
}

function scoreFieldRules(score) {
  return [
    { id: "scorePol", value: score.politics, max: 100 },
    { id: "scoreEng", value: score.english, max: 100 },
    { id: "scoreMath", value: score.math, max: 150 },
    { id: "scoreCs", value: score.cs408, max: 150 }
  ];
}

function isValidScoreValue(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function clearScoreValidation() {
  document.querySelectorAll("#scorePol, #scoreEng, #scoreMath, #scoreCs").forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
}

function bindSyllabusTabs() {
  document.querySelectorAll(".seg").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".seg").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      renderSyllabus(button.dataset.syllabus);
    });
  });
  document.getElementById("syllabusSearch")?.addEventListener("input", () => {
    renderSyllabus(document.querySelector(".seg.active")?.dataset.syllabus || "math");
  });
}

function bindImportExport() {
  document.getElementById("exportBtn").addEventListener("click", () => {
    downloadStateBackup("dashboard");
  });

  document.getElementById("importFile").addEventListener("change", (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!isLikelyJsonImportFile(file)) {
      input.value = "";
      setAuthResult("error", "导入失败", "请选择 .json 备份文件。");
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      input.value = "";
      setAuthResult("error", "导入失败", "备份文件超过 10MB，请确认是否选错文件。");
      return;
    }
    setImportBusy(true);
    setAuthResult("pending", "正在导入备份", "正在读取并验证 JSON 备份。");
    const finishImport = () => {
      input.value = "";
      setImportBusy(false);
    };
    const reader = new FileReader();
    reader.onload = () => {
      let imported;
      try {
        imported = JSON.parse(reader.result);
      } catch {
        setAuthResult("error", "导入失败", "不是有效的 JSON 数据。");
        finishImport();
        return;
      }
      try {
        const importPayload = extractImportStatePayload(imported);
        if (!importPayload) {
          setAuthResult("error", "导入失败", "请选择本应用导出的 JSON 备份。");
          return;
        }
        const migratedState = migrateState(importPayload);
        const nextState = protectImportedSession(migratedState);
        if (!window.confirm(importConfirmationMessage(nextState))) {
          setAuthResult("idle", "导入已取消", "当前数据未改变。");
          return;
        }
        const snapshot = createLocalSnapshot("before-import");
        state = nextState;
        state.snapshots = [snapshot, ...snapshotRows(state.snapshots)].slice(0, 5);
        const saved = saveState();
        renderAll();
        renderSnapshotPanel();
        setLocalSaveResult(saved, "导入完成", "已保留导入前快照，可在账号面板恢复。", "导入未写入本机缓存");
      } catch {
        setAuthResult("error", "导入失败", "处理备份时出错，请导出当前数据后重试。");
      } finally {
        finishImport();
      }
    };
    reader.onerror = () => {
      setAuthResult("error", "导入失败", "无法读取这个文件。");
      finishImport();
    };
    try {
      reader.readAsText(file);
    } catch {
      setAuthResult("error", "导入失败", "无法读取这个文件。");
      finishImport();
    }
  });
}

function setImportBusy(isBusy) {
  const input = document.getElementById("importFile");
  const label = input?.closest(".import-label");
  if (input) {
    input.disabled = isBusy;
    input.setAttribute("aria-busy", String(isBusy));
  }
  label?.setAttribute("aria-busy", String(isBusy));
  label?.setAttribute("aria-disabled", String(isBusy));
}

function isLikelyJsonImportFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return name.endsWith(".json") || type === "application/json" || type === "text/json" || type.endsWith("+json");
}

function currentSessionUser(previousUser = null, user = currentUser) {
  if (!isPlainStateObject(user)) return null;
  const previous = stateObject(previousUser);
  const id = sanitizeUserText(user.id, 160);
  const email = sanitizeUserText(user.email, 254) || sanitizeUserText(previous.email, 254);
  if (!id && !email) return null;
  return {
    id,
    email
  };
}

function syncStateAfterJsonImport(previousSync = {}, user = currentUser, cloudReady = supabaseConfigured) {
  const cloudPaused = sanitizeBoolean(previousSync?.cloudPaused);
  const canSync = Boolean(user && cloudReady && !cloudPaused);
  return {
    status: cloudPaused ? "paused" : (user && !cloudReady ? "unconfigured" : canSync ? "pending" : "local"),
    lastSyncAt: "",
    lastError: "",
    pending: canSync,
    localImportPending: false,
    cloudPaused
  };
}

function protectImportedSession(nextState, previousState = state, user = currentUser, cloudReady = supabaseConfigured) {
  return {
    ...nextState,
    sync: syncStateAfterJsonImport(previousState?.sync, user, cloudReady),
    user: currentSessionUser(previousState?.user, user)
  };
}

function isPlainImportRecord(payload) {
  return Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
}

function hasImportStateKeys(payload) {
  if (!isPlainImportRecord(payload)) return false;
  const stateKeys = new Set([
    "entries",
    "scores",
    "topics",
    "topicEvidence",
    "tasks",
    "weekPlans",
    "reviewItems",
    "resources",
    "project",
    "settings",
    "customTasks",
    "deleted",
    "deletedMeta",
    "deleted_meta",
    "cleanStartArchive",
    "snapshots"
  ]);
  return Object.keys(payload).some((key) => stateKeys.has(key));
}

function extractImportStatePayload(payload) {
  if (!isPlainImportRecord(payload)) return null;
  if (hasImportStateKeys(payload)) return payload;
  const nested = isPlainImportRecord(payload.payload) ? payload.payload : payload.state;
  return hasImportStateKeys(nested) ? nested : null;
}

function importConfirmationMessage(nextState) {
  const counts = importStateCounts(nextState);
  return [
    "确认导入这份备份？当前本机数据会先保存为快照。",
    `记录 ${counts.entries} 天，模考 ${counts.scores} 条，周计划任务 ${counts.weekTasks} 项。`,
    `复盘 ${counts.reviews} 项，自定义任务 ${counts.customTasks} 项，资料进度 ${counts.resources} 项。`
  ].join("\n");
}

function importStateCounts(nextState) {
  const source = stateObject(nextState);
  const weekTasks = Object.values(stateObject(source.weekPlans)).reduce(
    (sum, tasks) => sum + stateArray(tasks).filter(isPlainStateObject).length,
    0
  );
  return {
    entries: Object.keys(stateObject(source.entries)).length,
    scores: stateArray(source.scores).filter(isPlainStateObject).length,
    weekTasks,
    reviews: stateArray(source.reviewItems).filter(isPlainStateObject).length,
    customTasks: stateArray(source.customTasks).filter(isPlainStateObject).length,
    resources: Object.keys(stateObject(source.resources)).length
  };
}

function downloadStateBackup(label = "dashboard") {
  try {
    exportStateJson(label);
  } catch (error) {
    setAuthResult("error", "备份导出失败", `本次未更新备份状态。请检查浏览器下载权限后重试：${safeErrorMessage(error, "浏览器下载失败")}`);
    return false;
  }
  ensureSettingsContainer();
  state.settings.lastExportDate = todayISO();
  const saved = saveState();
  renderStorageStatus();
  setLocalSaveResult(saved, "备份已导出", "JSON 备份已下载，备份状态已更新。", "备份状态未写入本机缓存");
  return true;
}

function exportStateJson(label = "dashboard") {
  const blob = new Blob([JSON.stringify(exportStatePayload(state), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const href = URL.createObjectURL(blob);
  link.href = href;
  link.download = `pku-swm-${label}-${todayISO()}.json`;
  try {
    link.click();
  } finally {
    URL.revokeObjectURL(href);
  }
}

function snapshotStatePayload(sourceState = state) {
  const source = stateObject(sourceState);
  const payload = {
    schemaVersion: source.schemaVersion,
    entries: source.entries,
    scores: source.scores,
    topics: source.topics,
    topicEvidence: source.topicEvidence,
    tasks: source.tasks,
    weekPlans: source.weekPlans,
    project: source.project,
    resources: source.resources,
    settings: source.settings,
    customTasks: source.customTasks,
    reviewItems: source.reviewItems,
    deleted: source.deleted,
    deletedMeta: source.deletedMeta,
    cleanStartArchive: source.cleanStartArchive
  };
  return cloneJson(payload);
}

function sanitizeExportPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return sanitizeSnapshotPayload(payload);
}

function sanitizeExportSnapshots(snapshots) {
  return sanitizeSnapshots(snapshots).map((snapshot) => ({
    ...snapshot,
    payload: sanitizeExportPayload(snapshot.payload)
  }));
}

function exportStatePayload(sourceState = state) {
  const source = stateObject(sourceState);
  const payload = sanitizeExportPayload(snapshotStatePayload(source));
  payload.snapshots = sanitizeExportSnapshots(source.snapshots || []);
  return payload;
}

function createLocalSnapshot(reason = "manual") {
  const snapshot = {
    reason,
    createdAt: new Date().toISOString(),
    payload: snapshotStatePayload(state)
  };
  state.snapshots = [snapshot, ...snapshotRows(state.snapshots)].slice(0, 5);
  if (currentUser && supabaseConfigured && !state.sync?.cloudPaused && !state.sync?.localImportPending && !legacyImportPending) {
    saveCloudSnapshot(state, reason).catch(() => {});
  }
  return snapshot;
}

function bindQuickEntry() {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPreset(button.dataset.preset);
      clearEntryValidation();
    });
  });

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, amount] = button.dataset.add.split(":");
      const current = Number(document.getElementById(id).value) || 0;
      document.getElementById(id).value = current + Number(amount);
      document.getElementById(id)?.removeAttribute("aria-invalid");
    });
  });
}

function bindRecords() {
  const monthInput = document.getElementById("recordMonth");
  if (monthInput) {
    monthInput.value = planTodayISO().slice(0, 7);
    monthInput.addEventListener("change", renderRecords);
  }
  document.getElementById("clearMonthFilter")?.addEventListener("click", () => {
    monthInput.value = "";
    renderRecords();
  });
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportRecordsCsv);
}

function bindSettings() {
  document.getElementById("settingsForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    ensureSettingsContainer();
    const numericSettings = readSettingsNumericValues();
    if (!validateSettingsNumericForm(numericSettings)) return;
    const reviewDays = parseReviewDays(document.getElementById("settingReviewDays").value);
    if (!validateReviewDaysSetting(reviewDays)) return;
    const nextSettings = {
      ...state.settings,
      weekdayMinutes: numericSettings.weekdayMinutes,
      weekendMinutes: numericSettings.weekendMinutes,
      taskCount: numericSettings.taskCount,
      coreRatio: numericSettings.coreRatio,
      targetExamDate: document.getElementById("settingTargetExamDate")?.value || DEFAULT_EXAM_DATE,
      reviewDays,
      planControls: normalizePlanControls({
        planIntensity: document.getElementById("settingPlanIntensity")?.value,
        focusSubject: document.getElementById("settingFocusSubject")?.value,
        experienceTrack: document.getElementById("settingExperienceTrack")?.value,
        maxNewTopics: numericSettings.maxNewTopics,
        reviewLoad: numericSettings.reviewLoad,
        rollingWindowDays: numericSettings.rollingWindowDays,
        enabledSubjects: Array.from(document.querySelectorAll("#settingEnabledSubjects input:checked")).map((input) => input.value),
      }),
      notificationsEnabled: Boolean(document.getElementById("settingNotifications")?.checked)
    };
    state.settings = nextSettings;
    const saved = saveState();
    renderAll();
    setLocalSaveResult(saved, "设置已保存", "新的计划参数已应用。", "设置未写入本机缓存");
    if (nextSettings.notificationsEnabled && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  });

  document.getElementById("customTaskForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    ensureSettingsContainer();
    const subject = document.getElementById("customSubject").value.trim();
    const text = document.getElementById("customText").value.trim();
    const minutes = readNumber("customMinutes");
    if (!validateCustomTaskForm({ subject, text, minutes })) return;
    const updatedAt = new Date().toISOString();
    customTaskRows().push({ id: String(Date.now()), subject, text, minutes, updatedAt });
    state.settings.customTasksUpdatedAt = updatedAt;
    const saved = saveState();
    event.target.reset();
    clearCustomTaskValidation();
    renderSettings();
    setLocalSaveResult(saved, "自定义任务已添加", "任务模板已加入设置页列表。", "自定义任务未写入本机缓存");
  });

  document.querySelectorAll("#customSubject, #customText, #customMinutes").forEach((input) => {
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  });

  document.querySelectorAll(settingsNumericFieldSelector()).forEach((input) => {
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  });

  document.getElementById("settingReviewDays")?.addEventListener("input", () => {
    document.getElementById("settingReviewDays")?.removeAttribute("aria-invalid");
  });
}

function readSettingsNumericValues() {
  return {
    weekdayMinutes: readRequiredIntegerSetting("settingWeekdayMinutes"),
    weekendMinutes: readRequiredIntegerSetting("settingWeekendMinutes"),
    taskCount: readRequiredIntegerSetting("settingTaskCount"),
    coreRatio: readRequiredIntegerSetting("settingCoreRatio"),
    maxNewTopics: readRequiredIntegerSetting("settingMaxNewTopics"),
    reviewLoad: readRequiredIntegerSetting("settingReviewLoad"),
    rollingWindowDays: readRequiredIntegerSetting("settingRollingWindowDays")
  };
}

function readRequiredIntegerSetting(id) {
  const raw = document.getElementById(id)?.value.trim() || "";
  if (!raw) return Number.NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function validateSettingsNumericForm(values) {
  const fields = settingsNumericFieldRules(values).map((field) => ({
    ...field,
    input: document.getElementById(field.id),
    valid: isValidSettingNumber(field.value, field.min, field.max)
  }));
  const invalidField = fields.find((field) => !field.valid);
  fields.forEach((field) => field.input?.setAttribute("aria-invalid", String(!field.valid)));
  if (!invalidField) return true;
  invalidField.input?.focus();
  showToast("设置数字需填写为整数，并保持在字段标注范围内。");
  return false;
}

function settingsNumericFieldRules(values) {
  return [
    { id: "settingWeekdayMinutes", value: values.weekdayMinutes, min: 90, max: 600 },
    { id: "settingWeekendMinutes", value: values.weekendMinutes, min: 120, max: 720 },
    { id: "settingTaskCount", value: values.taskCount, min: 3, max: 4 },
    { id: "settingCoreRatio", value: values.coreRatio, min: 55, max: 85 },
    { id: "settingMaxNewTopics", value: values.maxNewTopics, min: 0, max: 4 },
    { id: "settingReviewLoad", value: values.reviewLoad, min: 15, max: 60 },
    { id: "settingRollingWindowDays", value: values.rollingWindowDays, min: 7, max: 60 }
  ];
}

function isValidSettingNumber(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function settingsNumericFieldSelector() {
  return "#settingWeekdayMinutes, #settingWeekendMinutes, #settingTaskCount, #settingCoreRatio, #settingMaxNewTopics, #settingReviewLoad, #settingRollingWindowDays";
}

function validateReviewDaysSetting(reviewDays) {
  const input = document.getElementById("settingReviewDays");
  const valid = Array.isArray(reviewDays) && reviewDays.length > 0;
  input?.setAttribute("aria-invalid", String(!valid));
  if (valid) return true;
  input?.focus();
  showToast("复盘间隔请填写 1-365 的整数，用英文逗号分隔。");
  return false;
}

function validateCustomTaskForm({ subject, text, minutes }) {
  const fields = [
    [document.getElementById("customSubject"), Boolean(subject)],
    [document.getElementById("customText"), Boolean(text)],
    [document.getElementById("customMinutes"), isValidCustomTaskMinutes(minutes)]
  ];
  fields.forEach(([input, valid]) => input?.setAttribute("aria-invalid", String(!valid)));
  const firstInvalid = fields.find(([, valid]) => !valid)?.[0];
  if (!firstInvalid) return true;
  firstInvalid.focus();
  showToast("请补全自定义任务的科目、任务，并把分钟数填写为 10-240 的整数。");
  return false;
}

function isValidCustomTaskMinutes(minutes) {
  return Number.isInteger(minutes) && minutes >= 10 && minutes <= 240;
}

function clearCustomTaskValidation() {
  document.querySelectorAll("#customSubject, #customText, #customMinutes").forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
}

function bindAuth() {
  document.getElementById("authForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (passwordRecoveryPending) updatePasswordFromRecovery();
    else authAction("login");
  });
  document.getElementById("authOpenBtn")?.addEventListener("click", () => {
    openAuthDialog();
  });
  document.getElementById("authCloseBtn")?.addEventListener("click", () => {
    closeAuthDialog();
  });
  document.getElementById("signInBtn")?.addEventListener("click", () => authAction("login"));
  document.getElementById("signUpBtn")?.addEventListener("click", () => authAction("signup"));
  document.getElementById("resetPasswordBtn")?.addEventListener("click", requestPasswordReset);
  document.getElementById("cancelPasswordRecoveryBtn")?.addEventListener("click", cancelPasswordRecovery);
  document.getElementById("signOutBtn")?.addEventListener("click", signOutAction);
  document.getElementById("syncDialogBtn")?.addEventListener("click", manualSyncNow);
  document.getElementById("syncNowBtn")?.addEventListener("click", manualSyncNow);
  document.getElementById("downloadBackupBtn")?.addEventListener("click", () => downloadStateBackup("manual-backup"));
  document.getElementById("pushLocalBtn")?.addEventListener("click", pushLocalToCloud);
  document.getElementById("keepLocalBtn")?.addEventListener("click", () => keepLocalOnly(document.getElementById("authDialog")));
  document.getElementById("resetLocalBtn")?.addEventListener("click", resetLocalData);
  document.querySelectorAll("#authEmail, #authPassword").forEach((input) => {
    input.addEventListener("input", clearAuthValidation);
  });
  bindPasswordVisibility(hydrateIcons);
  document.documentElement.dataset.authBound = "1";
}

function openAuthDialog(dialog = document.getElementById("authDialog")) {
  renderAuthPanel();
  if (dialog && !dialog.open) dialog.showModal();
  focusAuthPanel(currentUser, passwordRecoveryPending);
}

function closeAuthDialog(dialog = document.getElementById("authDialog")) {
  if (dialog?.open) dialog.close();
  document.getElementById("authOpenBtn")?.focus();
}

async function signOutAction() {
  try {
    authRequestInFlight = true;
    setAuthBusy(true);
    setAuthResult("pending", "正在退出", "正在断开云端会话，本机数据会保留。");
    await signOut();
    const saved = clearLocalSessionState("");
    renderAll();
    setLocalSaveResult(saved, "已退出账号", "当前数据已保留在本机。", "退出状态未写入本机缓存");
  } catch (error) {
    setAuthResult("error", "退出失败", friendlyAuthError(error));
  } finally {
    authRequestInFlight = false;
    setAuthBusy(false);
    renderAuthPanel();
  }
}

function clearLocalSessionState(lastError = "not-authenticated") {
  currentUser = null;
  state.user = null;
  state.sync = {
    status: "local",
    lastSyncAt: "",
    lastError,
    pending: false,
    localImportPending: false,
    cloudPaused: false
  };
  legacyImportPending = false;
  const saved = saveState({ skipCloud: true });
  renderSyncStatus();
  renderAuthPanel();
  return saved;
}

async function manualSyncNow() {
  try {
    authRequestInFlight = true;
    setAuthBusy(true);
    setAuthResult("pending", "正在同步", "先拉取云端更新，再合并并写回本机数据。");
    const pullResult = await pullCloudState();
    if (!pullResult?.ok) {
      if (pullResult?.reason === "cloud-paused") {
        setAuthResult("pending", "云端同步暂停", "当前保留本机数据。若要恢复云端同步，请点击“导入云端”。");
        return;
      }
      if (pullResult?.reason === "local-import-pending") {
        setAuthResult("pending", "等待迁移选择", "检测到旧版本地数据。请先下载备份，再选择“导入云端”或“保留本机”。");
        return;
      }
      if (pullResult?.reason === "not-authenticated") {
        setAuthResult("error", "未登录", "请先登录账号，再同步到云端。");
        return;
      }
      if (pullResult?.reason === "unconfigured") {
        setAuthResult("error", "云端未配置", "请先配置 Supabase URL 和 publishable key。");
        return;
      }
      setAuthResult("error", "拉取云端失败", friendlySyncError(pullResult?.error || state.sync?.lastError || "请检查网络后重试。"));
      return;
    }
    const result = await syncNow();
    renderAuthPanel();
    if (result?.ok) {
      const syncedAt = state.sync?.lastSyncAt ? state.sync.lastSyncAt.slice(5, 16).replace("T", " ") : "刚刚";
      setLocalSaveResult(result.localSaved !== false, "同步完成", `本机数据已写入云端。最近同步：${syncedAt}`, "同步状态未写入本机缓存");
      return;
    }
    if (result?.localSaved === false && result?.reason !== "sync-error") {
      setLocalSaveResult(false, "同步状态已保存", "同步状态已写入本机缓存。", "同步状态未写入本机缓存");
      return;
    }
    if (result?.reason === "cloud-paused") {
      setAuthResult("pending", "云端同步暂停", "当前保留本机数据。若要恢复云端同步，请点击“导入云端”。");
      return;
    }
    if (result?.reason === "local-import-pending") {
      setAuthResult("pending", "等待迁移选择", "检测到旧版本地数据。请先下载备份，再选择“导入云端”或“保留本机”。");
      return;
    }
    if (result?.reason === "offline") {
      setAuthResult("error", "当前离线", "网络恢复后会继续同步，本机数据已保留。");
      return;
    }
    if (result?.reason === "unconfigured") {
      setAuthResult("error", "云端未配置", "请先配置 Supabase URL 和 publishable key。");
      return;
    }
    if (result?.reason === "not-authenticated") {
      setAuthResult("error", "未登录", "请先登录账号，再同步到云端。");
      return;
    }
    if (result?.reason !== "sync-error") {
      setAuthResult("error", "同步未完成", friendlySyncError(result?.error || state.sync?.lastError || result?.reason || "未知错误"));
    }
  } finally {
    authRequestInFlight = false;
    setAuthBusy(false);
    renderAuthPanel();
  }
}

async function authAction(mode) {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const password = document.getElementById("authPassword")?.value || "";
  const authValidation = validateAuthForm({ email, password });
  if (!authValidation.valid) {
    setAuthResult("error", authValidation.title, authValidation.message);
    return;
  }
  clearAuthValidation();
  if (!supabaseConfigured) {
    setAuthResult("error", "云端未配置", "Vercel 还没有配置 Supabase URL 或 publishable key。");
    return;
  }
  try {
    authRequestInFlight = true;
    setAuthBusy(true);
    setAuthResult("pending", mode === "signup" ? "正在注册" : "正在登录", "正在连接 Supabase Auth，请稍等。");
    const result = mode === "signup" ? await signUpWithEmail(email, password) : await signInWithEmail(email, password);
    if (mode === "signup" && result?.needsEmailConfirmation) {
      clearLocalSessionState("email-confirmation-required");
      setAuthResult("pending", "注册已提交，等待邮箱确认", "请打开确认邮件；确认后回到这里点击“登录并同步”。当前本机数据不会丢。");
      return;
    }
    currentUser = result?.user || result || null;
    if (currentUser) {
      bindCloudAuthListener();
      state.user = { id: currentUser.id, email: currentUser.email || email };
      const pullResult = await pullCloudState();
      if (!pullResult?.ok) {
        renderAll();
        renderAuthPanel();
        if (pullResult?.reason === "cloud-paused") {
          setAuthResult("pending", "已登录，云端同步暂停", "当前保留本机数据。若要恢复云端同步，请在账号面板点击“导入云端”。");
          showToast("已登录，云端同步仍保持暂停。");
          return;
        }
        if (pullResult?.reason === "local-import-pending") {
          setAuthResult("pending", "已登录，等待迁移选择", "检测到旧版本地数据。请先下载备份，再选择“导入云端”或“保留本机”。");
          showToast("已登录，请在账号面板选择本地数据迁移方式。");
          return;
        }
        const pullMessage = pullResult?.error || state.sync?.lastError || "拉取云端失败";
        setAuthResult("error", `${mode === "signup" ? "注册成功，但拉取云端失败" : "登录成功，但拉取云端失败"}`, friendlySyncError(pullMessage));
        showToast("账号已登录，但本次未自动写入云端。请确认账号面板里的错误后再手动同步。");
        return;
      }
      if (pullResult.localSaved === false) {
        renderAll();
        renderAuthPanel();
        setLocalSaveResult(false, "云端拉取完成", "云端数据已写入本机缓存。", "云端拉取未写入本机缓存");
        return;
      }
      const syncResult = await syncNow();
      renderAll();
      renderAuthPanel();
      if (!syncResult?.ok) {
        if (syncResult?.reason === "cloud-paused") {
          setAuthResult("pending", "已登录，云端同步暂停", "当前保留本机数据。若要恢复云端同步，请在账号面板点击“导入云端”。");
          showToast("已登录，云端同步仍保持暂停。");
          return;
        }
        if (syncResult?.reason === "local-import-pending") {
          setAuthResult("pending", "已登录，等待迁移选择", "检测到旧版本地数据。请先下载备份，再选择“导入云端”或“保留本机”。");
          showToast("已登录，请在账号面板选择本地数据迁移方式。");
          return;
        }
        const message = syncResult?.error || state.sync?.lastError || "同步未完成";
        setAuthResult("error", `${mode === "signup" ? "注册成功，但同步失败" : "登录成功，但同步失败"}`, friendlySyncError(message));
        showToast("账号已登录，但云同步未完成。请查看账号面板里的错误详情。");
        return;
      }
      const localSaved = syncResult.localSaved !== false;
      setLocalSaveResult(localSaved, mode === "signup" ? "注册成功" : "登录成功", `当前账号：${currentUser.email || email}。数据已开启云同步。`, "登录状态未写入本机缓存");
      if (localSaved) showToast(mode === "signup" ? "注册成功，已登录并开启云同步。" : "登录成功，数据已同步。");
      return;
    }
    clearLocalSessionState(result?.needsEmailConfirmation ? "email-confirmation-required" : "not-authenticated");
    setAuthResult("pending", "注册已提交", result?.needsEmailConfirmation
      ? "请先打开邮箱确认链接，再回到这里登录。"
      : "如未自动登录，请检查邮箱确认后再登录。");
  } catch (error) {
    setAuthResult("error", `${mode === "signup" ? "注册" : "登录"}失败`, friendlyAuthError(error));
  } finally {
    authRequestInFlight = false;
    setAuthBusy(false);
  }
}

async function requestPasswordReset() {
  const email = document.getElementById("authEmail")?.value.trim() || "";
  const emailInput = document.getElementById("authEmail");
  const emailValid = isLikelyEmail(email);
  emailInput?.setAttribute("aria-invalid", String(!emailValid));
  if (!emailValid) {
    emailInput?.focus();
    setAuthResult("error", "邮箱格式不正确", "请先填写注册账号使用的邮箱地址。");
    return;
  }
  if (!supabaseConfigured) {
    setAuthResult("error", "云端未配置", "当前环境还没有配置 Supabase Auth。");
    return;
  }

  try {
    authRequestInFlight = true;
    setAuthBusy(true);
    setAuthResult("pending", "正在发送恢复邮件", "正在向该邮箱发送密码恢复链接。");
    await sendPasswordRecoveryEmail(email);
    setAuthResult("success", "请检查邮箱", "如果该邮箱已注册，密码恢复链接已发送。打开链接后可在此设置新密码。");
  } catch (error) {
    setAuthResult("error", "恢复邮件发送失败", friendlyAuthError(error));
  } finally {
    authRequestInFlight = false;
    setAuthBusy(false);
  }
}

async function updatePasswordFromRecovery() {
  const password = document.getElementById("authPassword")?.value || "";
  const passwordInput = document.getElementById("authPassword");
  const passwordValid = password.length >= 6;
  passwordInput?.setAttribute("aria-invalid", String(!passwordValid));
  if (!passwordValid) {
    passwordInput?.focus();
    setAuthResult("error", "密码太短", "新密码至少需要 6 位。建议使用字母、数字和符号组合。");
    return;
  }

  try {
    authRequestInFlight = true;
    setAuthBusy(true);
    setAuthResult("pending", "正在更新密码", "正在为当前账号保存新密码。");
    await updateRecoveredPassword(password);
    passwordRecoveryPending = false;
    if (passwordInput) passwordInput.value = "";
    renderAuthPanel();
    setAuthResult("success", "密码已更新", "现在可以使用新密码登录。当前账号会话仍保持连接。");
  } catch (error) {
    setAuthResult("error", "密码更新失败", friendlyAuthError(error));
  } finally {
    authRequestInFlight = false;
    setAuthBusy(false);
    renderAuthPanel();
  }
}

function cancelPasswordRecovery() {
  passwordRecoveryPending = false;
  const passwordInput = document.getElementById("authPassword");
  if (passwordInput) passwordInput.value = "";
  renderAuthPanel();
  setAuthResult("idle", "已取消密码重置", "当前账号会话仍保持连接。");
  focusAuthPanel(currentUser);
}

function validateAuthForm({ email, password }) {
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  if (!email || !password) {
    emailInput?.setAttribute("aria-invalid", String(!email));
    passwordInput?.setAttribute("aria-invalid", String(!password));
    (!email ? emailInput : passwordInput)?.focus();
    return { valid: false, title: "缺少邮箱或密码", message: "请先填写邮箱和至少 6 位密码。" };
  }
  const emailValid = isLikelyEmail(email);
  emailInput?.setAttribute("aria-invalid", String(!emailValid));
  passwordInput?.removeAttribute("aria-invalid");
  if (!emailValid) {
    emailInput?.focus();
    return { valid: false, title: "邮箱格式不正确", message: "请填写真实可用邮箱。Supabase 会拒绝 example.com 等测试域名。" };
  }
  const passwordValid = password.length >= 6;
  passwordInput?.setAttribute("aria-invalid", String(!passwordValid));
  emailInput?.removeAttribute("aria-invalid");
  if (!passwordValid) {
    passwordInput?.focus();
    return { valid: false, title: "密码太短", message: "Supabase 要求密码至少 6 位。建议使用字母、数字和符号组合。" };
  }
  return { valid: true, title: "", message: "" };
}

function clearAuthValidation() {
  document.querySelectorAll("#authEmail, #authPassword").forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
}

function renderAuthPanel() {
  ensureSyncContainer();
  renderAuthPanelState({
    user: currentUser,
    passwordRecoveryPending,
    configured: supabaseConfigured,
    storageAvailable: browserStorage.available,
    syncLabel: syncStatusLabel(),
    build: APP_BUILD
  });
  renderAuthResult();
  const migrationBox = document.getElementById("migrationBox");
  if (migrationBox) {
    const shouldShow = Boolean(state.sync?.localImportPending || legacyImportPending || state.sync?.cloudPaused);
    migrationBox.hidden = !shouldShow;
    setText("migrationText", state.sync?.cloudPaused
      ? "已选择保留本机，云端同步暂停。要恢复同步，请先下载备份，再点击“导入云端”。"
      : "检测到旧版本地数据时，先下载备份，再决定是否导入云端。");
  }
  renderSnapshotPanel();
}

function syncStatusLabel() {
  const status = syncDisplayStatus();
  return ({
    local: supabaseConfigured ? "未登录" : "仅本机保存",
    unconfigured: "未配置云端",
    pending: "等待同步",
    syncing: "同步中",
    synced: "已同步",
    error: "同步失败",
    offline: "离线草稿",
    paused: "云端暂停"
  })[status] || "仅本机保存";
}

function renderSnapshotPanel() {
  const list = document.getElementById("snapshotList");
  if (!list) return;
  const snapshots = snapshotRows(state.snapshots).slice(0, 5);
  if (!snapshots.length) {
    list.innerHTML = `<div class="empty-state">还没有可恢复快照。删除、导入或清理前会自动生成。</div>`;
    return;
  }
  list.innerHTML = snapshots.map((snapshot, index) => {
    const label = snapshotReasonLabel(snapshot.reason);
    const summary = snapshotSummary(snapshot.payload);
    return `
      <div class="snapshot-item">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(snapshot.createdAt || "时间未知")} · ${escapeHtml(summary)}</span>
        </div>
        <button class="ghost-button" type="button" data-restore-snapshot="${index}" aria-label="恢复 ${escapeAttr(label)} 快照">恢复</button>
      </div>
    `;
  }).join("");
  list.querySelectorAll("[data-restore-snapshot]").forEach((button) => {
    button.addEventListener("click", () => restoreSnapshot(Number(button.dataset.restoreSnapshot)));
  });
}

function snapshotReasonLabel(reason = "manual") {
  const labels = {
    "before-import": "导入前",
    "before-cloud-import": "导入云端前",
    "before-restore-snapshot": "恢复前",
    "before-delete-record": "删除记录前",
    "before-delete-score": "删除模考前",
    "before-delete-custom-task": "删除自定义任务前",
    "before-clear-unlocked-week": "清理周任务前",
    manual: "手动快照"
  };
  const key = safeScalarText(reason, "manual", 120).trim();
  const safeKey = key && !["__proto__", "constructor", "prototype"].includes(key) ? key : "manual";
  return Object.prototype.hasOwnProperty.call(labels, safeKey) ? labels[safeKey] : safeKey || "快照";
}

function snapshotSummary(payload = {}) {
  const source = stateObject(payload);
  const weekTasks = Object.values(stateObject(source.weekPlans)).reduce(
    (sum, tasks) => sum + stateArray(tasks).filter(isPlainStateObject).length,
    0
  );
  return [
    `记录 ${Object.values(stateObject(source.entries)).filter(isPlainStateObject).length} 天`,
    `模考 ${stateArray(source.scores).filter(isPlainStateObject).length} 条`,
    `任务 ${weekTasks} 项`
  ].join(" · ");
}

function restoreSnapshot(index) {
  const snapshots = snapshotRows(state.snapshots);
  const snapshot = snapshots[index];
  if (!snapshot?.payload) {
    setAuthResult("error", "快照不可恢复", "这个快照缺少可恢复的数据。");
    return;
  }
  if (!window.confirm(`确认恢复“${snapshotReasonLabel(snapshot.reason)}”快照？当前状态会先保存为快照。`)) return;
  const currentSync = state.sync;
  const currentUserState = state.user;
  const rollback = createLocalSnapshot("before-restore-snapshot");
  const previousSnapshots = snapshotRows(state.snapshots);
  const restored = migrateState(snapshot.payload);
  state = {
    ...restored,
    snapshots: [rollback, snapshot, ...previousSnapshots.filter((item) => item !== rollback && item !== snapshot)].slice(0, 5),
    sync: syncStateAfterJsonImport(currentSync, currentUser, supabaseConfigured),
    user: currentSessionUser(currentUserState, currentUser)
  };
  const saved = saveState();
  renderAll();
  setLocalSaveResult(saved, "快照已恢复", "恢复前状态也已保存，可在最近快照中找回。", "快照恢复未写入本机缓存");
  renderAuthPanel();
}

async function pushLocalToCloud() {
  try {
    setAuthBusy(true);
    setAuthResult("pending", "正在导入云端", "正在把本机数据写入云端，请保持页面打开。");
    createLocalSnapshot("before-cloud-import");
    state.sync = { ...state.sync, status: "pending", pending: true, lastError: "" };
    const result = await syncNow({ force: true });
    if (result?.ok) legacyImportPending = false;
    const saved = saveState({ skipCloud: true });
    if (result?.ok) {
      setLocalSaveResult(saved, "导入云端完成", "本机数据已导入云端，同步已恢复。", "导入云端状态未写入本机缓存");
    } else {
      const detail = cloudImportFailureMessage(result);
      setAuthResult("error", saved ? "导入云端失败" : "导入云端状态未写入本机缓存", saved
        ? `${detail} 本机迁移选择已保留。`
        : `${detail} 浏览器阻止写入本机缓存；本机迁移选择只保留在当前页面。请立即导出备份。`);
    }
  } catch (error) {
    const message = safeErrorMessage(error, "导入云端失败");
    state.sync = { ...state.sync, status: "error", lastError: message, pending: false };
    const saved = saveState({ skipCloud: true });
    const detail = friendlySyncError(message);
    setAuthResult("error", saved ? "导入云端失败" : "导入云端状态未写入本机缓存", saved
      ? `${detail} 本机迁移选择已保留。`
      : `${detail} 浏览器阻止写入本机缓存；本机迁移选择只保留在当前页面。请立即导出备份。`);
  } finally {
    setAuthBusy(false);
    renderAuthPanel();
  }
}

function cloudImportFailureMessage(result) {
  if (result?.error) return friendlySyncError(result.error);
  if (result?.reason === "offline") return "当前离线，网络恢复后再重试。";
  if (result?.reason === "unconfigured") return "云端未配置，请先配置 Supabase URL 和 publishable key。";
  if (result?.reason === "not-authenticated") return "当前未登录，请先登录账号。";
  if (result?.reason === "cloud-paused") return "云端同步仍处于暂停状态，请确认后再重试。";
  if (result?.reason === "local-import-pending") return "仍在等待本机迁移选择，请重新选择导入云端。";
  return "请检查网络和 Supabase 配置后重试。";
}

function keepLocalOnly(dialog) {
  state.sync = { ...state.sync, localImportPending: false, cloudPaused: true, status: "paused", pending: false };
  legacyImportPending = false;
  const saved = saveState({ skipCloud: true });
  renderSyncStatus();
  renderAuthPanel();
  setLocalSaveResult(saved, "已保留本机数据", "云端同步已暂停。", "保留本机选择未写入本机缓存");
  if (saved) closeAuthDialog(dialog);
}

function isLikelyEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setAuthBusy(isBusy) {
  setAuthPanelBusy(isBusy);
}

function setAuthResult(status, title, message) {
  lastAuthResult = { status, title, message };
  renderAuthResult();
  showToast(message);
}

function renderAuthResult() {
  const box = document.getElementById("authResult");
  if (!box) return;
  box.dataset.status = lastAuthResult.status || "idle";
  box.innerHTML = `
    <strong>${escapeHtml(lastAuthResult.title || "账号状态")}</strong>
    <p>${escapeHtml(lastAuthResult.message || "")}</p>
  `;
}

function friendlyAuthError(error) {
  const text = safeErrorMessage(error);
  const lower = text.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch failed")) {
    return "无法连接 Supabase。请检查网络、Vercel 环境变量和 Supabase 项目 URL 后重试。";
  }
  if (lower.includes("auth session missing") || lower.includes("session missing")) {
    return "登录会话已失效，请重新登录。当前本机数据仍会保留。";
  }
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确。如果是刚注册，请确认是否已完成邮箱确认。";
  if (lower.includes("email not confirmed")) return "邮箱还没有确认。请打开确认邮件后再登录。";
  if (lower.includes("user already registered") || lower.includes("already registered")) return "这个邮箱已经注册过，请直接点击“登录并同步”。";
  if (lower.includes("invalid email")) return "邮箱地址被 Supabase 判定为无效。请换成真实常用邮箱。";
  if (lower.includes("password")) return `密码不符合要求：${text}`;
  if (lower.includes("rate limit") || lower.includes("too many")) return "请求太频繁，请等一会儿再试。";
  return text;
}

function resetLocalData() {
  if (!window.confirm("确认清理本浏览器里的学习数据和缓存？系统会先下载一份 JSON 备份。")) return;
  try {
    exportStateJson("before-reset");
  } catch (error) {
    setAuthResult("error", "备份下载失败", `未清理本机缓存。请先手动导出备份后再重试：${safeErrorMessage(error, "浏览器下载失败")}`);
    return;
  }
  window.clearTimeout(syncTimer);
  syncTimer = null;
  const cacheCleared = clearAppLocalStorage();
  currentUser = null;
  state = freshState();
  legacyImportPending = false;
  lastAuthResult = {
    status: "idle",
    title: "本机缓存已清理",
    message: "当前页面已断开账号同步。重新登录或刷新后可再次拉取云端数据。"
  };
  const saved = saveState({ skipCloud: true });
  renderAll();
  initRoute();
  renderAuthPanel();
  setLocalSaveResult(cacheCleared && saved, "本机缓存已清理", "已下载备份并断开云端会话。", "本机缓存未完全清理");
}

function bindNetworkStatus() {
  window.addEventListener("online", async () => {
    ensureSyncContainer();
    if (state.sync?.status === "offline" && state.sync?.pending && !state.sync?.localImportPending && !state.sync?.cloudPaused) {
      const result = await syncNow();
      if (result?.localSaved === false && result?.reason !== "sync-error") {
        setLocalSaveResult(false, "网络恢复状态已保存", "网络恢复后的同步状态已写入本机缓存。", "网络恢复同步状态未写入本机缓存");
      }
    }
    renderSyncStatus();
    renderAuthPanel();
  });
  window.addEventListener("offline", () => {
    ensureSyncContainer();
    if (state.sync?.cloudPaused) {
      state.sync = { ...state.sync, status: "paused", pending: false };
    } else if (state.sync?.localImportPending || legacyImportPending) {
      state.sync = { ...state.sync, status: "pending", pending: true };
    } else if (!currentUser || !supabaseConfigured) {
      state.sync = { ...state.sync, status: currentUser ? "unconfigured" : "local", pending: false };
    } else {
      state.sync = { ...state.sync, status: "offline", pending: true };
    }
    const saved = saveState({ skipCloud: true });
    renderAuthPanel();
    if (!saved) {
      setLocalSaveResult(false, "离线状态已保存", "离线状态已写入本机缓存。", "离线状态未写入本机缓存");
    }
  });
}

function upgradeGeneratedPlans() {
  state.settings = stateObject(state.settings);
  const weekPlans = ensurePlanContainers();
  if (state.settings.planLogicVersion === PLAN_LOGIC_VERSION) return true;
  Object.keys(weekPlans).forEach((date) => {
    weekPlans[date] = planTasksForDate(date).filter((task) => {
      if (date < PLAN_START_DATE) return task.locked || isTaskDone(task, state.tasks);
      return task.status === "shifted" || task.locked || isTaskDone(task, state.tasks);
    });
  });
  Object.keys(weekPlans).forEach((date) => {
    if (date < PLAN_START_DATE && !planTasksForDate(date).length) delete weekPlans[date];
  });
  if (!state.settings.rampSettingsApplied) {
    state.settings.weekdayMinutes = defaultSettings.weekdayMinutes;
    state.settings.weekendMinutes = defaultSettings.weekendMinutes;
    state.settings.rampSettingsApplied = true;
  }
  state.settings.planLogicVersion = PLAN_LOGIC_VERSION;
  return saveState({ skipCloud: true });
}

function bindWeekPlanner() {
  document.getElementById("generateWeekBtn")?.addEventListener("click", () => {
    const saved = generateWeekPlan();
    renderAll();
    setLocalSaveResult(saved, "周计划已生成", "未来 7 天计划已保存；已锁定任务会继续保留。", "周计划未写入本机缓存");
  });
  document.getElementById("clearUnlockedWeekBtn")?.addEventListener("click", () => {
    const cleared = clearUnlockedWeekTasks();
    if (!cleared) return;
    const saved = saveState();
    renderAll();
    renderSnapshotPanel();
    setLocalSaveResult(saved, "周任务已清理", `已清理 ${cleared} 项未锁定任务，并保留恢复快照。`, "周任务清理未写入本机缓存");
  });
}

function clearUnlockedWeekTasks(dates = nextSevenDates()) {
  ensurePlanContainers();
  const clearable = collectUnlockedWeekTasks(dates);
  if (!clearable.length) {
    setAuthResult("idle", "无需清理周任务", "未来 7 天没有可清理的未锁定任务。");
    return 0;
  }
  if (!window.confirm(`确认清理未来 7 天的 ${clearable.length} 项未锁定任务？已锁定任务会保留。`)) {
    setAuthResult("idle", "清理已取消", "周任务未改变。");
    return 0;
  }
  createLocalSnapshot("before-clear-unlocked-week");
  const ids = new Set(clearable.map((task) => task.id).filter(Boolean));
  ids.forEach((id) => {
    markDeleted("tasks", id);
    delete state.tasks[id];
  });
  dates.forEach((date) => {
    state.weekPlans[date] = planTasksForDate(date).filter((task) => task.locked);
  });
  return clearable.length;
}

function collectUnlockedWeekTasks(dates = nextSevenDates()) {
  return dates.flatMap((date) => planTasksForDate(date).filter((task) => !task.locked));
}

function parseReviewDays(value) {
  const tokens = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!tokens.length) return [];
  const days = tokens.map((item) => Number(item));
  const valid = tokens.every((item, index) => /^\d+$/.test(item) && days[index] >= 1 && days[index] <= 365);
  return valid ? [...new Set(days)].sort((a, b) => a - b) : [];
}

function applyPreset(type) {
  const phase = getCurrentPhase();
  const ramp = rampBudgetForDate();
  const normalMath = phase.id === "A" ? 45 : phase.id === "B" ? 90 : 120;
  const normalCs = phase.id === "A" ? 45 : phase.id === "B" ? 95 : 125;
  const normalEnglish = phase.id === "A" ? 20 : phase.id === "B" ? 35 : 45;
  const presets = {
    minimum: {
      mathMin: 45,
      csMin: 45,
      engMin: 20,
      polMin: phase.quotas.politics ? 20 : 0,
      projectMin: 0
    },
    normal: {
      mathMin: normalMath,
      csMin: normalCs,
      engMin: normalEnglish,
      polMin: phase.quotas.politics ? 45 : 0,
      projectMin: phase.quotas.project ? 25 : 0
    },
    strong: {
      mathMin: Math.min(180, Math.max(normalMath + 30, Math.round(ramp.weekday * 0.38))),
      csMin: Math.min(190, Math.max(normalCs + 30, Math.round(ramp.weekday * 0.40))),
      engMin: Math.min(60, Math.max(normalEnglish, Math.round(ramp.weekday * 0.14))),
      polMin: phase.quotas.politics ? 60 : 0,
      projectMin: phase.quotas.project ? 35 : 0
    }
  };

  Object.entries(presets[type]).forEach(([id, value]) => {
    document.getElementById(id).value = value || "";
  });
}

function readNumber(id) {
  const value = Number(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function loadEntryForm() {
  const date = document.getElementById("entryDate").value || planTodayISO();
  const entry = entryRow(date) || {};
  setValue("mathMin", entry.math);
  setValue("csMin", entry.cs408);
  setValue("engMin", entry.english);
  setValue("polMin", entry.politics);
  setValue("projectMin", entry.project);
  setValue("qualityScore", entry.quality || 3);
  setValue("mathProblems", entry.mathProblems);
  setValue("csProblems", entry.csProblems);
  setValue("readingCount", entry.reading);
  setValue("newMistakes", entry.newMistakes);
  setValue("fixedMistakes", entry.fixedMistakes);
  setValue("sleepHours", entry.sleepHours);
  setValue("fatigueScore", statedFatigue([entry.fatigue]));
  const loadTier = document.getElementById("loadTier");
  if (loadTier) loadTier.value = sanitizeLoadTier(entry.loadTier, "");
  document.getElementById("nextTask").value = entry.nextTask || "";
  document.getElementById("note").value = decodeLoadNote(entry.note).note || "";
  clearEntryValidation();
}

function setValue(id, value) {
  document.getElementById(id).value = value || "";
}

function setSelectValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || "";
}

// The production CSP (vercel.json) declares `style-src 'self'` with no
// 'unsafe-inline'. Per CSP3, inline `style` attributes are governed by
// `style-src-attr`, which falls back to `style-src` — so every `style="..."`
// emitted inside a template string is refused by the browser. That silently
// zeroed every progress bar, ring and chart in production while all gates
// stayed green (they only ever exercised the Vite dev server, which sends no
// CSP header).
//
// Dynamic values are therefore carried on `data-*` attributes in the markup and
// applied here through CSSOM. CSP does not police CSSOM writes, so the strict
// `style-src 'self'` policy can stay in place.
const DEFERRED_STYLE_RULES = Object.freeze([
  { attribute: "data-fill", apply: (element, value) => { element.style.width = `${value}%`; } },
  { attribute: "data-height", apply: (element, value) => { element.style.height = `${value}%`; } },
  { attribute: "data-var-value", apply: (element, value) => { element.style.setProperty("--value", value); } }
]);

function applyDeferredStyles(root = document) {
  for (const rule of DEFERRED_STYLE_RULES) {
    root.querySelectorAll(`[${rule.attribute}]`).forEach((element) => {
      rule.apply(element, element.getAttribute(rule.attribute));
    });
  }
}

function getWorkspaceRenderer() {
  if (workspaceRenderer) return workspaceRenderer;

  workspaceRenderer = createViewRenderCoordinator({
    renderShared: renderSharedWorkspace,
    renderers: {
      dashboard: renderDashboard,
      today() {
        loadEntryForm();
        renderTasks();
        renderRecentLogs();
        renderFirstMonth();
        renderReviewQueue();
      },
      week: renderWeekPlanner,
      foundation: renderFoundation,
      syllabus: renderSyllabus,
      records: renderRecords,
      review: renderReview,
      scores: renderScores,
      resources: renderResources,
      settings: renderSettings
    },
    renderAfter() {
      renderStorageStatus();
      applyDensityMode();
      applyDeferredStyles();
    }
  });
  return workspaceRenderer;
}

function renderAll(viewId = activeViewId() || DEFAULT_VIEW_ID) {
  ensureRuntimeContainers();
  getWorkspaceRenderer().render(viewId);
}

function renderSharedWorkspace() {
  renderSideNav(lastDaysEntries(7), getCurrentPhase());
}

function getEntryTotals(entry) {
  const total = sanitizeNumber(entry.math) + sanitizeNumber(entry.cs408) + sanitizeNumber(entry.english) + sanitizeNumber(entry.politics) + sanitizeNumber(entry.project);
  const core = sanitizeNumber(entry.math) + sanitizeNumber(entry.cs408);
  return { total, core };
}

function entriesArray() {
  ensureLearningContainers();
  return Object.entries(state.entries)
    .flatMap(([rawDate, entry]) => {
      const date = sanitizeDateKey(rawDate);
      return date && isPlainStateObject(entry) ? [{ date, ...entry, ...getEntryTotals(entry) }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sumMinutes(entries, key) {
  return entries.reduce((sum, item) => sum + (item[key] || 0), 0);
}

function lastDaysEntries(days) {
  const today = parseDate(planTodayISO());
  const start = new Date(today);
  start.setDate(today.getDate() - days + 1);
  return entriesArray().filter((entry) => {
    const date = parseDate(entry.date);
    return date >= start && date <= today;
  });
}

function renderExecutionSignals() {
  const host = document.getElementById("executionSignals");
  if (!host) return;
  const signals = shouldUseBottomLine(entriesArray().slice(-3).map((entry) => ({
    plannedMinutes: entry.loadTier === "bottomline" ? 90 : 150,
    doneMinutes: entry.total || 0,
    sleepHours: entry.sleepHours || 0
  })));
  const sunday = weeklyReviewPrompt(new Date());
  const checks = dueOfficialChecks(planTodayISO(), state.settings.officialChecksDone || []);
  const leechCount = reviewRows().filter((item) => item.leech).length;
  const trend = lastDaysEntries(7);
  const parts = [];
  if (signals.active) {
    parts.push(`<p class="signal-warning">${signals.shortSleep ? "最近两晚睡眠不足 7 小时。" : ""}${signals.lowCompletion ? "最近三天完成时间低于底线档预算的 60%。" : ""}次日使用底线日，不补夜间时长。</p>`);
  }
  if (sunday) parts.push(`<p>${escapeHtml(sunday.text)}可选变量：${sunday.choices.join("、")}。</p>`);
  if (leechCount) parts.push(`<p>${leechCount} 条复盘已连续失败 3 次。先减少新内容，再处理这些回炉。</p>`);
  checks.forEach((item) => parts.push(`<p class="official-check"><span>${escapeHtml(item.text)}</span><button type="button" data-official-check="${escapeAttr(item.id)}">已核验</button></p>`));
  if (trend.length) {
    parts.push(`<div class="trend-row" aria-label="最近 7 天分钟">${trend.map((entry) => {
      const height = Math.min(100, Math.round((entry.total || 0) / 3));
      const sleep = entry.sleepHours ? ` · 睡眠 ${entry.sleepHours}h` : "";
      return `<span class="trend-col" title="${escapeAttr(entry.date)} · ${entry.total || 0} 分钟${escapeAttr(sleep)}"><i data-height="${height}"></i></span>`;
    }).join("")}</div>`);
  }
  host.hidden = parts.length === 0;
  host.innerHTML = parts.join("");
  host.querySelectorAll("[data-official-check]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.officialCheck;
      const done = new Set(state.settings.officialChecksDone || []);
      done.add(id);
      state.settings.officialChecksDone = sanitizeStringList([...done], 12, 80);
      const saved = saveState();
      renderExecutionSignals();
      setLocalSaveResult(saved, "核验已记录", "这条官方提醒已从总览收起。", "核验记录未写入本机缓存");
    });
  });
  applyDeferredStyles(host);
}

function renderWeekPulse() {
  const container = document.getElementById("weekPulse");
  const caption = document.getElementById("weekPulseCaption");
  if (!container) return;
  const today = parseDate(planTodayISO());
  const days = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = entryRow(iso);
    const minutes = entry ? getEntryTotals(entry).total : 0;
    days.push({ iso, minutes, label: `${date.getMonth() + 1}/${date.getDate()}` });
  }
  const recorded = days.filter((day) => day.minutes > 0).length;
  const maxMinutes = Math.max(60, ...days.map((day) => day.minutes));
  container.innerHTML = days.map((day) => {
    const height = day.minutes ? Math.max(8, Math.round(day.minutes / maxMinutes * 100)) : 0;
    return `<span class="pulse-day" title="${day.iso} · ${day.minutes} 分钟"><i data-height="${height}"></i><em>${day.label}</em></span>`;
  }).join("");
  if (caption) {
    caption.textContent = recorded >= 3
      ? `已有 ${recorded} 天记录。柱高按这 14 天里最长的一天缩放。`
      : "记录满 3 天后，这里显示每天投入。";
  }
}

function renderDashboard() {
  const phase = getCurrentPhase();
  const all = entriesArray();
  const week = lastDaysEntries(7);
  const totalMinutes = sumMinutes(all, "total");
  const weekMinutes = sumMinutes(week, "total");
  const coreMinutes = sumMinutes(week, "core");
  const daysLeft = Math.ceil((parseDate(state.settings.targetExamDate || DEFAULT_EXAM_DATE) - parseDate(planTodayISO())) / 86400000);
  const dateStatus = examDateStatusText();
  renderWeekPulse();
  const planDate = planTodayISO();
  const currentMonth = monthlyPlan.find((row) => planDate.startsWith(row[0]));
  const monthMinutes = sumMinutes(entriesArray().filter((entry) => entry.date.startsWith(planDate.slice(0, 7))), "total");
  const monthTarget = currentMonth ? currentMonth[1] : phase.weeklyTarget * 4;
  const monthProgress = monthTarget ? Math.min(999, monthMinutes / 60 / monthTarget * 100) : 0;

  document.getElementById("daysLeft").textContent = `${daysLeft} 天`;
  document.getElementById("totalHours").textContent = `${(totalMinutes / 60).toFixed(1)}h`;
  document.getElementById("weekHours").textContent = `${(weekMinutes / 60).toFixed(1)}h`;
  document.getElementById("coreRatioMetric").textContent = `${weekMinutes ? Math.round(coreMinutes / weekMinutes * 100) : 0}%`;
  document.getElementById("monthProgressMetric").textContent = `${Math.round(monthProgress)}%`;
  document.getElementById("monthProgressText").textContent = `本月目标 ${monthTarget}h`;
  document.getElementById("totalProgressText").textContent = `参考容量 ${TARGET_TOTAL_HOURS}h，当前 ${(totalMinutes / 60 / TARGET_TOTAL_HOURS * 100).toFixed(1)}%；不作为硬性定额`;
  document.getElementById("weekTargetText").textContent = `本阶段周目标 ${phase.weeklyTarget}h`;
  document.getElementById("currentPhaseBadge").textContent = `阶段 ${phase.id} · ${phase.name}`;
  setText("examDateStatus", dateStatus);
  setText("officialBasisText", officialBasisText());
  renderCurveMetric();

  renderRisk(week, phase);
  renderQuotas(week, phase);
  renderSyllabusMini();
  renderCoach(week, phase);
  renderHeatmap();
  renderScoreTargets();
  renderSystemRules();
  renderMemoryCurve();
  renderVisualBoard({
    phase,
    week,
    all,
    totalMinutes,
    weekMinutes,
    coreMinutes,
    monthProgress,
    monthTarget,
    monthMinutes
  });
  renderFocusBoard(previewDailyTasks());
  renderTargetLane({ week, totalMinutes, monthTarget, monthMinutes });
  renderWorkflowRail();
  renderStorageStatus();
  renderStrategyBoard({ phase, week, weekMinutes, coreMinutes });
  renderLiveFactChecks();
}

function renderRisk(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const coreMinutes = sumMinutes(week, "core");
  const totalMinutes = sumMinutes(week, "total");
  const coreRatio = totalMinutes ? coreMinutes / totalMinutes : 0;
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const mistakeRatio = newMistakes ? fixedMistakes / newMistakes : 1;
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;

  if (activeDays === 0) {
    const card = document.getElementById("riskCard");
    card.className = "metric-card risk";
    document.getElementById("riskLabel").textContent = "待记录";
    document.getElementById("riskText").textContent = "连续记录 3 天后给出风险判断。";
    return;
  }

  // The label is the risk state, not its colour. Showing "绿色" made the metric
  // read as a swatch name, and the project has retired the green palette
  // entirely — so the word was also the only place green still reached the UI.
  let color = "green";
  let label = "节奏正常";
  let text = "节奏正常，继续按计划推进。";

  if (weekHours < phase.weeklyTarget * 0.7 || coreRatio < 0.55 || activeDays <= 3) {
    color = "red";
    label = "需降载";
    text = "下周减少新增内容，优先补数学和 408。";
  } else if (weekHours < phase.weeklyTarget * 0.9 || coreRatio < 0.65 || mistakeRatio < 0.5) {
    color = "amber";
    label = "略偏紧";
    text = "略有偏航，优先补核心时长和错题回炉。";
  }

  const card = document.getElementById("riskCard");
  card.className = `metric-card risk ${color}`;
  document.getElementById("riskLabel").textContent = label;
  document.getElementById("riskText").textContent = text;
}

function renderStrategyBoard({ phase, week, weekMinutes, coreMinutes }) {
  const controls = normalizePlanControls(state.settings.planControls);
  const strategy = getPhaseStrategy(phase.id, controls.experienceTrack);
  const today = planTodayISO();
  const reviews = reviewRows();
  const windows = buildRollingReviewWindows(reviews, today, { controls });
  const signal = reviewLoadSignal(reviews, today, controls);
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const metrics = {
    activeDays: new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size,
    coreRatio: weekMinutes ? coreMinutes / weekMinutes : 0,
    mistakeRecovery: newMistakes ? fixedMistakes / newMistakes : 1
  };
  const adjustment = recommendPlanAdjustment(metrics, controls, phase.id);
  const enabledText = controls.enabledSubjects.map(subjectLabel).join(" / ");
  const focus = controls.focusSubject === "auto" ? "自动" : subjectLabel(controls.focusSubject);

  setText("activeStrategyTitle", `${phase.id} · ${strategy.label}`);
  setText("activeStrategyText", `${strategy.method}${strategy.trackText ? ` ${strategy.trackText}` : ""}`);
  setText("rollingReviewTitle", signal.label);
  setText("rollingReviewText", signal.action);
  setText("planAdjustmentTitle", controls.planIntensity === "bottomline" ? "底线恢复" : controls.planIntensity === "strong" ? "加强推进" : "正常推进");
  setText("planAdjustmentText", adjustment);

  const tagContainer = document.getElementById("activeStrategyTags");
  if (tagContainer) {
    tagContainer.innerHTML = [
      `强度 ${planIntensityLabel(controls.planIntensity)}`,
      `聚焦 ${focus}`,
      `新内容 <= ${controls.maxNewTopics}`,
      `复盘 ${controls.reviewLoad}m/项`,
      enabledText
    ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }

  const mini = document.getElementById("rollingReviewMini");
  if (mini) {
    const max = Math.max(1, ...windows.map((item) => item.count));
    mini.innerHTML = windows.slice(0, 5).map((item) => `
      <div class="review-window-mini ${item.key}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${item.count}</strong>
        <div><em data-fill="${Math.max(3, item.count / max * 100)}"></em></div>
      </div>
    `).join("");
  }
}

function renderLiveFactChecks() {
  const container = document.getElementById("liveFactGrid");
  if (!container) return;
  container.innerHTML = liveFactChecks.map((item) => `
    <article class="fact-check-card ${factStatusClass(item.status)}">
      <div>
        <span>${escapeHtml(item.label)}</span>
        <em>${escapeHtml(item.status)}</em>
      </div>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.detail)}</p>
      <small>${escapeHtml(item.source)} · ${SOURCE_CHECK_DATE}</small>
    </article>
  `).join("");
}

function factStatusClass(status) {
  if (status.includes("待")) return "pending";
  if (status.includes("历史")) return "history";
  if (status.includes("研究")) return "method";
  return "verified";
}

function planIntensityLabel(value) {
  return ({ bottomline: "底线", normal: "正常", strong: "加强" })[value] || "正常";
}

function renderCurveMetric() {
  const today = parseDate(planTodayISO());
  const days = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = entryRow(iso);
    days.push({ date, iso, hours: entry ? getEntryTotals(entry).total / 60 : 0 });
  }
  const previousAvg = averageHours(days.slice(0, 7));
  const recentAvg = averageHours(days.slice(7));
  const activeDays = days.slice(7).filter((day) => day.hours > 0).length;
  const ratio = previousAvg ? recentAvg / previousAvg : 0;
  // This metric is the ratio of the last 7 days to the 7 before it — a
  // week-over-week change, not a curve. It used to be labelled 学习曲线 and
  // rendered as a bare percentage, which read as if a chart were being
  // summarised by a single number.
  let metric = `${recentAvg.toFixed(1)}h/天`;
  let text = activeDays ? `${activeDays}/7 天有记录，满两周后给出环比。` : "记录 3 天后给出与前一周的对比";
  if (previousAvg) {
    const percent = Math.round(ratio * 100);
    metric = `${percent}%`;
    text = ratio >= 1.12 ? `近 7 天比前一周高 ${percent - 100}%，确认不是单日硬冲。` :
      ratio <= 0.78 ? `近 7 天比前一周低 ${100 - percent}%，先恢复底线日。` :
      "与前一周基本持平，保持当前负荷。";
  }
  setText("curveMetric", metric);
  setText("curveText", text);
}

function riskSnapshot(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const totalMinutes = sumMinutes(week, "total");
  const coreRatio = totalMinutes ? sumMinutes(week, "core") / totalMinutes : 0;
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const mistakeRatio = newMistakes ? fixedMistakes / newMistakes : 1;
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;

  if (activeDays === 0) return { label: "待记录", color: "muted" };
  if (weekHours < phase.weeklyTarget * 0.7 || coreRatio < 0.55 || activeDays <= 3) return { label: "需降载", color: "red" };
  if (weekHours < phase.weeklyTarget * 0.9 || coreRatio < 0.65 || mistakeRatio < 0.5) return { label: "略偏紧", color: "amber" };
  return { label: "节奏正常", color: "green" };
}

function renderSideNav(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const totalMinutes = sumMinutes(week, "total");
  const corePercent = totalMinutes ? Math.round(sumMinutes(week, "core") / totalMinutes * 100) : 0;
  const dueCount = reviewRows().filter((item) => isReviewDue(item)).length;
  const activeDays = entriesArray().filter((entry) => entry.total > 0).length;
  const avgSyllabus = Math.round(["math", "cs408", "english", "politics"].reduce((sum, subject) => sum + syllabusProgress(subject).percent, 0) / 4);
  const last5 = [...scoreRows()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const scoreAvg = averageScores(last5).total;
  const risk = riskSnapshot(week, phase);

  setText("sidePhase", `${phase.id} · ${phase.name}`);
  setText("sideWeek", `${weekHours.toFixed(1)} / ${phase.weeklyTarget}h`);
  setText("minimumTarget", minimumTargetText(phase));
  setText("sideCoreLabel", `核心占比 ${corePercent}%`);
  setStyleWidth("sideCoreFill", `${Math.min(100, corePercent)}%`);
  setText("navRiskDot", risk.label);
  setText("navRecordDays", `${activeDays} 天`);
  setText("navReviewDue", `${dueCount} 到期`);
  setText("navSyllabusProgress", `${avgSyllabus}%`);
  setText("navScoreAvg", scoreAvg ? `${scoreAvg.toFixed(0)}` : "--");
}

function examDateStatusText() {
  const target = state.settings.targetExamDate || DEFAULT_EXAM_DATE;
  if (target === DEFAULT_EXAM_DATE) return `${target} · ${DEFAULT_EXAM_DATE_STATUS}`;
  return `${target} · 用户自定日期，仍需以当年官方公告复核`;
}

function officialBasisText() {
  return `资料核验 ${SOURCE_CHECK_DATE}：学习计划从 ${PLAN_START_DATE} 开始；科目以北大软微已发布信息为备考基准，2027 年 12 月仍为推算窗口。`;
}

function renderWorkflowRail() {
  const container = document.getElementById("workflowRail");
  if (!container) return;
  const tasks = previewDailyTasks();
  const doneTasks = tasks.filter((task) => isTaskDone(task, state.tasks)).length;
  const planDate = planTodayISO();
  const todayEntry = entryRow(planDate);
  const dueCount = reviewRows().filter((item) => isReviewDue(item, planDate)).length;
  const recentScores = scoreRows().filter((score) => score.date >= formatDateISO(addDays(parseDate(planDate), -45))).length;
  const active14 = new Set(lastDaysEntries(14).filter((entry) => entry.total > 0).map((entry) => entry.date)).size;
  const avgSyllabus = Math.round(["math", "cs408", "english", "politics"].reduce((sum, subject) => sum + syllabusProgress(subject).percent, 0) / 4);
  const steps = [
    ["计划", `${tasks.length} 项`, tasks.length ? "done" : "wait"],
    ["执行", `${doneTasks}/${tasks.length}`, doneTasks ? "active" : "wait"],
    ["记录", todayEntry ? `${(getEntryTotals(todayEntry).total / 60).toFixed(1)}h` : "未填", todayEntry ? "done" : "active"],
    ["复盘", dueCount ? `${dueCount} 到期` : "无到期", dueCount ? "active" : "done"],
    ["日审", todayEntry?.nextTask ? "已收口" : "待收口", todayEntry?.nextTask ? "done" : todayEntry ? "active" : "wait"],
    ["统计", `${active14}/14 天`, active14 >= 8 ? "done" : active14 ? "active" : "wait"],
    ["模考", recentScores ? `${recentScores} 次` : "未到期", recentScores ? "done" : "wait"],
    ["校准", `${avgSyllabus}%`, avgSyllabus ? "active" : "wait"]
  ];
  container.innerHTML = steps.map(([label, value, status], index) => `
    <div class="workflow-step ${status}">
      <span>${index + 1}</span>
      <strong>${label}</strong>
      <em>${value}</em>
    </div>
  `).join("");
}

function renderTargetLane({ week, totalMinutes, monthTarget, monthMinutes }) {
  const totalHours = totalMinutes / 60;
    const next = nextMilestone();
    const [month, , cumulative, mathFocus, csFocus, otherFocus, scoreWatch] = next;
    const remaining = Math.max(0, cumulative - totalHours);
  const weekMinutes = sumMinutes(week, "total");
  const coreRatio = weekMinutes ? sumMinutes(week, "core") / weekMinutes : 0;
  const monthPercent = monthTarget ? (monthMinutes / 60 / monthTarget) * 100 : 0;
  const last5 = [...scoreRows()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const scoreAvg = averageScores(last5).total;

    let title = `${month} 节点还差 ${remaining.toFixed(0)}h`;
  let text = `本阶段重点：${mathFocus}；${csFocus}。完成后记录题量、错因和复盘日期。`;
  if (totalHours >= cumulative) {
    title = `${month} 节点已达累计线`;
    text = "继续检查核心占比、错题回炉和考点掌握。";
  } else if (coreRatio && coreRatio < 0.55) {
    title = "核心占比偏低";
    text = "本周优先安排数学和 408，减少非核心任务。";
  } else if (monthPercent >= 90) {
    title = "本月节奏接近目标";
    text = `继续按阶段验收推进。监测口径：${scoreWatch}。`;
  }

  setText("targetGateTitle", title);
  setText("targetGateText", text);
  setText("targetGateHours", `累计 ${totalHours.toFixed(1)} / ${cumulative}h`);
  setText("targetGateScore", scoreAvg ? `近 5 套 ${scoreAvg.toFixed(0)} / 500 · 目标 420` : `监测：${scoreWatch || otherFocus}`);

  const targetGrid = document.getElementById("targetSubjectGrid");
  if (targetGrid) {
    const latestAvg = averageScores(last5);
    const scoreKeys = { "政治": "politics", "英语一": "english", "数学一": "math", "408": "cs408" };
    targetGrid.innerHTML = scoreTargets.map(([subject, target, note]) => {
      const key = scoreKeys[subject];
      const max = subject === "数学一" || subject === "408" ? 150 : 100;
      const current = latestAvg[key] || 0;
      const currentText = current ? `${current.toFixed(0)} / ${target}` : `目标 ${target}`;
      const fill = Math.min(100, (current || target) / max * 100);
      return `
        <div class="target-subject">
          <div><span>${subject}</span><strong>${currentText}</strong></div>
          <div class="progress-track slim"><div class="progress-fill" data-fill="${fill}"></div></div>
          <em>${note}</em>
        </div>
      `;
    }).join("");
  }

  const tasks = previewDailyTasks();
  const doneTasks = tasks.filter((task) => isTaskDone(task, state.tasks)).length;
  const planDate = planTodayISO();
  const todayEntry = entryRow(planDate);
  const dueCount = reviewRows().filter((item) => isReviewDue(item, planDate)).length;
  const activeCore = weekMinutes ? Math.round(coreRatio * 100) : 0;
  const checks = [
    ["任务", doneTasks >= Math.min(2, tasks.length), `${doneTasks}/${tasks.length}`],
    ["记录", Boolean(todayEntry && getEntryTotals(todayEntry).total), todayEntry ? `${(getEntryTotals(todayEntry).total / 60).toFixed(1)}h` : "未填"],
    ["复盘", dueCount === 0, dueCount ? `${dueCount} 到期` : "清空"],
    ["核心", weekMinutes === 0 || activeCore >= state.settings.coreRatio, weekMinutes ? `${activeCore}%` : "待建立"]
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  setText("targetLoopScore", `${passed}/${checks.length}`);
  const audit = document.getElementById("targetLoopAudit");
  if (audit) {
    audit.innerHTML = checks.map(([label, ok, value]) => `
      <div class="audit-item ${ok ? "ok" : "warn"}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }
}

function renderStorageStatus() {
  const entries = entriesArray();
  const touchedTopics = Object.keys(stateObject(state.topics)).length;
  const exportDate = state.settings.lastExportDate;
  const lastSavedAt = state.settings.lastSavedAt ? state.settings.lastSavedAt.slice(0, 10) : "";
  const exportAge = exportDate ? Math.max(0, Math.floor((parseDate(todayISO()) - parseDate(exportDate)) / 86400000)) : null;
  const healthScore =
    Math.min(40, entries.length * 2) +
    Math.min(20, touchedTopics) +
    Math.min(20, reviewRows().length) +
    (exportDate && exportAge <= 7 ? 20 : exportDate ? 10 : 0);
  const health = Math.min(100, healthScore);
  setText("sideDataCount", `${entries.length} 条记录`);
  setText("sideDataSave", lastSavedAt ? `最近保存 ${lastSavedAt}` : "尚未保存");
  setStyleWidth("sideDataFill", `${health}%`);
  renderStorageHealthText();

  const container = document.getElementById("storageStatus");
  if (!container) return;
  const rows = [
    ["学习记录", `${entries.length} 天`, entries.length ? "记录已建立" : "今天先保存第一条记录"],
    ["考纲状态", `${touchedTopics} 项`, touchedTopics ? "已有考点标记" : "先标记当前数学和 408 小节"],
    ["复盘队列", `${reviewRows().length} 项`, reviewRows().length ? "任务完成后自动生成" : "勾选任务后自动生成"],
    ["备份", exportDate ? `${exportDate}` : "未导出", exportAge === null ? "建议现在导出一次 JSON" : exportAge > 7 ? `已 ${exportAge} 天未导出` : "备份节奏正常"]
  ];
  container.innerHTML = rows.map(([label, value, text]) => `
    <div class="storage-row">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${text}</p>
    </div>
  `).join("");
}

function renderStorageHealthText() {
  setText("storageHealthText", browserStorage.available ? "本机缓存正常" : "本机缓存不可用，建议检查浏览器隐私/存储权限");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function minimumTargetText(phase) {
  const politics = phase.quotas.politics ? " · 政治 20m" : "";
  return `数学 45m · 408 45m · 英语 20m${politics}`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setStyleWidth(id, value) {
  const element = document.getElementById(id);
  if (element) element.style.width = value;
}

function renderSystemRules() {
  const container = document.getElementById("ruleStack");
  if (!container) return;
  const budget = dailyBudgetMinutes();
  const rules = [
    ...systemRules,
    ["10", "今日预算自动校准", `当前设置下今日预算 ${budget} 分钟，任务生成会围绕 ${state.settings.taskCount} 项和 ${state.settings.coreRatio}% 核心占比收敛。`],
    ["11", "学习科学口径", "主动回忆、分散复盘、交错练习和可完成负荷只是提高执行质量的方法，不代表分数或录取承诺。"]
  ];
  container.innerHTML = rules.map(([num, title, text]) => `
    <article class="rule-item">
      <strong>${num}</strong>
      <div>
        <span>${title}</span>
        <p>${text}</p>
      </div>
    </article>
  `).join("");
}

function renderMemoryCurve() {
  const container = document.getElementById("memoryCurve");
  if (!container) return;
  container.innerHTML = memoryCurveRules.map(({ round, action, pass, fallback, cost }) => `
    <div class="memory-row">
      <div class="memory-head">
        <strong>${escapeHtml(round)}</strong>
        <em>${escapeHtml(cost)}</em>
      </div>
      <p>${escapeHtml(action)}</p>
      <span>通过：${escapeHtml(pass)}</span>
      <span>未过：${escapeHtml(fallback)}</span>
    </div>
  `).join("");
}

function renderQuotas(week, phase) {
  const items = [
    ["数学", "math", phase.quotas.math],
    ["408", "cs408", phase.quotas.cs408],
    ["英语", "english", phase.quotas.english],
    ["政治", "politics", phase.quotas.politics],
    ["项目", "project", phase.quotas.project]
  ];
  document.getElementById("quotaGrid").innerHTML = items.map(([label, key, target]) => {
    const hours = sumMinutes(week, key) / 60;
    const percent = target ? Math.min(100, hours / target * 100) : 0;
    const targetLabel = target ? `本周目标 ${target}h` : "本阶段暂不安排";
    return `
      <div class="quota">
        <span>${label} · ${targetLabel}</span>
        <strong>${hours.toFixed(1)}h</strong>
        <div class="progress-track"><div class="progress-fill" data-fill="${percent}"></div></div>
      </div>
    `;
  }).join("");
}

function renderVisualBoard(data) {
  renderRingGrid(data);
  renderSubjectChart(data.week, data.phase);
  renderTrendChart(data.phase);
}

function renderRingGrid({ phase, weekMinutes, coreMinutes, totalMinutes, monthProgress }) {
  const weekPercent = phase.weeklyTarget ? weekMinutes / 60 / phase.weeklyTarget * 100 : 0;
  const corePercent = weekMinutes ? coreMinutes / weekMinutes * 100 : 0;
  const totalPercent = totalMinutes / 60 / TARGET_TOTAL_HOURS * 100;
  const rings = [
    ["参考容量", totalPercent, `${(totalMinutes / 60).toFixed(0)}h`, `${TARGET_TOTAL_HOURS}h`],
    ["本月", monthProgress, `${Math.round(monthProgress)}%`, "月目标"],
    ["本周", weekPercent, `${(weekMinutes / 60).toFixed(1)}h`, `${phase.weeklyTarget}h`],
    ["核心", corePercent, `${Math.round(corePercent)}%`, "65%+"]
  ];
  const container = document.getElementById("ringGrid");
  if (!container) return;
  container.innerHTML = rings.map(([label, percent, value, target]) => {
    const clamped = Math.max(0, Math.min(100, percent));
    return `
      <div class="ring-card">
        <div class="ring" data-var-value="${clamped}">
          <span>${value}</span>
        </div>
        <strong>${label}</strong>
        <em>${target}</em>
      </div>
    `;
  }).join("");
}

function renderSubjectChart(week, phase) {
  const subjects = [
    ["数学", "math", phase.quotas.math],
    ["408", "cs408", phase.quotas.cs408],
    ["英语", "english", phase.quotas.english],
    ["政治", "politics", phase.quotas.politics],
    ["项目", "project", phase.quotas.project]
  ];
  const maxTarget = Math.max(...subjects.map(([, , target]) => target || 1));
  const container = document.getElementById("subjectChart");
  if (!container) return;
  container.innerHTML = subjects.map(([label, key, target]) => {
    const hours = sumMinutes(week, key) / 60;
    const baseline = target || maxTarget;
    const fill = target ? Math.min(100, hours / target * 100) : hours ? Math.min(100, hours / baseline * 100) : 0;
    const visualFill = fill ? Math.max(5, fill) : 0;
    return `
      <div class="subject-bar subject-${key}">
        <div class="subject-bar-track">
          <div class="subject-bar-fill" data-height="${visualFill}"></div>
        </div>
        <strong>${hours.toFixed(1)}</strong>
        <span>${label}</span>
        <em>${target}h</em>
      </div>
    `;
  }).join("");
}

function renderTrendChart(phase = getCurrentPhase()) {
  const container = document.getElementById("trendChart");
  if (!container) return;
  const today = parseDate(planTodayISO());
  const days = [];
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = entryRow(iso);
    const minutes = entry ? getEntryTotals(entry).total : 0;
    days.push({ date, iso, hours: minutes / 60 });
  }
  const maxHours = Math.max(3, ...days.map((day) => day.hours));
  const bars = days.map((day) => {
    const height = Math.max(4, day.hours / maxHours * 100);
    return `
      <div class="trend-day" title="${day.iso} · ${day.hours.toFixed(1)}h">
        <div class="trend-stem"><span data-height="${height}"></span></div>
        <em>${day.date.getDate()}</em>
      </div>
    `;
  }).join("");
  const curve = learningCurveSnapshot(days, phase);
  container.innerHTML = `
    <div class="trend-bars">${bars}</div>
    <div class="learning-signal-list">
      ${curve.map(([label, value, text, status]) => `
        <article class="learning-signal ${status}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <p>${escapeHtml(text)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function averageHours(days) {
  return days.length ? days.reduce((sum, day) => sum + day.hours, 0) / days.length : 0;
}

function learningCurveSnapshot(days, phase = getCurrentPhase()) {
  const previous7 = days.slice(0, 7);
  const recent7 = days.slice(7);
  const previousAvg = averageHours(previous7);
  const recentAvg = averageHours(recent7);
  const activeDays = recent7.filter((day) => day.hours > 0).length;
  const weeklyTarget = Number(phase.weeklyTarget) || 0;
  const targetDaily = weeklyTarget ? weeklyTarget / 7 : 0;
  const trendRatio = previousAvg ? recentAvg / previousAvg : recentAvg ? 1 : 0;
  const trendText = trendRatio >= 1.12 ? "近 7 天高于前 7 天，确认不是靠单日硬冲。" :
    trendRatio <= 0.78 && previousAvg ? "近 7 天明显回落，下周先恢复底线日和核心任务。" :
    activeDays ? "投入基本平稳，可以继续按当前阶段推进。" :
    "先连续记录 3 天，再判断曲线。";
  const loadStatus = recentAvg >= targetDaily * 0.9 ? "ok" : recentAvg >= targetDaily * 0.65 ? "warn" : "risk";
  const continuityStatus = activeDays >= 6 ? "ok" : activeDays >= 4 ? "warn" : "risk";
  return [
    ["7 天均值", `${recentAvg.toFixed(1)}h/天`, targetDaily ? `阶段参考 ${targetDaily.toFixed(1)}h/天。` : "阶段目标未设定。", loadStatus],
    ["曲线判断", previousAvg ? `${Math.round(trendRatio * 100)}%` : "待建立", trendText, trendRatio >= 0.78 || !previousAvg ? "ok" : "risk"],
    ["连续性", `${activeDays}/7 天`, activeDays >= 6 ? "节奏稳定，允许小幅加难度。" : "先保学习天数，再谈加量。", continuityStatus]
  ];
}

function renderScoreTargets() {
  document.getElementById("scoreTargets").innerHTML = scoreTargets.map(([subject, target, note]) => `
    <div class="score-target">
      <span>${subject}</span>
      <strong>${target}</strong>
      <em>${note}</em>
    </div>
  `).join("");
}

function renderTasks(force = false, date = planTodayISO()) {
  const phase = getCurrentPhase(date);
  const result = buildDailyTasks(force, date, { persist: force, withSaveResult: true });
  const tasks = result.tasks;

  const fullHtml = tasks.map((task) => {
    const checked = isTaskDone(task, state.tasks) ? "checked" : "";
    const method = subjectMethods[task.subject] || subjectMethods["复盘"];
    const blueprint = taskBlueprint(task);
    const taskId = escapeAttr(task.id);
    const subject = escapeHtml(task.subject);
    const text = escapeHtml(task.text);
    return `
      <div class="task-block ${checked ? "done" : ""}">
        <label class="task-item task-prescription">
          <input type="checkbox" data-task="${taskId}" ${checked}>
          <span>
            <strong>${subject}<em>${escapeHtml(blueprint.metric)}</em></strong>
            <span class="task-topic">${text}</span>
            <span class="task-output">${escapeHtml(blueprint.output)}</span>
            <span class="task-steps">学法：${escapeHtml(method.learn)}</span>
            <span class="task-steps">练习：${escapeHtml(method.practice)}</span>
            <span class="task-steps">验收：${escapeHtml(method.check)}</span>
          </span>
          <em class="task-time">${Number(task.minutes) || 0}m</em>
        </label>
        ${renderCaptureForm(task)}
      </div>
    `;
  }).join("");

  const compactHtml = tasks.slice(0, 4).map((task) => {
    const checked = isTaskDone(task, state.tasks) ? "checked" : "";
    return `
      <label class="task-item task-compact">
        <input type="checkbox" data-task="${escapeAttr(task.id)}" ${checked}>
        <span><strong>${escapeHtml(task.subject)}</strong><span>${escapeHtml(task.text)}</span></span>
        <em class="task-time">${Number(task.minutes) || 0}m</em>
      </label>
    `;
  }).join("");

  document.getElementById("todayTasks").innerHTML = fullHtml;
  document.getElementById("todayTasksPreview").innerHTML = compactHtml;
  document.getElementById("dailyPlan").innerHTML = renderPlanCards(tasks);
  renderDailyOperatingConsole(tasks, date);
  renderDailyTaskProgress(tasks);
  renderScienceProtocol(tasks, date);
  renderEnglishDrip(tasks, date);
  const taskFlow = document.getElementById("taskFlow");
  if (taskFlow) taskFlow.innerHTML = renderTaskFlow(tasks);
  const carryCount = tasks.filter((task) => task.source === "carryover").length;
  document.getElementById("dailyPlanMeta").textContent = `${tasks.length} 个必做任务，预算 ${tasks.reduce((sum, task) => sum + task.minutes, 0)} 分钟${carryCount ? `；${carryCount} 项由未完成任务顺延` : "；完成后只做记录和到期复盘"}`;
  document.getElementById("todayPhaseText").textContent = `阶段 ${phase.id}：${phase.focus}`;
  setText("navTaskCount", `${tasks.length} 项`);
  renderFocusBoard(tasks);
  renderAcceptance(tasks);

  document.querySelectorAll("#todayTasks [data-task]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const task = tasks.find((item) => item.id === checkbox.dataset.task);
      if (!checkbox.checked) {
        state.tasks[checkbox.dataset.task] = false;
        if (task) markTaskTodo(task);
        const saved = saveState();
        renderTasks();
        renderReviewQueue();
        renderDashboard();
        renderWeekPlanner();
        if (!saved) {
          setLocalSaveResult(false, "任务状态已保存", "任务状态已写入本机缓存。", "任务取消完成未写入本机缓存");
        }
        return;
      }
      checkbox.checked = false;
      if (task) task.status = task.status === "done" ? "done" : "todo";
      openTaskCapture(checkbox.dataset.task);
    });
  });
  document.querySelectorAll("#todayTasksPreview [data-task], #dailyPlan [data-task]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const task = tasks.find((item) => item.id === checkbox.dataset.task);
      if (!task) return;
      if (checkbox.checked) {
        checkbox.checked = false;
        openTaskCapture(task.id);
        return;
      }
      state.tasks[task.id] = false;
      markTaskTodo(task);
      const saved = saveState();
      renderTasks();
      renderReviewQueue();
      renderDashboard();
      renderWeekPlanner();
      if (!saved) {
        setLocalSaveResult(false, "任务状态已保存", "任务状态已写入本机缓存。", "任务取消完成未写入本机缓存");
      }
    });
  });
  bindTaskCapture(tasks);
  // `renderTasks` is also reached from the form submit handler in `bindForms`,
  // which bypasses the render coordinator's `renderAfter` hook.
  applyDeferredStyles();
  return result;
}

function markTaskTodo(task) {
  const now = new Date().toISOString();
  weekPlanEntries().forEach(([, tasks]) => {
    tasks.filter((item) => item.id === task.id).forEach((item) => {
      item.status = "todo";
      item.completedAt = "";
      item.updatedAt = now;
      item.recordApplied = false;
      item.recordImpact = null;
    });
  });
  task.status = "todo";
  task.completedAt = "";
  task.updatedAt = now;
  unmarkDeleted("tasks", task.id);
  if (task.recordApplied) {
    revertTaskFromEntry(task);
    task.recordApplied = false;
    task.recordImpact = null;
  }
}

function renderCaptureForm(task) {
  const taskId = escapeAttr(task.id);
  const open = taskCaptureId === task.id;
  return `
    <form class="task-capture" data-capture-for="${taskId}" ${open ? "" : "hidden"}>
      <label>有效分钟<input name="minutes" type="number" min="1" max="240" inputmode="numeric" value="${Number(task.minutes) || 25}" required></label>
      <label>题量<input name="problems" type="number" min="0" max="999" inputmode="numeric" value="0" required></label>
      <label class="span-2">错因或收获<input name="mistake" type="text" maxlength="300" required placeholder="例如：左右极限条件漏了"></label>
      <label class="span-2">明日第一任务<input name="nextTask" type="text" maxlength="300" required placeholder="例如：闭卷重做两道变式"></label>
      <div class="task-capture-actions">
        <button type="button" data-session-start="${taskId}">开始 45 分钟</button>
        <button type="submit" class="primary-button">保存并完成</button>
        <button type="button" data-capture-cancel="${taskId}">取消</button>
      </div>
      <p class="task-session" data-session-for="${taskId}" hidden></p>
    </form>
  `;
}

let taskCaptureId = "";
let activeSession = null;

function openTaskCapture(taskId) {
  taskCaptureId = taskId;
  document.querySelectorAll("[data-capture-for]").forEach((form) => {
    form.hidden = form.dataset.captureFor !== taskId;
  });
  document.querySelector(`[data-capture-for="${CSS.escape(taskId)}"] [name="mistake"]`)?.focus();
}

function bindTaskCapture(tasks) {
  document.querySelectorAll("[data-capture-for]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const task = tasks.find((item) => item.id === form.dataset.captureFor);
      if (!task) return;
      const evidence = validateCompletionEvidence({
        minutes: Number(new FormData(form).get("minutes")),
        problems: Number(new FormData(form).get("problems")),
        mistake: new FormData(form).get("mistake"),
        nextTask: new FormData(form).get("nextTask")
      });
      if (!evidence.ok) {
        showToast(evidence.message);
        return;
      }
      commitTaskCompletion(task, evidence.evidence);
    });
  });
  document.querySelectorAll("[data-capture-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      taskCaptureId = "";
      const form = button.closest("[data-capture-for]");
      if (form) form.hidden = true;
    });
  });
  document.querySelectorAll("[data-session-start]").forEach((button) => {
    button.addEventListener("click", () => startTaskSession(button.dataset.sessionStart));
  });
  paintTaskSession();
}

function commitTaskCompletion(task, evidence) {
  const date = task.date || planTodayISO();
  ensureLearningContainers();
  const current = entryRow(date) || {};
  const applied = applyCompletionEvidence(current, { ...task, date }, evidence);
  applied.entry.note = encodeLoadNote(applied.entry.note, {
    loadTier: applied.entry.loadTier,
    sleepHours: applied.entry.sleepHours,
    fatigue: statedFatigue([applied.entry.fatigue])
  });
  applied.entry.updatedAt = new Date().toISOString();
  unmarkDeleted("records", date);
  state.entries[date] = applied.entry;
  task.status = "done";
  task.completedAt = new Date().toISOString();
  task.actualMinutes = evidence.minutes;
  task.actualProblems = evidence.problems;
  task.evidenceSubmitted = true;
  task.recordApplied = true;
  task.recordImpact = applied.impact;
  task.updatedAt = task.completedAt;
  state.tasks[task.id] = true;
  if (task.reviewItemId) {
    const item = reviewRows().find((review) => review.id === task.reviewItemId);
    if (item) item.done = true;
  } else {
    scheduleReviewForTask(task.id, task);
  }
  taskCaptureId = "";
  stopTaskSession(false);
  const saved = saveState();
  if (date === (document.getElementById("entryDate")?.value || planTodayISO())) loadEntryForm();
  renderTasks();
  renderReviewQueue();
  renderDashboard();
  renderWeekPlanner();
  if (!saved) {
    setLocalSaveResult(false, "任务状态已保存", "任务状态已写入本机缓存。", "任务完成状态未写入本机缓存");
  } else {
    showToast("已保存完成证据，并安排复盘。");
  }
}

function startTaskSession(taskId) {
  activeSession = {
    taskId,
    endsAt: Date.now() + 45 * 60 * 1000
  };
  window.clearInterval(startTaskSession.timer);
  startTaskSession.timer = window.setInterval(paintTaskSession, 1000);
  paintTaskSession();
}

function stopTaskSession(openCapture = true) {
  const taskId = activeSession?.taskId || "";
  activeSession = null;
  window.clearInterval(startTaskSession.timer);
  paintTaskSession();
  if (openCapture && taskId) openTaskCapture(taskId);
}

function paintTaskSession() {
  document.querySelectorAll("[data-session-for]").forEach((node) => {
    const running = activeSession && node.dataset.sessionFor === activeSession.taskId;
    node.hidden = !running;
    if (!running) return;
    const remaining = Math.max(0, activeSession.endsAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    node.textContent = remaining === 0
      ? "45 分钟已到。填写证据后保存。"
      : `剩余 ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (remaining === 0) stopTaskSession(true);
  });
}

function regenerateTodayPlan() {
  const date = planTodayISO();
  const current = normalizeTaskList(planTasksForDate(date), date);
  const active = current.filter((task) => task.status !== "shifted");
  const generated = createDailyTasks(date);
  const diff = diffPlan(active, generated);
  const kept = diff.kept.filter((item) => item.reason === "已锁定" || item.reason === "已完成");
  const replaced = diff.replaced;
  const summary = [
    kept.length ? `保留 ${kept.length} 项：${kept.map((item) => item.reason).join("、")}` : "没有已锁定或已完成任务",
    replaced.length ? `更新 ${replaced.length} 项：${replaced.slice(0, 3).map((item) => item.reason).join("、")}` : "其余任务保持不变"
  ].join("。");
  if (!window.confirm(`重新生成今日计划。${summary}。确认后再生效。`)) {
    showToast("已取消重新生成。");
    return null;
  }
  const shifted = current.filter((task) => task.status === "shifted");
  const merged = mergeRegeneratedTasks(active, generated);
  state.weekPlans[date] = normalizeTaskList([...shifted, ...merged], date);
  const saved = saveState();
  renderTasks();
  return { saved, message: `${summary}。今日任务已保存到本机。` };
}

function revertTaskFromEntry(task) {
  const impact = normalizeTaskRecordImpact(task.recordImpact);
  if (!impact) return false;
  const date = impact.date || task.date || planTodayISO();
  const entry = entryRow(date);
  if (!entry) return false;

  let changed = false;
  impact.changes.forEach((change) => {
    if (sanitizeNumber(entry[change.field]) !== change.after) return;
    entry[change.field] = change.before;
    changed = true;
  });

  if (!changed) return false;
  entry.updatedAt = new Date().toISOString();
  unmarkDeleted("records", date);
  state.entries[date] = entry;
  if (date === (document.getElementById("entryDate")?.value || planTodayISO())) loadEntryForm();
  return true;
}

/**
 * Task and review subjects are stored as Chinese labels (数学 / 408 / 英语 …),
 * not as the internal keys. A payload carrying `subject: "math"` would render the
 * raw key in the UI and miss the daily record field for that subject.
 *
 * Cloud rows and pre-rename local payloads can carry either form, so normalise
 * at the sanitising boundary. Values that are neither a known label nor a known
 * key pass through untouched.
 *
 * The label set is declared inside the function on purpose. `loadState()` runs
 * during module evaluation, well before module-level `const`s further down the
 * file are initialised — referencing one from here throws a temporal-dead-zone
 * ReferenceError, which `migrateState` would swallow and turn into a wiped
 * state.
 */
function normalizeSubjectLabel(value, fallback = "复盘") {
  const labels = ["数学", "408", "英语", "政治", "复盘", "项目", "补弱"];
  const text = sanitizeText(value, fallback, 80);
  return labels.includes(text) ? text : subjectLabel(subjectKey(text));
}

function nextSevenDates(startDate = planTodayISO()) {
  const start = parseDate(startDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDateISO(date);
  });
}

function generateWeekPlan() {
  nextSevenDates().forEach((date) => buildDailyTasks(true, date, { persist: false }));
  return saveState();
}

function renderWeekPlanContext() {
  const today = planTodayISO();
  const phase = getCurrentPhase(today);
  const playbook = phasePlanById(phase.id);
  const todayTasks = normalizeTaskList(planTasksForDate(today), today).filter((task) => task.status !== "shifted");
  const firstTask = todayTasks.find((task) => !isTaskDone(task, state.tasks)) || todayTasks[0];
  const role = weeklyCycleForDate(today);
  const taskPlan = firstTask ? phaseSubjectPlan(phase.id, firstTask.subject) : null;
  const focus = document.getElementById("weekFocusSlice");
  if (focus) {
    focus.innerHTML = firstTask ? `
      <div class="week-focus-date">
        <span>${escapeHtml(role.label)} · ${escapeHtml(role.role)}</span>
        <strong>${escapeHtml(firstTask.subject)} · ${Number(firstTask.minutes) || 0}m</strong>
      </div>
      <div class="week-focus-task">
        <p>${escapeHtml(firstTask.text)}</p>
        <em>${escapeHtml(taskPlan?.output || taskBlueprint(firstTask).output)}</em>
      </div>
      <div class="week-focus-pass">
        <span>做完标准</span>
        <p>${escapeHtml(taskPlan?.pass || subjectAcceptanceRules[firstTask.subject]?.standard || subjectAcceptanceRules["复盘"].standard)}</p>
      </div>
    ` : `<div class="empty-state">本周还没有任务，先生成 7 天计划。</div>`;
  }

  const cadence = document.getElementById("weekCadenceStrip");
  if (cadence) {
    cadence.innerHTML = `
      <div class="week-cycle-head" aria-hidden="true">
        <span>日程</span><span>双核心</span><span>维护与复盘</span><span>缓冲与停手</span>
      </div>
      ${weeklyStudyCycle.map((item) => `
        <article class="cadence-day ${item.day === role.day ? "active" : ""}">
          <div class="cadence-identity"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.role)}</strong><em>${escapeHtml(item.load)}</em></div>
          <p data-label="双核心">${escapeHtml(item.core)}</p>
          <p data-label="维护与复盘">${escapeHtml(item.support)} ${escapeHtml(item.review)}</p>
          <p data-label="缓冲与停手"><strong>${escapeHtml(item.buffer)}</strong>${escapeHtml(item.stopRule)}</p>
        </article>
      `).join("")}
    `;
  }

  const diagnostic = document.getElementById("weekDiagnosticHead");
  if (diagnostic) {
    diagnostic.innerHTML = `
      <div><span>阶段 ${escapeHtml(playbook.id)}</span><strong>${escapeHtml(playbook.name)}</strong><p>${escapeHtml(playbook.mission)}</p></div>
      <div><span>周目标</span><strong>${escapeHtml(playbook.weeklyHours)}</strong><p>${escapeHtml(playbook.weeklyGoal)}</p></div>
      <div><span>退出门</span><strong>${playbook.exitGate.length} 项</strong><p>${escapeHtml(playbook.exitGate[0])}</p></div>
    `;
  }

  const audit = document.getElementById("weeklyAuditMatrix");
  if (audit) {
    const chainValues = [
      `阶段 ${playbook.id} · ${playbook.name}`,
      playbook.weeklyGoal,
      `${role.role}：${role.core} ${role.support}`,
      firstTask ? (taskPlan?.resource || taskBlueprint(firstTask).resource) : "生成周计划后匹配",
      firstTask ? `${firstTask.minutes} 分钟` : playbook.weeklyHours,
      firstTask ? (taskPlan?.output || taskBlueprint(firstTask).output) : role.output,
      firstTask ? (taskPlan?.pass || "按科目验收") : playbook.exitGate[0],
      firstTask ? (taskPlan?.review || "按表现自适应复盘") : "按表现自适应复盘",
      playbook.adjustment[0]
    ];
    audit.innerHTML = planChain.map((label, index) => `
      <article><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(label)}</strong><p>${escapeHtml(chainValues[index])}</p></article>
    `).join("");
  }
}

function renderWeekPlanner() {
  const container = document.getElementById("weekPlanner");
  if (!container) return;
  const weekPlans = ensurePlanContainers();
  const dates = nextSevenDates();
  dates.forEach((date) => {
    if (!Object.prototype.hasOwnProperty.call(weekPlans, date)) buildDailyTasks(false, date);
  });
  renderWeekPlanContext();
  container.innerHTML = dates.map((date) => {
    const tasks = normalizeTaskList(planTasksForDate(date), date);
    const visibleTasks = tasks.filter((task) => task.status !== "shifted");
    const done = visibleTasks.filter((task) => isTaskDone(task, state.tasks)).length;
    const total = visibleTasks.reduce((sum, task) => sum + (task.minutes || 0), 0);
    const percent = visibleTasks.length ? Math.round(done / visibleTasks.length * 100) : 0;
    const subjects = [...new Set(visibleTasks.map((task) => task.subject))];
    const hasEnglish = visibleTasks.some((task) => task.subject === "英语");
    const dueReviewCount = dueReviewItems(date).length;
    const isToday = date === planTodayISO();
    const firstOpenTaskIndex = visibleTasks.findIndex((task) => !isTaskDone(task, state.tasks));
    const focusTaskIndex = firstOpenTaskIndex >= 0 ? firstOpenTaskIndex : 0;
    const shortDate = date.slice(5).replace("-", "/");
    const dayRole = weeklyCycleForDate(date);
    const phase = getCurrentPhase(date);
    return `
      <article class="week-day-card ${isToday ? "today" : ""}">
        <div class="week-day-head">
          <div class="week-date-block">
            <span class="week-day-chip">${escapeHtml(weekDayLabel(date))}</span>
            <strong>${escapeHtml(shortDate)}${isToday ? " · 今天" : ""}</strong>
            <em>${escapeHtml(date)}</em>
          </div>
          <button type="button" data-regenerate-day="${escapeAttr(date)}" aria-label="重排 ${escapeAttr(date)} 的未锁定任务">重排</button>
        </div>
        <div class="week-day-summary">
          <span><strong>${done}/${visibleTasks.length}</strong> 完成</span>
          <span><strong>${total}</strong> 分钟</span>
          <span><strong>${escapeHtml(dayRole.role)}</strong> ${escapeHtml(dayRole.load)}</span>
        </div>
        <div class="week-subject-row" aria-label="当日科目">
          ${subjects.length ? subjects.map((subject) => `<span>${escapeHtml(subject)}</span>`).join("") : "<span>休整</span>"}
        </div>
        <div class="week-signal-row">
          <span class="${hasEnglish ? "ok" : "warn"}">英语${hasEnglish ? "不断" : "待补"}</span>
          <span class="${dueReviewCount ? "warn" : "ok"}">复盘 ${dueReviewCount}</span>
        </div>
        <div class="week-day-progress">
          <div data-fill="${percent}"></div>
        </div>
        <div class="week-day-protocol density-detail-only">
          <p><strong>复盘</strong>${escapeHtml(dayRole.review)}</p>
          <p><strong>缓冲</strong>${escapeHtml(dayRole.buffer)}</p>
          <p><strong>停手</strong>${escapeHtml(dayRole.stopRule)}</p>
        </div>
        <div class="week-task-list">
          ${visibleTasks.map((task, index) => {
            const prescription = phaseSubjectPlan(phase.id, task.subject);
            const blueprint = taskBlueprint(task);
            return `
              <div class="week-task ${index === focusTaskIndex ? "next-action" : ""} ${isTaskDone(task, state.tasks) ? "done" : ""} ${task.source === "carryover" ? "carryover" : ""}">
                <span class="week-task-index">${index + 1}</span>
                <div class="week-task-body">
                  <div class="week-task-title">
                    <strong>${escapeHtml(task.subject)}</strong>
                    <em>${Number(task.minutes) || 0}m</em>
                  </div>
                  <p>${escapeHtml(task.text)}</p>
                  <span>${task.source === "carryover" ? `从 ${escapeHtml(task.carriedFrom || "前序任务")} 顺延` : task.locked ? "已锁定" : "可调整"}</span>
                  <div class="week-task-detail density-detail-only">
                    <dl><div><dt>资料</dt><dd>${escapeHtml(prescription?.resource || blueprint.resource)}</dd></div><div><dt>交付</dt><dd>${escapeHtml(prescription?.output || blueprint.output)}</dd></div><div><dt>验收</dt><dd>${escapeHtml(prescription?.pass || subjectAcceptanceRules[task.subject]?.standard || subjectAcceptanceRules["复盘"].standard)}</dd></div></dl>
                  </div>
                </div>
                <div class="week-task-actions">
                  <button type="button" data-lock-task="${escapeAttr(task.id)}">${task.locked ? "解锁" : "锁定"}</button>
                  <button type="button" data-edit-task="${escapeAttr(task.id)}">编辑</button>
                  <button type="button" data-shift-task="${escapeAttr(task.id)}">顺延</button>
                </div>
                <form class="task-edit-form" data-edit-form="${escapeAttr(task.id)}" hidden>
                  <label>任务内容<input name="text" type="text" maxlength="300" value="${escapeAttr(task.text)}" required></label>
                  <label>分钟<input name="minutes" type="number" min="10" max="180" step="5" value="${Number(task.minutes) || 25}" required></label>
                  <button type="submit">保存任务</button>
                  <button type="button" data-edit-cancel>取消</button>
                </form>
              </div>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }).join("");
  setText("navWeekPlan", `${dates.length} 天`);

  document.querySelectorAll("[data-regenerate-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = buildDailyTasks(true, button.dataset.regenerateDay, { persist: true, withSaveResult: true });
      renderAll();
      setLocalSaveResult(result.saved, "单日已重排", "该日未锁定任务已重排，已锁定任务会继续保留。", "单日重排未写入本机缓存");
    });
  });
  document.querySelectorAll("[data-lock-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = findTask(button.dataset.lockTask);
      if (!task) {
        setAuthResult("error", "任务不可切换", "这个任务已不存在，请刷新周计划后再试。");
        return;
      }
      task.locked = !task.locked;
      task.updatedAt = new Date().toISOString();
      const saved = saveState();
      renderWeekPlanner();
      setLocalSaveResult(saved, task.locked ? "任务已锁定" : "任务已解锁", task.locked
        ? "后续重排会保留这个任务。"
        : "后续重排可重新安排这个任务。", task.locked ? "任务锁定未写入本机缓存" : "任务解锁未写入本机缓存");
    });
  });
  document.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest(".week-task")?.querySelector("[data-edit-form]");
      if (!form) return;
      form.hidden = false;
      form.querySelector("[name='text']")?.focus();
    });
  });
  document.querySelectorAll("[data-edit-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const text = String(data.get("text") || "");
      const minutes = String(data.get("minutes") || "");
      if (!editTask(form.dataset.editForm, text, minutes)) {
        form.hidden = false;
        return;
      }
      form.hidden = true;
    });
    form.querySelector("[data-edit-cancel]")?.addEventListener("click", () => {
      form.hidden = true;
    });
  });
  document.querySelectorAll("[data-shift-task]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!shiftTaskToTomorrow(button.dataset.shiftTask)) {
        setAuthResult("idle", "无需顺延任务", "任务已完成或已顺延，周计划未改变。");
        return;
      }
      const saved = saveState();
      renderAll();
      setLocalSaveResult(saved, "任务已顺延", "已移动到下一天，并保留原任务的顺延标记。", "任务顺延未写入本机缓存");
    });
  });
}

function weekDayLabel(date) {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[parseDate(date).getDay()];
}

function findTask(taskId) {
  for (const [, tasks] of weekPlanEntries()) {
    const task = tasks.find((item) => item.id === taskId);
    if (task) return task;
  }
  return null;
}

function editTask(taskId, text, minutesInput) {
  const task = findTask(taskId);
  if (!task) {
    setAuthResult("error", "任务不可编辑", "这个任务已不存在，请刷新周计划后再试。");
    return;
  }
  const nextText = text.trim();
  if (!isValidTaskEditText(nextText)) {
    setAuthResult("error", "任务内容无效", "任务内容不能为空，请写成可验收动作。");
    return false;
  }
  const minutes = Number(String(minutesInput).trim());
  if (!isValidTaskEditMinutes(minutes)) {
    setAuthResult("error", "任务分钟无效", "任务分钟数请填写 10-180 的 5 分钟整数刻度。");
    return false;
  }
  task.text = nextText;
  task.minutes = minutes;
  task.locked = true;
  task.source = "manual";
  task.updatedAt = new Date().toISOString();
  const saved = saveState();
  renderAll();
  setLocalSaveResult(saved, "任务已修改", "已锁定为手动任务，后续重排会保留它。", "任务修改未写入本机缓存");
  return true;
}

function isValidTaskEditText(text) {
  return Boolean(text && text.trim());
}

function isValidTaskEditMinutes(minutes) {
  return Number.isInteger(minutes) && minutes >= 10 && minutes <= 180 && minutes % 5 === 0;
}

function shiftTaskToTomorrow(taskId) {
  const match = weekPlanEntries().find(([, tasks]) => tasks.some((task) => task.id === taskId));
  const date = match?.[0];
  if (!date) return false;
  const task = match[1].find((item) => item.id === taskId);
  if (!task || task.status === "shifted" || task.status === "done" || isTaskDone(task, state.tasks)) return false;
  const next = formatDateISO(addDays(parseDate(date), 1));
  const nextTasks = planTasksForDate(next);
  const shiftedId = `${task.id}-shift-${next}`;
  if (nextTasks.some((item) => item.id === shiftedId || item.sourceTaskId === task.id)) return false;
  task.status = "shifted";
  task.shiftedTo = next;
  task.updatedAt = new Date().toISOString();
  nextTasks.push({
    ...task,
    id: shiftedId,
    date: next,
    priority: nextTasks.length + 1,
    locked: true,
    status: "todo",
    completedAt: "",
    recordApplied: false,
    recordImpact: null,
    source: "carryover",
    sourceTaskId: task.id,
    carriedFrom: task.date || date,
    updatedAt: new Date().toISOString()
  });
  state.tasks[taskId] = false;
  state.tasks[shiftedId] = false;
  return true;
}

function renderFocusBoard(tasks) {
  const phase = getCurrentPhase();
  const week = lastDaysEntries(7);
  const weekHours = sumMinutes(week, "total") / 60;
  const dueCount = reviewRows().filter((item) => isReviewDue(item)).length;
  const primary = tasks[0];
  const support = tasks.slice(1, 3);
  const weekPercent = phase.weeklyTarget ? Math.min(100, Math.round(weekHours / phase.weeklyTarget * 100)) : 0;

  setText("focusPrimarySubject", primary ? primary.subject : "未生成");
  setText("focusPrimaryTask", primary ? primary.text : "进入今日页生成任务。");
  setText("focusPrimaryTime", primary ? `${primary.minutes}m` : "--m");
  setText("focusReviewCount", `${dueCount} 项`);
  setText("focusPace", `${weekHours.toFixed(1)}h / ${phase.weeklyTarget}h`);
    setText("focusRecordHint", dueCount ? "先处理到期复盘。" : "完成后保存记录。");
  setStyleWidth("focusWeekFill", `${weekPercent}%`);

  const supportNode = document.getElementById("focusSupportTasks");
  if (supportNode) {
    supportNode.innerHTML = support.length ? support.map((task) => `
      <div>
        <strong>${escapeHtml(task.subject)}</strong>
        <span>${Number(task.minutes) || 0}m</span>
      </div>
      <p>${escapeHtml(task.text)}</p>
    `).join("") : `<p>今天先完成主任务，再决定是否加量。</p>`;
  }
}

function buildDailyTasks(force = false, date = planTodayISO(), options = {}) {
  const shouldPersist = options.persist === true;
  ensurePlanContainers();
  const hasPlannedDate = Object.prototype.hasOwnProperty.call(state.weekPlans, date);
  const existing = planTasksForDate(date);
  if (hasPlannedDate && !existing.length && !force) return taskBuildResult([], true, options);
  let carried = [];
  if (date === planTodayISO()) {
    const budget = dailyBudgetMinutes(date);
    const carryLimit = carryoverLimitForBudget(budget, state.settings.taskCount || 3);
    carried = collectCarryoverTasks(state.weekPlans, state.tasks, date, {
      limit: carryLimit,
      maxMinutes: carryLimit >= 2 ? 75 : 90
    });
    if (carried.length) markCarriedSourceTasks(state.weekPlans, carried, state.tasks);
  }
  const existingCarrySources = new Set(existing.map((task) => task.sourceTaskId || ""));
  carried = carried.filter((task) => !existingCarrySources.has(task.sourceTaskId));
  const activeExisting = normalizeTaskList([...existing, ...carried], date).filter((task) => task.status !== "shifted");
  const hasNewCarryover = carried.length > 0;
  if (activeExisting.length && !force && !hasNewCarryover) {
    const shiftedExisting = normalizeTaskList(existing, date).filter((task) => task.status === "shifted");
    state.weekPlans[date] = normalizeTaskList([...shiftedExisting, ...activeExisting], date);
    state.weekPlans[date].forEach((task) => {
      if (typeof state.tasks[task.id] === "undefined") state.tasks[task.id] = task.status === "done";
    });
    return taskBuildResult(activeExisting, true, options);
  }
  const locked = existing.filter((task) => task.locked);
  const lockedActive = [...locked, ...carried].filter((task) => task.status !== "shifted");
  const generated = createDailyTasks(date);
  const targetCount = targetTaskCountForDate(date);
  const merged = [...lockedActive];
  const budget = dailyBudgetMinutes(date);
  generated.forEach((task) => {
    if (merged.length >= targetCount) return;
    if (!merged.some((item) => item.subject === task.subject && item.text === task.text)) merged.push(task);
  });
  const nextTasks = normalizeTaskList(trimTasksToBudget(merged.slice(0, targetCount), budget, targetCount), date);
  const nextIds = new Set(nextTasks.map((task) => task.id));
  existing
    .filter((task) => task.status !== "shifted" && !task.locked && !nextIds.has(task.id))
    .forEach((task) => markDeleted("tasks", task.id));
  const shiftedExisting = existing.filter((task) => task.status === "shifted");
  state.weekPlans[date] = normalizeTaskList([...shiftedExisting, ...nextTasks], date);
  state.weekPlans[date].forEach((task) => {
    unmarkDeleted("tasks", task.id);
    if (task.status === "shifted") state.tasks[task.id] = false;
    else if (typeof state.tasks[task.id] === "undefined") state.tasks[task.id] = task.status === "done";
  });
  const saved = shouldPersist ? saveState() : true;
  return taskBuildResult(state.weekPlans[date].filter((task) => task.status !== "shifted"), saved, options);
}

function taskBuildResult(tasks, saved = true, options = {}) {
  return options.withSaveResult ? { tasks, saved } : tasks;
}

function previewDailyTasks(date = planTodayISO()) {
  ensurePlanContainers();
  const previous = {
    weekPlans: clonePlainState(state.weekPlans),
    tasks: clonePlainState(state.tasks),
    deleted: clonePlainState(stateObject(state.deleted)),
    deletedMeta: clonePlainState(stateObject(state.deletedMeta))
  };
  try {
    return buildDailyTasks(false, date);
  } finally {
    state.weekPlans = previous.weekPlans;
    state.tasks = previous.tasks;
    state.deleted = previous.deleted;
    state.deletedMeta = previous.deletedMeta;
  }
}

function clonePlainState(value) {
  return cloneJson(value);
}

function carryoverLimitForBudget(budget, taskCount) {
  if (budget <= bottomLineMinutes(getCurrentPhase())) return 1;
  if (taskCount <= 3) return 1;
  return 2;
}

function targetTaskCountForDate(date = planTodayISO()) {
  ensureSettingsContainer();
  const controls = normalizePlanControls(state.settings.planControls);
  const base = Math.min(4, Math.max(3, state.settings.taskCount || 3));
  if (controls.planIntensity === "bottomline" || shouldUseMinimumDay(date)) return 2;
  if (controls.planIntensity === "strong") return 4;
  return base;
}

function createDailyTasks(date = planTodayISO()) {
  ensureSettingsContainer();
  const phase = getCurrentPhase(date);
  const controls = normalizePlanControls(state.settings.planControls);
  const weights = subjectPlanWeights(phase.id, controls);
  const weak = getWeakSubject();
  const topicMath = topicForDate("math", date);
  const topicCs = topicForDate("cs408", date);
  const topicEnglish = topicForDate("english", date);
  const topicPolitics = phase.quotas.politics ? topicForDate("politics", date) : null;
  const budget = dailyBudgetMinutes(date);
  const targetCount = targetTaskCountForDate(date);
  const dueItems = dueReviewItems(date);
  const reviewPressure = dueItems.length;
  const reviewCapacity = Math.max(1, Math.min(1, reviewPressure || 1, Math.floor(Math.max(controls.reviewLoad, budget * 0.25) / controls.reviewLoad)));
  const tasks = dueReviewTasks(date, reviewCapacity).map((task) => ({
    ...task,
    minutes: controls.reviewLoad,
    priority: 1
  }));

  const coreFloor = phase.id === "A" ? 35 : 45;
  const minutesFor = (key, floor, cap = 240) => Math.max(floor, Math.min(cap, roundToFive(budget * (weights[key] || 0))));
  const englishMinutes = minutesFor("english", 20, 70);
  const politicsMinutes = minutesFor("politics", 25, 75);
  const projectMinutes = minutesFor("project", 20, 60);
  const reviewReserve = controls.enabledSubjects.includes("review") && targetCount > 3 ? Math.max(15, roundToFive(budget * (weights.review || 0.08))) : 0;
  const politicsDay = Boolean(topicPolitics && weights.politics > 0 && parseDate(date).getDay() % 2 === 0);
  const englishReserve = controls.enabledSubjects.includes("english") ? Math.max(20, Math.min(englishMinutes, 45)) : 0;
  const nonCoreReserve = (politicsDay ? politicsMinutes : englishReserve) + reviewReserve;
  const minimumCore = Math.round(budget * (state.settings.coreRatio || 65) / 100);
  const coreMinutes = Math.max(coreFloor * 2, minimumCore, budget - nonCoreReserve);
  const coreWeight = (weights.math || 0) + (weights.cs408 || 0) || 1;
  const mathMinutes = Math.max(coreFloor, roundToFive(coreMinutes * ((weights.math || 0.5) / coreWeight)));
  const csMinutes = Math.max(coreFloor, roundToFive(coreMinutes * ((weights.cs408 || 0.5) / coreWeight)));

  if (controls.enabledSubjects.includes("math")) {
    tasks.push(topicTask(date, phase, "数学", topicMath, mathMinutes, "高数/线代/概率按阶段推进"));
  }
  if (controls.enabledSubjects.includes("cs408")) {
    tasks.push(topicTask(date, phase, "408", topicCs, csMinutes, "按数据结构、计组、OS、计网推进"));
  }
  if (topicPolitics && politicsDay && controls.enabledSubjects.includes("politics")) {
    tasks.push(topicTask(date, phase, "政治", topicPolitics, politicsMinutes, "基础框架、选择题、背诵"));
  } else if (controls.enabledSubjects.includes("english")) {
    tasks.push(englishTaskForDate(date, phase, topicEnglish, englishMinutes));
  }

  if (topicPolitics && !politicsDay && controls.enabledSubjects.includes("politics") && tasks.length < targetCount) {
    tasks.push(topicTask(date, phase, "政治", topicPolitics, politicsMinutes, "基础框架、选择题、背诵"));
  } else if (controls.enabledSubjects.includes("review") && tasks.length < targetCount) {
    tasks.push({
      id: `${date}-${phase.id}-review`,
      subject: "复盘",
      text: "回炉本周错题，写出错因和下次识别信号",
      minutes: Math.max(15, reviewReserve || roundToFive(budget * (weights.review || 0.08))),
      priority: 8
    });
  }

  ensureEnglishDripTask(tasks, {
    date,
    phase,
    topic: topicEnglish,
    minutes: Math.max(20, Math.min(englishMinutes, 35)),
    controls,
    targetCount,
    reviewPressure
  });

  if (weights.project > 0 && controls.enabledSubjects.includes("project") && tasks.length < targetCount) {
    tasks.push({
      id: `${date}-${phase.id}-project`,
      subject: "项目",
      text: "推进复试项目最小可展示功能或补 README 证据",
      minutes: projectMinutes,
      priority: 9
    });
  }

  if (weak && controls.enabledSubjects.includes(subjectKey(weak.label)) && tasks.length < targetCount + 1) {
    tasks.push({
      id: `${date}-weak-${weak.key}`,
      subject: "补弱",
      text: `${weak.label} 本周低于配额，补 30 分钟核心任务`,
      minutes: 30,
      priority: 7
    });
  }

  customTaskRows().slice(0, 2).forEach((custom) => {
    if (tasks.length < targetCount && controls.enabledSubjects.includes(subjectKey(custom.subject)) && !tasks.some((task) => task.text === custom.text)) {
      tasks.push({
        id: `${date}-custom-${custom.id}`,
        subject: custom.subject,
        text: custom.text,
        minutes: custom.minutes,
        priority: 6
      });
    }
  });

  const effectiveControls = reviewPressure >= 3
    ? { ...controls, maxNewTopics: Math.min(controls.maxNewTopics, 2) }
    : controls;
  const effectiveTargetCount = controls.enabledSubjects.includes("english") && reviewPressure > 0
    ? Math.min(4, Math.max(targetCount + 1, targetCount))
    : targetCount;
  return applyPlanControls(trimTasksToBudget(tasks.filter(Boolean), budget, Math.max(effectiveTargetCount, tasks.length)), {
    controls: effectiveControls,
    targetCount: effectiveTargetCount,
    budget
  }).map((task, index) => ({
    ...task,
    date,
    priority: task.priority || index + 1,
    status: task.status === "shifted" ? "shifted" : task.status === "done" ? "done" : "todo",
    locked: sanitizeBoolean(task.locked),
    source: task.source || "generated"
  }));
}

function englishTaskForDate(date, phase, topic, minutes) {
  const task = topicTask(date, phase, "英语", topic, minutes, "单词、长难句、真题阅读");
  return {
    ...task,
    priority: 3.5,
    text: `${task.text}；新词 20 + 复习词 60 + 错词 10，至少留 1 句定位/切分证据`
  };
}

function ensureEnglishDripTask(tasks, options) {
  const { date, phase, topic, minutes, controls, targetCount, reviewPressure } = options;
  if (!controls.enabledSubjects.includes("english")) return;
  if (tasks.some((task) => task.subject === "英语")) return;
  if (targetCount <= 2 && reviewPressure >= 2) return;
  const task = englishTaskForDate(date, phase, topic, minutes);
  task.id = `${date}-${phase.id}-english-drip`;
  task.priority = reviewPressure ? 5 : 4;
  task.source = "english-drip";
  tasks.push(task);
}

function normalizeTaskList(tasks, date) {
  return stateArray(tasks).filter(isPlainStateObject).map((task, index) => ({
    id: task.id || `${date}-${index}-${task.subject}`,
    date,
    subject: task.subject,
    text: task.text,
    topicId: task.topicId || "",
    minutes: task.minutes || 0,
    priority: task.priority || index + 1,
    status: task.status === "shifted" ? "shifted" : task.status === "done" ? "done" : "todo",
    locked: sanitizeBoolean(task.locked),
    source: task.source || "generated",
    sourceTaskId: task.sourceTaskId || "",
    carriedFrom: task.carriedFrom || "",
    shiftedTo: task.shiftedTo || "",
    reviewItemId: task.reviewItemId || "",
    completedAt: task.completedAt || "",
    recordApplied: sanitizeBoolean(task.recordApplied),
    recordImpact: normalizeTaskRecordImpact(task.recordImpact)
  }))
    .sort((a, b) => {
      if (a.status === "shifted" && b.status !== "shifted") return 1;
      if (b.status === "shifted" && a.status !== "shifted") return -1;
      if (a.source === "carryover" && b.source !== "carryover") return -1;
      if (b.source === "carryover" && a.source !== "carryover") return 1;
      return a.priority - b.priority;
    })
    .map((task, index) => ({ ...task, priority: task.status === "shifted" ? task.priority : index + 1 }));
}

function dailyBudgetMinutes(date = planTodayISO()) {
  ensureSettingsContainer();
  const phase = getCurrentPhase(date);
  const controls = normalizePlanControls(state.settings.planControls);
  const day = parseDate(date).getDay();
  const isWeekend = day === 0 || day === 6;
  const ramp = rampBudgetForDate(date);
  const settingCap = isWeekend ? state.settings.weekendMinutes : state.settings.weekdayMinutes;
  const rampCap = isWeekend ? ramp.weekend : ramp.weekday;
  const current = parseDate(date);
  const earlyRampEnd = parseDate("2026-09-27");
  const userCap = current <= earlyRampEnd ? Math.min(settingCap || rampCap, rampCap) : Math.max(settingCap, rampCap);
  const floor = bottomLineMinutes(phase);
  const normalBudget = phase.id === "A" ? Math.min(userCap, Math.max(Math.min(floor, userCap), rampCap)) : Math.max(floor, userCap);
  if (controls.planIntensity === "bottomline" || shouldUseMinimumDay(date)) return Math.min(normalBudget, floor);
  if (controls.planIntensity === "strong") return Math.min(Math.round(normalBudget * 1.18), Math.max(normalBudget, userCap + 60));
  return normalBudget;
}

function rampBudgetForDate(date = planTodayISO()) {
  const current = parseDate(date);
  if (current < parseDate(rampBudgets[0].start)) return rampBudgets[0];
  return rampBudgets.find((item) => current >= parseDate(item.start) && current <= parseDate(item.end)) || rampBudgets[rampBudgets.length - 1];
}

function shouldUseMinimumDay(date = planTodayISO()) {
  const cursor = parseDate(date);
  let lowDays = 0;
  for (let index = 1; index <= 3; index += 1) {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() - index);
    const entry = entryRow(formatDateISO(day));
    if (!entry) continue;
    const total = getEntryTotals(entry).total;
    if (total > 0 && total < 120) lowDays += 1;
  }
  return lowDays >= 2;
}

function bottomLineMinutes(phase = getCurrentPhase()) {
  if (phase.id === "A") return 90;
  return 45 + 45 + 20 + (phase.quotas.politics ? 20 : 0) + 10;
}

function trimTasksToBudget(tasks, budget, targetCount) {
  const hardBudget = Math.max(0, budget || 0);
  const hasCarryover = tasks.some((task) => task.source === "carryover");
  const hasEnglish = tasks.some((task) => task.subject === "英语");
  const desiredCount = Math.min(targetCount, tasks.length);
  const minCount = Math.min(desiredCount, hasCarryover ? 2 : hasEnglish ? 4 : 3);
  let selected = tasks.slice(0, Math.min(6, Math.max(minCount, targetCount)));
  while (selected.length > minCount && selected.reduce((sum, task) => sum + task.minutes, 0) > hardBudget) {
    selected.splice(findLowestValueTaskIndex(selected), 1);
  }
  const total = selected.reduce((sum, task) => sum + task.minutes, 0);
  if (total > hardBudget && total > 0) {
    const scale = hardBudget / total;
    selected = selected.map((task) => {
      const floor = task.subject === "数学" || task.subject === "408" ? 30 : task.subject === "复盘" ? 15 : 15;
      return { ...task, minutes: Math.max(floor, floorToFive(task.minutes * scale)) };
    });
  }
  while (selected.length > 1 && selected.reduce((sum, task) => sum + task.minutes, 0) > hardBudget) {
    const removableIndex = findLowestValueTaskIndex(selected);
    selected.splice(removableIndex, 1);
  }
  return selected;
}

function findLowestValueTaskIndex(tasks) {
  const rank = { "项目": 6, "政治": 5, "英语": 4, "补弱": 3, "数学": 2, "408": 2, "复盘": 1 };
  let index = tasks.length - 1;
  let worst = -1;
  tasks.forEach((task, taskIndex) => {
    const score = (rank[task.subject] || 3) * 1000 + (task.priority || taskIndex);
    if (task.source === "carryover" || task.reviewItemId) return;
    if (score >= worst) {
      worst = score;
      index = taskIndex;
    }
  });
  return index;
}

function roundToFive(value) {
  return Math.round(value / 5) * 5;
}

function floorToFive(value) {
  return Math.floor(value / 5) * 5;
}

function taskBlueprint(task) {
  return taskBlueprints[task.subject] || taskBlueprints["复盘"];
}

function renderPlanCards(tasks) {
  return tasks.map((task, index) => {
    const blueprint = taskBlueprint(task);
    const method = subjectMethods[task.subject] || subjectMethods["复盘"];
    const phase = getCurrentPhase(task.date || planTodayISO());
    const prescription = phaseSubjectPlan(phase.id, task.subject);
    const protocol = dailyStudyProtocols[task.subject] || dailyStudyProtocols["复盘"];
    const checked = isTaskDone(task, state.tasks) ? "checked" : "";
    const featured = index === 0 ? "primary-task" : "";
    const carryover = task.source === "carryover" ? "carryover-task" : "";
    const acceptance = subjectAcceptanceRules[task.subject] || subjectAcceptanceRules["复盘"];
    const reviewWindow = task.reviewItemId
      ? "本项为到期复盘；闭卷完成后记录结果，失败则次日短复盘。"
      : prescription?.review || "完成后进入默认复盘检查点；通过后拉长，失败时缩短到 D+1。";
    const sourceText = prescription?.resource || blueprint.resource || "使用当前科目的唯一主线资料；只有主线完成 70% 后才评估补充资料。";
    const prerequisite = blueprint.prerequisite || "先确认前一考点能闭卷说出定义与第一步；不能提取时先补前置。";
    const basis = blueprint.basis || "主动回忆、分散复盘和可验收产出；不把观看或划线当作完成。";
    const outputText = prescription?.output || blueprint.output.replace(/^交付：/, "");
    const acceptanceText = prescription?.pass || `${acceptance.standard} ${acceptance.high}`;
    const dailyAction = prescription?.dailyTask || method.practice;
    return `
      <article class="plan-card ${checked ? "done" : ""} ${featured} ${carryover}">
        <div class="plan-index">${index + 1}</div>
        <div>
          <div class="plan-head">
            <label class="plan-check">
              <input type="checkbox" data-task="${escapeAttr(task.id)}" ${checked}>
              <strong>${escapeHtml(task.subject)}</strong>
            </label>
            <span>${Number(task.minutes) || 0} 分钟</span>
          </div>
          <div class="plan-meta-line">
            <em>${task.source === "carryover" ? `顺延自 ${escapeHtml(task.carriedFrom || "前序任务")}` : index === 0 ? "当前主任务" : "支撑任务"}</em>
            <em>${escapeHtml(blueprint.metric)}</em>
          </div>
          <p>${escapeHtml(task.text)}</p>
          <div class="plan-output density-balanced-only"><strong>交付</strong>${escapeHtml(outputText)}</div>
          <details class="plan-detail density-balanced-only">
            <summary>执行方法与验收</summary>
            <ul>
              <li>${escapeHtml(dailyAction)}</li>
              <li>${escapeHtml(protocol.volume)}</li>
              <li>${escapeHtml(acceptanceText)}</li>
            </ul>
          </details>
          ${renderCaptureForm(task)}
          <section class="plan-diagnostic density-detail-only" aria-label="${escapeAttr(task.subject)}任务详尽说明">
            <div class="plan-diagnostic-grid">
              <article><span>阶段目标</span><p>阶段 ${escapeHtml(phase.id)} · ${escapeHtml(phasePlanById(phase.id).mission)}</p></article>
              <article><span>前置</span><p>${escapeHtml(prerequisite)}</p></article>
              <article class="wide"><span>执行步骤</span><p>${escapeHtml(dailyAction)}</p></article>
              <article class="wide"><span>学习块</span><ol>${protocol.blocks.map(([label, ratio, action]) => `<li><strong>${escapeHtml(label)} ${escapeHtml(ratio)}</strong>${escapeHtml(action)}</li>`).join("")}</ol></article>
              <article><span>资料章节</span><p>${escapeHtml(prescription?.scope || task.text)}</p></article>
              <article><span>交付物</span><p>${escapeHtml(outputText)}</p></article>
              <article><span>验收线</span><p>${escapeHtml(acceptanceText)}</p></article>
              <article><span>时间预算</span><p>${Number(task.minutes) || 0} 分钟；到点先验收，未完成只顺延核心步骤。</p></article>
              <article><span>复盘窗口</span><p>${escapeHtml(reviewWindow)}</p></article>
              <article><span>资料使用规则</span><p>${escapeHtml(sourceText)}</p></article>
              <article><span>方法依据</span><p>${escapeHtml(basis)}</p></article>
            </div>
          </section>
        </div>
      </article>
    `;
  }).join("");
}

function renderDailyOperatingConsole(tasks, date = planTodayISO()) {
  const container = document.getElementById("dailyOperatingConsole");
  if (!container) return;
  const controls = normalizePlanControls(state.settings.planControls);
  const load = dailyLoadTemplates.find((item) => item.key === controls.planIntensity) || dailyLoadTemplates[1];
  const role = weeklyCycleForDate(date);
  const openTask = tasks.find((task) => !isTaskDone(task, state.tasks)) || tasks[0];
  const total = tasks.reduce((sum, task) => sum + (Number(task.minutes) || 0), 0);
  const startup = startup28DayPlan.find((item) => item.date === date);
  const startupLabel = startup ? `启动第 ${startup.day} 天 · ${startup.load}` : `${role.label} · ${role.role}`;
  const startupTasks = startup?.blocks.map(([subject, minutes, action, output]) => `
    <article><div><strong>${escapeHtml(subject)}</strong><span>${Number(minutes) || 0}m</span></div><p>${escapeHtml(action)}</p><em>${escapeHtml(output)}</em></article>
  `).join("") || "";
  container.innerHTML = `
    <section class="operating-focus density-focus-only" aria-label="专注模式今日动作">
      <div><span>${escapeHtml(startupLabel)}</span><strong>${escapeHtml(openTask?.subject || "先完成启动校准")} · ${Number(openTask?.minutes) || 0}m</strong></div>
      <p>${escapeHtml(openTask?.text || dailyOperatingSchedule[0].action)}</p>
      <em><strong>停手线</strong>${escapeHtml(role.stopRule)}</em>
    </section>
    <section class="operating-balanced density-balanced-only" aria-label="平衡模式今日执行流程">
      <header><div><span>${escapeHtml(startupLabel)}</span><strong>${escapeHtml(load.label)} · 计划 ${total}m</strong></div><p>${escapeHtml(load.buffer)}</p></header>
      <div class="operating-rail">
        ${dailyOperatingSchedule.map((step, index) => `
          <article><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(step.window)}</span><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.action)}</p></article>
        `).join("")}
      </div>
      <footer><strong>今日停手线</strong><span>${escapeHtml(role.stopRule)}</span></footer>
    </section>
    <section class="operating-detail density-detail-only" aria-label="详尽模式今日执行协议">
      <header><div><span>${escapeHtml(startupLabel)}</span><strong>今日执行协议</strong><p>${escapeHtml(load.allocation)}</p></div><div><span>启用条件</span><p>${escapeHtml(load.trigger)}</p></div></header>
      ${startup ? `<div class="startup-today-strip"><strong>今天逐项完成</strong><div>${startupTasks}</div><p><span>复盘</span>${escapeHtml(startup.review)}</p><p><span>缓冲 ${startup.bufferMinutes}m</span>${escapeHtml(startup.stopRule)}</p></div>` : ""}
      <div class="operating-table">
        <div class="operating-table-head"><span>时段</span><span>动作</span><span>必须留下</span></div>
        ${dailyOperatingSchedule.map((step) => `
          <article><div><span>${escapeHtml(step.window)}</span><strong>${escapeHtml(step.label)}</strong></div><p>${escapeHtml(step.action)}</p><em>${escapeHtml(step.output)}</em></article>
        `).join("")}
      </div>
      <footer><p><strong>缓冲</strong>${escapeHtml(role.buffer)}</p><p><strong>停手</strong>${escapeHtml(role.stopRule)}</p></footer>
    </section>
  `;
}

function renderDailyTaskProgress(tasks) {
  const container = document.getElementById("dailyTaskProgress");
  if (!container) return;
  const done = tasks.filter((task) => isTaskDone(task, state.tasks)).length;
  const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const minutes = tasks.reduce((sum, task) => sum + (isTaskDone(task, state.tasks) ? task.minutes : 0), 0);
  container.innerHTML = `
    <div class="daily-progress-head">
      <strong>今日完成 ${done}/${tasks.length}</strong>
      <span>${minutes} 分钟已完成 · ${percent}%</span>
    </div>
    <div class="progress-track slim"><div class="progress-fill" data-fill="${percent}"></div></div>
  `;
}

function renderScienceProtocol(tasks, date = planTodayISO()) {
  const container = document.getElementById("scienceProtocol");
  if (!container) return;
  const total = tasks.reduce((sum, task) => sum + (task.minutes || 0), 0);
  const reviewDue = dueReviewItems(date).length;
  const coreMinutes = tasks
    .filter((task) => task.subject === "数学" || task.subject === "408")
    .reduce((sum, task) => sum + (task.minutes || 0), 0);
  const coreRatio = total ? Math.round(coreMinutes / total * 100) : 0;
  const hasEnglish = tasks.some((task) => task.subject === "英语");
  const dayRole = weeklyCycleForDate(date);
  const spacingRule = learningScienceRules.find((item) => item.key === "spacing");
  const rows = [
    ["主动回忆", tasks.some((task) => ["数学", "408", "复盘"].includes(task.subject)) ? "已安排" : "需补", "题量、闭卷重做、过程图优先。"],
    ["自适应复盘", reviewDue ? `${reviewDue} 项到期` : "队列健康", reviewDue ? "只抽取最高优先级；失败缩短间隔并减少新内容。" : spacingRule?.guardrail || "默认检查点会按表现调整。"],
    ["英语不断档", hasEnglish ? "已保留" : "需手动补", "最低 20 分钟：新词、复习词、错词和 1 句定位。"],
    ["核心占比", `${coreRatio}%`, `目标 ${state.settings.coreRatio || 65}% 左右，低负荷日先守数学和 408。`],
    ["今日节律", dayRole.role, `${dayRole.action} ${dayRole.output}`]
  ];
  container.innerHTML = `
    <div class="science-head">
      <span>学习科学协议</span>
      <strong>${tasks.length} 项 · ${total}m</strong>
    </div>
    <div class="science-checks">
      ${rows.map(([label, value, text]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <p>${escapeHtml(text)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderEnglishDrip(tasks, date = planTodayISO()) {
  const container = document.getElementById("englishDrip");
  if (!container) return;
  const englishTask = tasks.find((task) => task.subject === "英语");
  const topic = topicForDate("english", date);
  const entry = entryRow(date) || {};
  const minutes = sanitizeNumber(entry.english);
  const reading = sanitizeNumber(entry.reading);
  const streak = englishStreak(date);
  const planText = englishTask
    ? englishTask.text
    : topic
      ? `微积累${topic.group}：${topic.topic}`
      : "微积累单词 + 长难句 + 阅读定位";
  container.innerHTML = `
    <div class="english-drip-head">
      <span>英语细水长流</span>
      <strong>${streak} 天</strong>
    </div>
    <p>${escapeHtml(planText)}</p>
    <div class="english-drip-steps">
      <em>新词20</em>
      <em>复习60</em>
      <em>错词10</em>
      <em>定位1句</em>
    </div>
    <div class="english-drip-foot">
      <span>今日记录 ${minutes}m</span>
      <span>阅读 ${reading} 篇</span>
    </div>
  `;
}

function englishStreak(date = planTodayISO()) {
  let streak = 0;
  const cursor = parseDate(date);
  while (true) {
    const iso = formatDateISO(cursor);
    const entry = entryRow(iso);
    if (!entry || sanitizeNumber(entry.english) < 15) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderTaskFlow(tasks) {
  return tasks.map((task, index) => {
    const blueprint = taskBlueprint(task);
    return `
      <article class="task-flow-card">
        <div class="flow-index">${index + 1}</div>
        <div>
          <div class="flow-head">
            <strong>${escapeHtml(task.subject)}</strong>
            <span>${Number(task.minutes) || 0}m</span>
          </div>
          <p>${escapeHtml(task.text)}</p>
          <div class="flow-steps">
            ${blueprint.steps.map((step) => `<em>${escapeHtml(step)}</em>`).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function topicForDate(subject, date = planTodayISO()) {
  const curated = firstMonthTopicOverride(subject, date);
  if (curated) return curated;
  const candidates = nextTopics(subject, 30);
  const dayOffset = Math.max(0, Math.floor((parseDate(date) - parseDate(planTodayISO())) / 86400000));
  return candidates[Math.min(dayOffset, Math.max(0, candidates.length - 1))] || candidates[0];
}

function firstMonthTopicOverride(subject, date = planTodayISO()) {
  const start = parseDate(PLAN_START_DATE);
  const current = parseDate(date);
  const index = Math.floor((current - start) / 86400000);
  const sequence = foundationDailySequence[subject];
  if (!sequence || index < 0 || index >= sequence.length) return null;
  const [group, topic] = sequence[index];
  const subjectTitle = { math: "数学一", cs408: "408", english: "英语一", politics: "政治" }[subject] || subject;
  return manualTopic(subjectTitle, group, topic);
}

function manualTopic(subjectTitle, group, topic) {
  return {
    id: `${subjectTitle}/${group}/${topic}`,
    group,
    topic,
    state: 0
  };
}

function topicTask(date, phase, subject, topic, minutes, fallback) {
  const detail = topic ? `${topic.group}：${topic.topic}` : fallback;
  const stateLabel = topic && topic.state === 1 ? "复盘" : "推进";
  const prescription = phaseSubjectPlan(phase.id, subject);
  const action = prescription?.dailyTask ? `；${prescription.dailyTask}` : "";
  return {
    id: `${date}-${phase.id}-${subject}-${topic ? topic.id : "fallback"}`,
    subject,
    text: `${stateLabel}${detail}${action}`,
    minutes
  };
}

function scheduleReviewForTask(taskId, task) {
  ensureSettingsContainer();
  const reviews = reviewRows();
  if (!task || reviews.some((item) => item.sourceTaskId === taskId)) return;
  const base = parseDate(task.date || planTodayISO());
  const items = state.settings.reviewDays.map((days) => {
    const due = new Date(base);
    due.setDate(base.getDate() + days);
    return {
      id: `${taskId}-r${days}`,
      sourceTaskId: taskId,
      subject: task.subject,
      text: task.text,
      round: `D+${days}`,
      dueDate: formatDateISO(due),
      status: "due",
      done: false,
      delayCount: 0,
      failureReason: "",
      quality: 0
    };
  });
  reviews.push(...items);
}

function dueReviewItems(date = planTodayISO()) {
  return reviewRows()
    .filter((item) => isReviewDue(item, date))
    .sort((a, b) => {
      const dateCompare = (sanitizeDateKey(a.dueDate) || "9999-12-31").localeCompare(sanitizeDateKey(b.dueDate) || "9999-12-31");
      if (dateCompare) return dateCompare;
      return reviewRoundWeight(a.round) - reviewRoundWeight(b.round);
    });
}

function reviewRoundWeight(round = "") {
  const text = sanitizeText(round, "", 40);
  if (text.includes("短")) return 0;
  const day = Number((text.match(/D\+(\d+)/) || [])[1]);
  return Number.isFinite(day) ? day : 99;
}

function isActiveReviewItem(item) {
  return Boolean(item) && !item.done && !["done", "failed"].includes(item.status);
}

function isReviewDue(item, date = planTodayISO()) {
  const dueDate = sanitizeDateKey(item?.dueDate);
  const today = sanitizeDateKey(date) || planTodayISO();
  return isActiveReviewItem(item) && Boolean(dueDate && dueDate <= today);
}

function isReviewUpcoming(item, date = planTodayISO()) {
  const dueDate = sanitizeDateKey(item?.dueDate);
  const today = sanitizeDateKey(date) || planTodayISO();
  return isActiveReviewItem(item) && Boolean(dueDate && dueDate > today);
}

function stampReviewResult(item, result = "") {
  const now = new Date().toISOString();
  if (result) item.lastResult = result;
  item.lastSubmittedDate = planTodayISO();
  item.updatedAt = now;
  return now;
}

function dueReviewTasks(date = planTodayISO(), limit = 1) {
  return dueReviewItems(date)
    .slice(0, Math.max(1, limit))
    .map((item) => ({
      id: `review-${item.id}`,
      subject: "复盘",
      text: `${item.round}：${item.subject} · ${item.text}；闭卷重做并写出二次错因`,
      minutes: 25,
      reviewItemId: item.id
    }));
}

function renderReviewQueue() {
  const planDate = planTodayISO();
  const reviews = reviewRows();
  const due = reviews.filter((item) => isReviewDue(item, planDate));
  const upcoming = reviews.filter((item) => isReviewUpcoming(item, planDate)).slice(0, 8);
  const todayHtml = due.length ? due.map(renderReviewItem).join("") : `<div class="empty-state">今天没有到期复盘。完成任务后会自动安排 D+1/D+3/D+7/D+14/D+30。</div>`;
  document.getElementById("reviewQueue").innerHTML = todayHtml;
  document.getElementById("spacedReviewList").innerHTML = [...due, ...upcoming].length ? [...due, ...upcoming].map(renderReviewItem).join("") : `<div class="empty-state">复盘队列为空。先完成今日任务，系统会自动生成复盘。</div>`;
  renderReviewPolicy(due.length, upcoming.length);
  setText("navReviewDue", `${due.length} 到期`);

  document.querySelectorAll("[data-review-done]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!completeReview(button.dataset.reviewDone, 4)) {
        setAuthResult("idle", "无需处理复盘", "这条复盘已处理或不在到期队列。");
        return;
      }
      const saved = saveState();
      renderReviewQueue();
      renderDashboard();
      setLocalSaveResult(saved, "复盘已完成", "已从到期队列移除，并记录完成时间。", "复盘完成未写入本机缓存");
    });
  });
  document.querySelectorAll("[data-review-delay]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!delayReview(button.dataset.reviewDelay, Number(button.dataset.days) || 1)) {
        setAuthResult("idle", "无需顺延复盘", "这条复盘已处理或不在到期队列。");
        return;
      }
      const saved = saveState();
      renderReviewQueue();
      setLocalSaveResult(saved, "复盘已顺延", "已更新到期日，后续会重新进入复盘队列。", "复盘顺延未写入本机缓存");
    });
  });
  document.querySelectorAll("[data-review-fail]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".review-queue-item");
      const reason = card?.querySelector("[data-review-reason]")?.value || "";
      if (!failReview(button.dataset.reviewFail, reason)) return;
      const saved = saveState();
      renderReviewQueue();
      setLocalSaveResult(saved, "失败已记录", "已安排短复盘，并保留失败原因。", "复盘失败记录未写入本机缓存");
    });
  });
  document.querySelectorAll("[data-review-grade]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".review-queue-item");
      const reason = card?.querySelector("[data-review-reason]")?.value || "";
      if (!gradeReview(button.dataset.reviewGrade, button.dataset.grade, reason)) return;
      const saved = saveState();
      renderReviewQueue();
      renderDashboard();
      const effect = reviewGradeEffect(button.dataset.grade);
      setLocalSaveResult(saved, effect.passed ? "复盘已通过" : "已缩短间隔", effect.leech ? "同一来源已失败 3 次，先减少新内容。" : "复盘结果已写入本机。", "复盘结果未写入本机缓存");
    });
  });
}

function completeReview(id, quality = 4) {
  const item = reviewRows().find((review) => review.id === id);
  if (!isReviewDue(item)) return false;
  const timestamp = stampReviewResult(item, "pass");
  item.done = true;
  item.status = "done";
  item.quality = sanitizeInteger(quality, 1, 5);
  item.completedAt = timestamp;
  if (item.quality <= 2) cloneShortReview(item, "低质量复盘");
  return true;
}

function delayReview(id, days) {
  const item = reviewRows().find((review) => review.id === id);
  if (!isReviewDue(item)) return false;
  const delayDays = sanitizeInteger(days, 1, 30);
  const due = parseDate(item.dueDate);
  due.setDate(due.getDate() + delayDays);
  item.dueDate = formatDateISO(due);
  item.delayCount = (item.delayCount || 0) + 1;
  item.status = "delayed";
  stampReviewResult(item, "delay");
  return true;
}

function failReview(id, reason = "") {
  const item = reviewRows().find((review) => review.id === id);
  if (!isReviewDue(item)) return false;
  const nextReason = String(reason || item.failureReason || "概念不清").trim();
  if (!isValidReviewFailureReason(nextReason)) {
    setAuthResult("error", "失败原因无效", "请写明需要回炉的原因。");
    return false;
  }
  return gradeReview(id, "again", nextReason);
}

function gradeReview(id, grade, reason = "") {
  const item = reviewRows().find((review) => review.id === id);
  if (!isReviewDue(item)) return false;
  const effect = reviewGradeEffect(grade, item.failStreak || 0);
  const timestamp = stampReviewResult(item, effect.passed ? "pass" : "fail");
  item.quality = effect.quality;
  item.completedAt = timestamp;
  item.failStreak = effect.failStreak;
  item.lastResult = REVIEW_GRADE_LABELS[grade] ? grade : "good";
  if (!effect.passed) {
    item.done = true;
    item.status = "failed";
    item.failureReason = String(reason || item.failureReason || "需要回炉").trim();
    item.leech = effect.leech;
    cloneShortReview(item, item.failureReason);
    return true;
  }
  item.done = true;
  item.status = "done";
  item.leech = false;
  return true;
}

const REVIEW_GRADE_LABELS = {
  again: "再次",
  hard: "困难",
  good: "良好",
  easy: "简单"
};

function isValidReviewFailureReason(reason) {
  return Boolean(reason && reason.trim());
}

function cloneShortReview(item, reason) {
  const due = addDays(parseDate(planTodayISO()), 1);
  const now = new Date().toISOString();
  reviewRows().push({
    id: `${item.id}-retry-${Date.now()}`,
    sourceTaskId: item.sourceTaskId,
    subject: item.subject,
    text: `${item.text}（回炉：${reason}）`,
    round: "D+1短复盘",
    dueDate: formatDateISO(due),
    status: "due",
    done: false,
    delayCount: 0,
    failureReason: reason,
    quality: 0,
    updatedAt: now
  });
}

function renderReviewPolicy(dueCount, upcomingCount) {
  const container = document.getElementById("reviewPolicy");
  if (!container) return;
  const rows = [
    ["到期", `${dueCount} 项`, "今天优先处理到期复盘，再开新内容。"],
    ["排队", `${upcomingCount} 项`, "未来复盘只保留轻量回炉，避免挤压数学和 408 主任务。"],
    ["间隔", state.settings.reviewDays.map((day) => `D+${day}`).join(" / "), "可在设置里调整，但不建议少于 4 轮。"],
    ...auditCadenceRules.map((item) => [item.label, item.value, item.text]),
    ...reviewOutcomeRules.map(([label, text]) => [label, "判定口径", text])
  ];
  container.innerHTML = rows.map(([label, value, text]) => `
    <div class="review-policy-row">
      <strong>${label}</strong>
      <span>${text}</span>
      <em>${value}</em>
    </div>
  `).join("");
}

function renderReviewItem(item) {
  const due = isReviewDue(item) ? "due" : "";
  const guide = reviewRoundGuide(item.round);
  return `
    <article class="review-queue-item ${due}">
      <div>
        <strong>${escapeHtml(item.round)} · ${escapeHtml(item.subject)}</strong>
        <p>${escapeHtml(item.text)}</p>
        <div class="review-guide">
          <span>${escapeHtml(guide.action)}</span>
          <span>通过：${escapeHtml(guide.pass)}</span>
          <span>未过：${escapeHtml(guide.fail)}</span>
        </div>
        <span>${escapeHtml(item.dueDate)}${item.failureReason ? ` · ${escapeHtml(item.failureReason)}` : ""}${item.leech ? " · 韭菜" : ""}</span>
      </div>
      <div class="review-actions">
        <label class="review-reason">回炉原因<input data-review-reason type="text" maxlength="80" value="${escapeAttr(item.failureReason || "")}" placeholder="概念不清"></label>
        <button type="button" data-review-grade="${escapeAttr(item.id)}" data-grade="again">再次</button>
        <button type="button" data-review-grade="${escapeAttr(item.id)}" data-grade="hard">困难</button>
        <button type="button" data-review-grade="${escapeAttr(item.id)}" data-grade="good">良好</button>
        <button type="button" data-review-grade="${escapeAttr(item.id)}" data-grade="easy">简单</button>
        <button type="button" data-review-done="${escapeAttr(item.id)}">完成</button>
        <button type="button" data-review-delay="${escapeAttr(item.id)}" data-days="1">+1</button>
        <button type="button" data-review-delay="${escapeAttr(item.id)}" data-days="3">+3</button>
        <button type="button" data-review-fail="${escapeAttr(item.id)}">失败</button>
      </div>
    </article>
  `;
}

function reviewRoundGuide(round = "") {
  const text = String(round);
  if (text.includes("30")) {
    return {
      action: "限时重做高频错题，并压缩成月度弱项清单。",
      pass: "不用答案仍能稳定完成。",
      fail: "降级为下月弱项，减少新内容。"
    };
  }
  if (text.includes("14")) {
    return {
      action: "从题目回到章节框架，补公式链或过程图。",
      pass: "能把错题挂回具体考纲小节。",
      fail: "标为需复盘，不进入已掌握。"
    };
  }
  if (text.includes("7")) {
    return {
      action: "合并同类错因，重做高频错题。",
      pass: "同类错误本周不再重复。",
      fail: "下周减少新增，先补同类题。"
    };
  }
  if (text.includes("3")) {
    return {
      action: "换一道同类题，验证题型识别。",
      pass: "不看答案能列出第一步和路线。",
      fail: "把错因归为概念、计算、条件或表达。"
    };
  }
  return {
    action: "闭卷重做当天错题或核心例题。",
    pass: "能说出定义、触发条件和第一步。",
    fail: "只补一个概念，明天短复盘。"
  };
}

function nextTopics(subject, limit = 3) {
  const data = syllabus[subject];
  if (!data) return [];
  const topics = [];
  data.groups.forEach(([group, groupTopics]) => {
    groupTopics.forEach((topic) => {
      const id = topicId(subject, group, topic);
      const stateValue = topicStateValue(id);
      if (stateValue < 2) {
        topics.push({ id, group, topic, state: stateValue });
      }
    });
  });
  return topics
    .sort((a, b) => b.state - a.state)
    .slice(0, limit);
}

function renderAcceptance(tasks) {
  const subjects = [...new Set(tasks.map((task) => task.subject || "复盘"))];
  const standards = subjects.map((subject) => [subject, subjectAcceptanceRules[subject] || subjectAcceptanceRules["复盘"]]);
  document.getElementById("acceptanceList").innerHTML = standards.map(([subject, rule]) => `
    <article class="acceptance-item">
      <strong>${escapeHtml(subject)}</strong>
      <div>
        <p><span>最低</span>${escapeHtml(rule.minimum)}</p>
        <p><span>标准</span>${escapeHtml(rule.standard)}</p>
        <p><span>高质量</span>${escapeHtml(rule.high)}</p>
      </div>
    </article>
  `).join("");
}

function renderCurrentPhasePlaybook() {
  const phase = getCurrentPhase();
  const playbook = phasePlanById(phase.id);
  const today = planTodayISO();
  const tasks = normalizeTaskList(planTasksForDate(today), today).filter((task) => task.status !== "shifted");
  const currentTask = tasks.find((task) => !isTaskDone(task, state.tasks)) || tasks[0];
  const prescription = currentTask ? phaseSubjectPlan(phase.id, currentTask.subject) : null;
  const role = weeklyCycleForDate(today);

  const focus = document.getElementById("phaseFocusLayout");
  if (focus) {
    focus.innerHTML = `
      <div class="phase-focus-head"><span>阶段 ${escapeHtml(playbook.id)} · ${escapeHtml(playbook.range)}</span><strong>${escapeHtml(playbook.name)}</strong></div>
      <p>${escapeHtml(playbook.mission)}</p>
      <div class="phase-next-action">
        <span>${escapeHtml(role.label)} · ${escapeHtml(role.role)}</span>
        <strong>${escapeHtml(currentTask?.text || role.action)}</strong>
        <em>${escapeHtml(prescription?.pass || playbook.exitGate[0])}</em>
      </div>
    `;
  }

  const operations = document.getElementById("phaseOperationsLayout");
  if (operations) {
    operations.innerHTML = `
      <header class="phase-operations-head">
        <div><span>当前阶段 ${escapeHtml(playbook.id)} · ${escapeHtml(playbook.duration)}</span><h3>${escapeHtml(playbook.name)}</h3><p>${escapeHtml(playbook.mission)}</p></div>
        <div><span>本周预算</span><strong>${escapeHtml(playbook.weeklyHours)}</strong><em>${escapeHtml(playbook.weeklyGoal)}</em></div>
      </header>
      <div class="phase-subject-board">
        ${playbook.subjects.map((item) => `
          <article><span>${escapeHtml(item.hours)}</span><strong>${escapeHtml(item.subject)}</strong><p>${escapeHtml(item.scope)}</p><em>${escapeHtml(item.output)}</em></article>
        `).join("")}
      </div>
      <div class="phase-gate-row"><span>进入条件</span><p>${escapeHtml(playbook.entryGate)}</p><span>本阶段过关</span><p>${escapeHtml(playbook.exitGate.join("；"))}</p></div>
    `;
  }

  const diagnostic = document.getElementById("phaseDiagnosticLayout");
  if (diagnostic) {
    diagnostic.innerHTML = `
      <header class="phase-diagnostic-head"><div><span>PHASE ${escapeHtml(playbook.id)}</span><h3>${escapeHtml(playbook.name)}</h3><p>${escapeHtml(playbook.range)} · ${escapeHtml(playbook.duration)} · ${escapeHtml(playbook.weeklyHours)}</p></div><strong>${playbook.exitGate.length} 个退出门</strong></header>
      <div class="phase-diagnostic-grid">
        <article><span>任务</span><p>${escapeHtml(playbook.mission)}</p></article>
        <article><span>入口</span><p>${escapeHtml(playbook.entryGate)}</p></article>
        <article><span>周配额</span><p>${escapeHtml(playbook.weeklyGoal)}</p></article>
        <article><span>今日角色</span><p>${escapeHtml(role.action)} ${escapeHtml(role.output)}</p></article>
        <article class="wide"><span>退出门</span><ol>${playbook.exitGate.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></article>
        <article class="wide"><span>触发式调参</span><ol>${playbook.adjustment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></article>
      </div>
    `;
  }
}

function renderPhaseDossier() {
  const container = document.getElementById("phaseDossier");
  if (!container) return;
  const activePhase = getCurrentPhase();
  container.innerHTML = detailedPhasePlans.map((phase) => `
    <details class="phase-file ${phase.id === activePhase.id ? "active" : ""}" ${phase.id === activePhase.id ? "open" : ""}>
      <summary>
        <span>阶段 ${escapeHtml(phase.id)}</span>
        <strong>${escapeHtml(phase.name)}</strong>
        <em>${escapeHtml(phase.range)} · ${escapeHtml(phase.weeklyHours)}</em>
      </summary>
      <div class="phase-file-body">
        <div class="phase-file-brief"><article><span>入口</span><p>${escapeHtml(phase.entryGate)}</p></article><article><span>任务</span><p>${escapeHtml(phase.mission)}</p></article><article><span>周目标</span><p>${escapeHtml(phase.weeklyGoal)}</p></article></div>
        <div class="phase-subject-table">
          ${phase.subjects.map((item) => `
            <article>
              <header><strong>${escapeHtml(item.subject)}</strong><span>${escapeHtml(item.hours)}</span></header>
              <dl>
                <div><dt>资料</dt><dd>${escapeHtml(item.resource)}</dd></div>
                <div><dt>章节</dt><dd>${escapeHtml(item.scope)}</dd></div>
                <div><dt>每日</dt><dd>${escapeHtml(item.dailyTask)}</dd></div>
                <div><dt>交付</dt><dd>${escapeHtml(item.output)}</dd></div>
                <div><dt>验收</dt><dd>${escapeHtml(item.pass)}</dd></div>
                <div><dt>复盘</dt><dd>${escapeHtml(item.review)}</dd></div>
              </dl>
            </article>
          `).join("")}
        </div>
        <div class="phase-file-footer"><div><span>退出门</span><ul>${phase.exitGate.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div><span>调参</span><ul>${phase.adjustment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div>
      </div>
    </details>
  `).join("");
}

function renderFoundation() {
  renderCurrentPhasePlaybook();
  renderPhaseDossier();
  renderLearningPath();
  renderWeekPath();
  document.getElementById("foundationGrid").innerHTML = foundationPlan.map((stage, index) => `
    <article class="foundation-card">
      <div class="foundation-index">${String(index).padStart(2, "0")}</div>
      <div class="foundation-body">
        <div class="foundation-meta">
          <span>${stage.weeks}</span>
          <em>Layer ${index}</em>
        </div>
        <h4>${stage.title}</h4>
        <p>${stage.goal}</p>
        <ul>${stage.tasks.map((item) => `<li>${item}</li>`).join("")}</ul>
        <strong class="foundation-pass">过关：${stage.pass}</strong>
      </div>
    </article>
  `).join("");
}

function renderFirstMonth() {
  const container = document.getElementById("firstMonthGrid");
  if (!container) return;
  container.innerHTML = renderStartupCalendarTemplate(startup28DayPlan, selectedStartupWeek);
  container.querySelectorAll("[data-startup-week]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStartupWeek = sanitizeInteger(button.dataset.startupWeek, 0, 3);
      renderFirstMonth();
    });
  });
}

function renderLearningPath() {
  const phase = getCurrentPhase();
  const activeIndex = Math.max(0, phases.findIndex((item) => item.id === phase.id));
  document.getElementById("pathRail").innerHTML = learningPath.map((step, index) => {
    const status = index < activeIndex ? "done" : index === activeIndex ? "active" : "";
    return `
      <article class="path-step ${status}">
        <div class="path-step-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="path-step-copy">
          <span>${step.range}</span>
          <strong>${step.name}</strong>
          <p>${step.goal}</p>
          <em>${step.deliverable}</em>
        </div>
      </article>
    `;
  }).join("");
}

function renderWeekPath() {
  const phase = getCurrentPhase();
  const ramp = rampBudgetForDate();
  const mathTopic = nextTopics("math", 1)[0];
  const csTopic = nextTopics("cs408", 1)[0];
  const englishTopic = nextTopics("english", 1)[0];
  const items = [
    ["1", "渐进时长", `${ramp.note}：工作日 ${ramp.weekday}m，周末 ${ramp.weekend}m。`],
    ["2", "主推数学", mathTopic ? `${mathTopic.group}：${mathTopic.topic}` : "回炉数学错题。"],
    ["3", "主推 408", csTopic ? `${csTopic.group}：${csTopic.topic}` : "回炉 408 错题。"],
    ["4", "英语不断", englishTopic ? `${englishTopic.group}：${englishTopic.topic}` : "单词和阅读保持。"],
    ["5", "周末复盘", `对照阶段 ${phase.id}：${phase.focus}`]
  ];
  document.getElementById("weekPath").innerHTML = items.map(([num, title, text]) => `
    <div class="week-step">
      <span>${num}</span>
      <div>
        <strong>${title}</strong>
        <p>${text}</p>
      </div>
    </div>
  `).join("");
}

function renderRecords() {
  renderRecordSummary();
  const month = document.getElementById("recordMonth")?.value || "";
  const records = entriesArray()
    .filter((entry) => !month || entry.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById("recordsTable").innerHTML = records.length ? records.map((entry) => {
    const coreRatio = entry.total ? Math.round(entry.core / entry.total * 100) : 0;
    const mistakeRatio = entry.newMistakes ? Math.round((entry.fixedMistakes || 0) / entry.newMistakes * 100) : "--";
    return `
      <article class="record-row">
        <div class="record-main">
          <strong>${escapeHtml(entry.date)}</strong>
          <span>${(entry.total / 60).toFixed(1)}h · 核心 ${coreRatio}% · 错题回炉 ${mistakeRatio}%</span>
        </div>
        <div class="record-detail">
          数学 ${entry.math || 0}m / ${entry.mathProblems || 0} 题 · 408 ${entry.cs408 || 0}m / ${entry.csProblems || 0} 题 · 英语 ${entry.english || 0}m / ${entry.reading || 0} 篇 · 政治 ${entry.politics || 0}m · 项目 ${entry.project || 0}m${entry.sleepHours ? ` · 睡眠 ${entry.sleepHours}h` : ""}
        </div>
        ${entry.nextTask ? `<div class="record-note">明日第一任务：${escapeHtml(entry.nextTask)}</div>` : ""}
        ${entry.note ? `<div class="record-note">备注：${escapeHtml(entry.note)}</div>` : ""}
        <div class="record-actions">
          <button class="edit-record" data-edit-record="${escapeAttr(entry.date)}">编辑</button>
          <button class="delete-record" data-delete-record="${escapeAttr(entry.date)}">删除</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-state">当前筛选下还没有记录。先去“今日任务”保存一条。</div>`;

  document.querySelectorAll("[data-edit-record]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("entryDate").value = button.dataset.editRecord;
      loadEntryForm();
      setRoute("today");
      showToast("已载入该日记录，可修改后保存。");
    });
  });

  document.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => {
      const date = button.dataset.deleteRecord;
      if (window.confirm(`确认删除 ${date} 的记录？`)) {
        createLocalSnapshot("before-delete-record");
        ensureLearningContainers();
        delete state.entries[date];
        markDeleted("records", date);
        const saved = saveState();
        renderAll();
        renderSnapshotPanel();
        setLocalSaveResult(saved, "记录已删除", "已保留删除前快照，可在账号面板恢复。", "记录删除未写入本机缓存");
      }
    });
  });
}

function switchView(viewId, options = {}) {
  if (!document.getElementById(viewId)) return;
  const previous = document.querySelector(".view.active");
  if (previous && previous.id !== viewId) {
    previous.classList.add("leaving");
    window.setTimeout(() => previous.classList.remove("leaving"), 160);
  }
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.view === viewId;
    item.classList.toggle("active", active);
    if (active) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === viewId;
    view.classList.toggle("active", active);
    view.hidden = !active;
    view.setAttribute("aria-hidden", String(!active));
  });
  const nav = [...document.querySelectorAll(".nav-item[data-view]")].find((item) => item.dataset.view === viewId);
  document.getElementById("viewTitle").textContent = nav ? nav.dataset.title || nav.textContent.trim() : "";
  const purpose = document.getElementById("viewPurpose");
  if (purpose) purpose.textContent = nav?.dataset.purpose || "";
  if (workspaceRenderer) renderAll(viewId);
  if (options.moveFocus) {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }
  scrollToTop();
}

function scrollToTop() {
  const resetScroll = () => {
    window.scrollTo(0, 0);
    document.getElementById("main-content")?.scrollTo(0, 0);
  };
  window.requestAnimationFrame(resetScroll);
  window.setTimeout(resetScroll, 60);
  window.setTimeout(resetScroll, 180);
}

function exportRecordsCsv() {
  try {
    const entries = entriesArray();
    if (!entries.length) {
      setAuthResult("idle", "暂无可导出记录", "先保存至少一条学习记录，再导出 CSV。");
      return false;
    }
    const headers = ["日期", "数学分钟", "408分钟", "英语分钟", "政治分钟", "项目分钟", "总分钟", "核心分钟", "数学题", "408题", "阅读篇", "新增错题", "回炉错题", "明日第一任务", "备注"];
    const rows = entries.map((entry) => [
      entry.date,
      entry.math || 0,
      entry.cs408 || 0,
      entry.english || 0,
      entry.politics || 0,
      entry.project || 0,
      entry.total || 0,
      entry.core || 0,
      entry.mathProblems || 0,
      entry.csProblems || 0,
      entry.reading || 0,
      entry.newMistakes || 0,
      entry.fixedMistakes || 0,
      entry.nextTask || "",
      entry.note || ""
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    const href = URL.createObjectURL(blob);
    link.href = href;
    link.download = `pku-swm-records-${todayISO()}.csv`;
    try {
      link.click();
    } finally {
      URL.revokeObjectURL(href);
    }
    setAuthResult("success", "CSV 已导出", "学习记录 CSV 已下载。");
    return true;
  } catch (error) {
    setAuthResult("error", "CSV 导出失败", `请检查浏览器下载权限后重试：${safeErrorMessage(error, "浏览器下载失败")}`);
    return false;
  }
}

function csvCell(value) {
  const type = typeof value;
  const text = ["string", "number", "bigint"].includes(type) ? String(value) : "";
  const safeText = /^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function renderRecordSummary() {
  const all = entriesArray();
  const currentMonth = planTodayISO().slice(0, 7);
  const monthEntries = all.filter((entry) => entry.date.startsWith(currentMonth));
  const totalHours = sumMinutes(all, "total") / 60;
  const monthHours = sumMinutes(monthEntries, "total") / 60;
  const activeDays = all.filter((entry) => entry.total > 0).length;
  const coreRatio = sumMinutes(all, "total") ? sumMinutes(all, "core") / sumMinutes(all, "total") : 0;
  const cards = [
    ["累计小时", `${totalHours.toFixed(1)}h`],
    ["本月小时", `${monthHours.toFixed(1)}h`],
    ["记录天数", `${activeDays} 天`],
    ["核心占比", `${Math.round(coreRatio * 100)}%`]
  ];
  document.getElementById("recordSummary").innerHTML = cards.map(([label, value]) => `
    <div class="record-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function getWeakSubject() {
  const phase = getCurrentPhase();
  const week = lastDaysEntries(7);
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;
  if (activeDays < 3) return null;
  const subjects = [
    ["math", "数学"],
    ["cs408", "408"],
    ["english", "英语"],
    ["politics", "政治"]
  ];
  let weakest = null;
  subjects.forEach(([key, label]) => {
    const target = phase.quotas[key];
    if (!target) return;
    const actual = sumMinutes(week, key) / 60;
    const ratio = actual / target;
    if (!weakest || ratio < weakest.ratio) {
      weakest = { key, label, ratio };
    }
  });
  return weakest && weakest.ratio < 0.7 ? weakest : null;
}

function renderSyllabusMini() {
  const subjects = Object.keys(syllabus);
  document.getElementById("syllabusMini").innerHTML = subjects.map((key) => {
    const stat = syllabusSubjectDetail(key);
    const next = nextTopics(key, 1)[0];
    return `
      <div class="mini-row">
        <div class="mini-row-head"><span>${syllabus[key].title}</span><span>${stat.percent}%</span></div>
        <div class="progress-track"><div class="progress-fill" data-fill="${stat.percent}"></div></div>
        <div class="mini-row-meta">已掌握 ${stat.done}/${stat.total} · 需复盘 ${stat.review} · 下一步：${next ? `${next.group} / ${next.topic}` : "回炉错题"}</div>
      </div>
    `;
  }).join("");
}

function renderSyllabus(selected = document.querySelector(".seg.active")?.dataset.syllabus || "math") {
  const data = syllabus[selected];
  renderSyllabusDashboard(selected);
  const density = state.settings.density || "balanced";
  const nextGroup = nextTopics(selected, 1)[0]?.group;
  const query = document.getElementById("syllabusSearch")?.value.trim().toLowerCase() || "";
  const visibleGroups = data.groups
    .map(([group, topics]) => [group, query ? topics.filter((topic) => topicMatchesQuery(selected, group, topic, query)) : topics])
    .filter(([, topics]) => topics.length);
  const groupsToRender = visibleGroups.length ? visibleGroups : [];
  document.getElementById("syllabusBoard").innerHTML = groupsToRender.length ? groupsToRender.map(([group, topics], index) => {
    const progress = groupProgress(selected, group);
    const groupType = syllabusGroupMeta(selected, group);
    const shouldOpen = Boolean(query) || density === "detail" || progress.review > 0 || group === nextGroup || (!nextGroup && index === 0);
    return `
      <details class="syllabus-group" data-density-expand="detail" ${shouldOpen ? "open" : ""}>
        <summary class="syllabus-group-summary">
          <div>
            <span class="syllabus-type-pill ${groupType.type}">${escapeHtml(groupType.label)}</span>
            <strong>${escapeHtml(group)}</strong>
            <span>${sanitizeNumber(progress.done)}/${sanitizeNumber(progress.total)} 已掌握 · ${sanitizeNumber(progress.review)} 需复盘</span>
          </div>
          <em>${sanitizeNumber(progress.percent, 0, 100)}%</em>
        </summary>
        <div class="progress-track slim"><div class="progress-fill" data-fill="${sanitizeNumber(progress.percent, 0, 100)}"></div></div>
        <div class="topic-list">
          ${topics.map((topic) => renderTopic(selected, group, topic)).join("")}
        </div>
      </details>
    `;
  }).join("") : `<div class="empty-state">没有匹配的考点。换一个关键词，或先看本阶段下一步小任务。</div>`;

  document.querySelectorAll("[data-topic-evidence]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const id = form.dataset.topicEvidence;
      const capturedEvidence = captureTopicEvidence(id, new FormData(form).get("evidence"));
      if (!capturedEvidence) return;
      const updatedAt = new Date().toISOString();
      state.topics[id] = 2;
      state.topicEvidence[id] = { ...topicEvidenceRow(id), updatedAt };
      const saved = saveState();
      renderSyllabus(selected);
      renderSyllabusMini();
      renderDashboard();
      setLocalSaveResult(saved, "掌握证据已记录", "考点已标为掌握，证据已保存。", "掌握证据未写入本机缓存");
    });
    form.querySelector("[data-topic-evidence-cancel]")?.addEventListener("click", () => {
      form.hidden = true;
    });
  });
  document.querySelectorAll(".topic").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.topicId;
      ensureKnowledgeContainers();
      const current = topicStateValue(id);
      const next = (current + 1) % 3;
      if (next === 2 && !hasTopicEvidence(id)) {
        openTopicEvidenceForm(id);
        showToast("补充题量、正确率或可交付结果后再标已掌握。");
        return;
      }
      const updatedAt = new Date().toISOString();
      state.topics[id] = next;
      state.topicEvidence[id] = { ...topicEvidenceRow(id), updatedAt };
      const saved = saveState();
      renderSyllabus(selected);
      renderSyllabusMini();
      renderDashboard();
      if (!saved) {
        setLocalSaveResult(false, "考点状态已保存", "考点状态已写入本机缓存。", "考点状态未写入本机缓存");
      }
    });
  });
  // `renderSyllabus` is also reached from the tab and search handlers in
  // `bindSyllabusTabs`, which bypass the render coordinator's `renderAfter` hook.
  applyDeferredStyles();
}

function topicMatchesQuery(subject, group, topic, query) {
  const guide = topicGuide(subject, group, topic);
  const haystack = [
    syllabus[subject]?.title,
    group,
    topic,
    guide.explain,
    guide.output,
    guide.drill
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function hasTopicEvidence(id) {
  const evidence = topicEvidenceRow(id);
  return Boolean((evidence.problems || 0) > 0 || (evidence.accuracy || 0) > 0 || evidence.evidence);
}

function openTopicEvidenceForm(id) {
  document.querySelectorAll("[data-topic-evidence]").forEach((form) => {
    form.hidden = form.dataset.topicEvidence !== id;
  });
  document.querySelector(`[data-topic-evidence="${CSS.escape(id)}"] [name="evidence"]`)?.focus();
}

function captureTopicEvidence(id, text) {
  const existing = topicEvidenceRow(id);
  if (text === null || text === undefined) return false;
  const evidenceText = String(text).trim();
  if (!isValidTopicEvidenceText(evidenceText)) {
    showToast("掌握证据不能为空，请补充题量、正确率或可交付结果。");
    return false;
  }
  const metrics = parseTopicEvidenceMetrics(evidenceText, existing);
  const updatedAt = new Date().toISOString();
  ensureKnowledgeContainers();
  state.topicEvidence[id] = {
    problems: metrics.problems,
    accuracy: metrics.accuracy,
    evidence: evidenceText,
    lastReviewDate: planTodayISO(),
    lastReviewAt: updatedAt,
    updatedAt
  };
  return true;
}

function isValidTopicEvidenceText(text) {
  return Boolean(text && text.trim());
}

function parseTopicEvidenceMetrics(text, existing = {}) {
  const problemsMatch = text.match(/(\d+)\s*道/);
  const accuracyMatch = text.match(/(\d+)\s*%/);
  return {
    problems: problemsMatch ? sanitizeInteger(problemsMatch[1], 0, 999) : sanitizeInteger(existing.problems || 0, 0, 999),
    accuracy: accuracyMatch ? sanitizeInteger(accuracyMatch[1], 0, 100) : sanitizeInteger(existing.accuracy || 0, 0, 100)
  };
}

function renderSyllabusDashboard(selected) {
  const container = document.getElementById("syllabusDashboard");
  if (!container) return;
  const detail = syllabusSubjectDetail(selected);
  const next = nextTopics(selected, 4);
  // The type explanation belongs to the legend, once per type. It used to be
  // appended to every group row, so a 13-group subject repeated the same
  // sentence 13 times down the page.
  const legend = Object.entries(syllabusGroupTypeMeta).map(([type, meta]) => `
    <span class="syllabus-type-pill ${type}" title="${escapeAttr(meta.note)}">${escapeHtml(meta.label)}</span>
  `).join("");
  container.innerHTML = `
    <section class="syllabus-hero">
      <div class="ring syllabus-ring" data-var-value="${sanitizeNumber(detail.percent, 0, 100)}">
        <span>${sanitizeNumber(detail.percent, 0, 100)}%</span>
      </div>
      <div>
        <strong>${syllabus[selected].title} 图谱</strong>
        <p>已掌握 ${sanitizeNumber(detail.done)} / ${sanitizeNumber(detail.total)}，需复盘 ${sanitizeNumber(detail.review)}，未开始 ${sanitizeNumber(detail.todo)}。点击任一考点可在“未开始 / 需复盘 / 已掌握”之间切换。条目为备考拆解，不等同官方逐字大纲。</p>
        <div class="syllabus-legend" aria-label="考纲条目类型">${legend}</div>
      </div>
    </section>
    <section class="syllabus-next">
      <strong>下一步小任务</strong>
      <div>
        ${next.map((topic, index) => `
          <article>
            <span>${index + 1}</span>
            <p>${topic.group}：${topic.topic}</p>
            <em>${topic.state === 1 ? "先复盘" : "新推进"}</em>
          </article>
        `).join("") || `<article><span>1</span><p>当前科目已覆盖，回到错题和套卷。</p><em>回炉</em></article>`}
      </div>
    </section>
    <section class="syllabus-framework">
      <strong>大框架</strong>
      <div>
        ${getSyllabusFramework(selected).map(([title, scope, method]) => `
          <article>
            <span>${escapeHtml(title)}</span>
            <p>${escapeHtml(scope)}</p>
            <em>${escapeHtml(method)}</em>
          </article>
        `).join("")}
      </div>
    </section>
    <!-- The group-progress bars that used to close this grid were removed: they
         rendered the same groups, the same done/total and the same percentage
         that #syllabusBoard already shows as expandable rows directly below, so
         every subject displayed its group list twice. Being the tallest column,
         the duplicated list also stretched the grid row and left the hero, the
         next-task list and the framework card mostly empty. -->
  `;
}

function syllabusGroupMeta(subject, group) {
  const type = syllabusGroupTypes[`${subject}/${group}`] || "official";
  return { type, ...syllabusGroupTypeMeta[type] };
}

function renderTopic(subject, group, topic) {
  const id = topicId(subject, group, topic);
  const value = topicStateValue(id);
  const className = value === 2 ? "done" : value === 1 ? "review" : "";
  const label = value === 2 ? "已掌握" : value === 1 ? "需复盘" : "未开始";
  const guide = topicGuide(subject, group, topic);
  const evidence = topicEvidenceRow(id);
  return `
    <div class="topic-row">
      <button class="topic ${className}" data-topic-id="${escapeAttr(id)}">
        <span class="topic-main">
          <strong>${escapeHtml(topic)}</strong>
          <em>${escapeHtml(guide.explain)}</em>
          <small>${escapeHtml(guide.output)}</small>
          ${evidence?.evidence ? `<small class="topic-evidence">证据：${escapeHtml(evidence.evidence)}</small>` : ""}
        </span>
        <span class="topic-side">
          <span class="topic-state">${escapeHtml(label)}</span>
          <em>${escapeHtml(guide.drill)}</em>
        </span>
      </button>
      <form class="topic-evidence-form" data-topic-evidence="${escapeAttr(id)}" hidden>
        <label>掌握证据<input name="evidence" type="text" maxlength="300" required value="${escapeAttr(evidence?.evidence || "")}" placeholder="基础题 25 道，正确率 84%，能默写定义"></label>
        <div>
          <button type="submit" class="primary-button">保存并标为已掌握</button>
          <button type="button" data-topic-evidence-cancel>取消</button>
        </div>
      </form>
    </div>
  `;
}

function topicGuide(subject, group, topic) {
  const exact = specificTopicGuide(subject, group, topic);
  if (exact) return exact;
  const defaults = {
    math: {
      explain: "先会定义和公式，再做基础题，不用难题逃避基础。",
      output: "交付：公式默写 + 基础题 15-25 道 + 错因 1-3 条。",
      drill: "15-25 题"
    },
    cs408: {
      explain: "先画结构或流程，再做题，最后写伪代码或代价分析。",
      output: "交付：章节题 20 道或 1 张过程图/1 段伪代码。",
      drill: "20 题"
    },
    english: {
      explain: "先背词，再定位句子结构，最后解释错选项原因。",
      output: "交付：生词、长难句、定位句、错因各一组。",
      drill: "1 组"
    },
    politics: {
      explain: "先搭框架，再做选择题，错题归到概念或材料定位。",
      output: "交付：框架关键词 + 选择题错题归类。",
      drill: "20-40 题"
    }
  };
  const base = defaults[subject] || defaults.math;
  const key = `${subject}/${group}`;
  const byGroup = {
    "math/高数预备": ["补前置，不追求考研难度，目标是看懂极限和导数符号。", "交付：会画图、会化简、会说变量关系。", "10-15 题"],
    "math/极限与连续": ["理解趋近过程、等价替换和连续判定，是高数第一道门。", "交付：写出适用条件，基础极限正确率 80%+。", "20-30 题"],
    "math/一元微分学": ["把导数理解成变化率，并能连接单调、极值、凹凸。", "交付：求导链条 + 应用题识别信号。", "20-30 题"],
    "math/中值定理": ["证明题核心区，先背定理条件，再学构造辅助函数。", "交付：每个定理写条件、结论和常见构造。", "8-15 题"],
    "math/一元积分学": ["先算对基本积分，再理解定积分性质和应用。", "交付：换元/分部选择理由 + 基础题正确率。", "20-30 题"],
    "math/多元微分学": ["从一元变化扩展到多变量，重心是偏导、全微分和极值。", "交付：会写求导链路和条件极值步骤。", "15-25 题"],
    "math/重积分": ["先画区域，再选坐标，顺序比技巧更重要。", "交付：画区域 + 写积分限 + 完成计算。", "15-25 题"],
    "math/曲线曲面积分": ["公式多但有套路，先分清第一类和第二类。", "交付：类型判断表 + 公式适用条件。", "12-20 题"],
    "math/级数": ["先判敛散，再做展开，避免一上来套公式。", "交付：判别法选择理由 + 错题归类。", "15-25 题"],
    "math/微分方程": ["识别方程类型，按模板解，不追求花活。", "交付：类型识别表 + 标准解题步骤。", "12-20 题"],
    "math/线性代数": ["核心是矩阵、向量组、秩、特征值之间的关系。", "交付：概念关系图 + 题型识别信号。", "20-30 题"],
    "math/概率统计": ["先用事件和随机变量建模，再算分布、数字特征和估计。", "交付：分布表 + 公式条件 + 基础题。", "15-25 题"],
    "cs408/C 与算法预备": ["跨考先补程序表达，目标是能读懂数据结构伪代码。", "交付：一个小程序或伪代码，能解释变量变化。", "代码+10题"],
    "cs408/数据结构-线性结构": ["线性表、栈、队列是后面树图算法的地基。", "交付：基本操作伪代码 + 复杂度。", "20 题"],
    "cs408/数据结构-树": ["树题先画结构，再写遍历和存储关系。", "交付：遍历序列、结构图、伪代码。", "20 题"],
    "cs408/数据结构-图": ["图题重在存储、遍历和经典算法过程。", "交付：过程表 + 算法复杂度。", "20 题"],
    "cs408/数据结构-查找排序": ["排序查找必须能手推过程和比较复杂度。", "交付：手推过程 + 稳定性/复杂度表。", "20 题"],
    "cs408/计组-数据表示": ["先理解机器如何表示数，后面 ALU 和指令才顺。", "交付：补码/浮点转换步骤。", "20 题"],
    "cs408/计组-运算与指令": ["把运算部件和指令格式联系起来，不只背名词。", "交付：指令字段解释 + 运算流程。", "15-25 题"],
    "cs408/计组-CPU": ["CPU 题要画数据通路和控制信号流向。", "交付：数据通路图 + 周期/冒险分析。", "15-25 题"],
    "cs408/计组-存储与 I/O": ["Cache、虚存、I/O 是高频综合区。", "交付：地址划分 + 命中/替换过程。", "20 题"],
    "cs408/OS-进程线程": ["先懂进程状态和调度，再做同步死锁。", "交付：状态转换图 + 调度过程表。", "20 题"],
    "cs408/OS-同步死锁": ["这是 OS 难点，信号量题必须逐步模拟。", "交付：PV 伪代码 + 死锁条件判断。", "20 题"],
    "cs408/OS-内存文件 I/O": ["内存管理和文件系统要画地址转换与目录结构。", "交付：页表/置换/磁盘调度过程。", "20 题"],
    "cs408/计网-基础与链路": ["先建立分层视角，知道每层解决什么问题。", "交付：层次图 + 链路层过程说明。", "15-25 题"],
    "cs408/计网-网络层": ["IP、子网和路由必须能算、能画、能解释。", "交付：子网划分 + 路由转发表。", "20 题"],
    "cs408/计网-传输与应用": ["TCP 是重心，握手、可靠传输、拥塞控制要手推。", "交付：时序图 + 窗口变化过程。", "20 题"],
    "english/词汇": ["目标不是背完列表，而是在真题里认出同义替换。", "交付：高频词 + 熟词僻义 + 错词复现。", "20-40min"],
    "english/语法长难句": ["先找主干，再处理从句、非谓语和插入成分。", "交付：长句切分 + 翻译顺序。", "3-5 句"],
    "english/阅读理解": ["阅读分数靠定位和排除，不靠全文翻译。", "交付：定位句 + 错选项原因。", "1 篇"],
    "politics/马原": ["马原先理解原理，再做材料匹配。", "交付：原理关键词 + 选择题错因。", "20 题"],
    "politics/主观题": ["后期再重投入，先练关键词和答题层次。", "交付：关键词默写 + 材料定位。", "1 题"]
  };
  const detail = byGroup[key];
  if (!detail) return base;
  return { explain: detail[0], output: detail[1], drill: detail[2] };
}

function specificTopicGuide(subject, group, topic) {
  const guides = {
    "math/高数预备/函数性质与图像": ["会判断定义域、值域、奇偶、单调、周期，能用图像理解函数变化。", "交付：画 5 类常见函数图像，完成定义域和值域基础题。", "10-15 题"],
    "math/高数预备/常用初等函数": ["指数、对数、幂函数、三角函数是极限和导数的语言。", "交付：默写基本图像、单调区间和常用变形。", "10-15 题"],
    "math/高数预备/三角恒等变换": ["三角题先识别公式，再化成同角同函数，不硬算。", "交付：默写基本恒等式，完成化简题。", "10-15 题"],
    "math/高数预备/不等式与绝对值": ["绝对值题先分区间，不等式题先明确变形是否保号。", "交付：写出分段讨论步骤和常用不等式。", "10-15 题"],
    "math/高数预备/数列基础": ["数列是极限入口，先理解单调、有界、递推和通项。", "交付：会判断简单数列趋势，写出递推前几项。", "10-15 题"],
    "math/高数预备/常用代数变形": ["分式、根式、因式分解和有理化决定极限基础题速度。", "交付：整理 8 个常用变形，错题写变形信号。", "10-15 题"],
    "math/极限与连续/数列极限": ["看清 n 趋向无穷时项的变化，先用夹逼、单调有界和等价量。", "交付：写出判定路线，基础题正确率 80%+。", "15-25 题"],
    "math/极限与连续/函数极限": ["明确 x 趋近对象、左右极限和无穷小阶，先判型再变形。", "交付：每题写出未定式类型和变形原因。", "20-30 题"],
    "math/极限与连续/无穷小与无穷大": ["理解量级比较，后面等价无穷小和泰勒都靠它。", "交付：会比较同阶、高阶、低阶和等价。", "15-20 题"],
    "math/极限与连续/等价无穷小": ["只在乘除结构中直接替换，加减结构要谨慎。", "交付：列出常见等价式和禁用场景。", "20 题"],
    "math/极限与连续/洛必达法则": ["先确认 0/0 或无穷/无穷以及可导条件，不要把它当万能钥匙。", "交付：每题写出使用条件，能判断不适用题。", "15-20 题"],
    "math/极限与连续/函数连续性": ["连续就是函数值和极限对上，重点看分段点和定义点。", "交付：会求参数并判断连续区间。", "15-20 题"],
    "math/一元微分学/导数定义": ["导数定义题看增量比，理解变化率而不是只背公式。", "交付：用定义做 5 道题，写出 h 趋近过程。", "10-15 题"],
    "math/一元微分学/求导法则": ["先熟练链式法则、乘除法则，再做隐函数和参数方程。", "交付：常见函数求导无卡顿，错题标出漏链式位置。", "20-30 题"],
    "math/一元微分学/单调性": ["一阶导数符号决定增减，先找定义域和临界点。", "交付：画符号表，完成单调区间题。", "15-20 题"],
    "math/一元微分学/极值与最值": ["极值看局部，最值看区间；端点和不可导点不能漏。", "交付：写完整候选点清单。", "15-20 题"],
    "cs408/C 与算法预备/变量与表达式": ["知道类型、赋值、表达式求值顺序，能手推变量变化。", "交付：写 3 个小程序，手推输出结果。", "代码+10题"],
    "cs408/C 与算法预备/条件与循环": ["能把自然语言步骤翻成 if/for/while，是算法题入口。", "交付：写 5 个循环题，说明循环不变量。", "代码+10题"],
    "cs408/C 与算法预备/数组": ["数组是顺序存储的基础，注意下标、边界和连续内存。", "交付：写查找、插入、删除、逆置。", "代码+10题"],
    "cs408/C 与算法预备/函数": ["函数用于拆步骤，重点是参数、返回值和作用域。", "交付：把数组操作封装成函数。", "代码+8题"],
    "cs408/C 与算法预备/指针": ["指针先理解地址和解引用，再碰链表，不要死背符号。", "交付：画变量-地址图，写指针交换和数组遍历。", "代码+10题"],
    "cs408/数据结构-线性结构/顺序表": ["顺序表核心是连续存储，插入删除要移动元素。", "交付：写插入、删除、查找伪代码和复杂度。", "20 题"],
    "cs408/数据结构-线性结构/单链表": ["链表核心是指针改链，先画图再写代码。", "交付：头插、尾插、删除、逆置伪代码。", "20 题"],
    "cs408/数据结构-线性结构/栈": ["栈是后进先出，常用于括号匹配、表达式、递归模拟。", "交付：写入栈出栈，做应用题。", "15-20 题"],
    "cs408/数据结构-线性结构/队列": ["队列是先进先出，循环队列重点是判空判满。", "交付：画 front/rear 变化过程。", "15-20 题"],
    "cs408/数据结构-树/二叉树遍历": ["遍历题先确定根的位置，再根据先中后序还原结构。", "交付：手推遍历序列，写递归/非递归思路。", "20 题"],
    "cs408/数据结构-图/DFS": ["DFS 是沿一条路走到底再回退，重点是访问标记和递归栈。", "交付：画搜索树，写伪代码和复杂度。", "15-20 题"],
    "cs408/数据结构-图/BFS": ["BFS 按层扩展，队列是关键，常用于最短步数。", "交付：画队列变化和访问序列。", "15-20 题"],
    "english/词汇/高频核心词": ["先保证真题高频词能反应，不追求一次背完所有词。", "交付：当天新词、复习词、错词各有记录。", "20-40min"],
    "english/阅读理解/定位句识别": ["题干关键词回原文定位，答案必须有原文依据。", "交付：每题写定位句和干扰项原因。", "1 篇"],
    "politics/马原/辩证法": ["辩证法主看联系、发展、矛盾，材料题要匹配原理。", "交付：原理关键词 + 选择题错因归类。", "20 题"]
  };
  const item = guides[`${subject}/${group}/${topic}`];
  if (item) return { explain: item[0], output: item[1], drill: item[2] };
  const generated = generatedTopicGuide(subject, group, topic);
  return generated ? { explain: generated[0], output: generated[1], drill: generated[2] } : null;
}

function generatedTopicGuide(subject, group, topic) {
  if (subject === "math") return generatedMathGuide(group, topic);
  if (subject === "cs408") return generatedCsGuide(group, topic);
  if (subject === "english") return generatedEnglishGuide(group, topic);
  if (subject === "politics") return generatedPoliticsGuide(group, topic);
  return null;
}

function generatedMathGuide(group, topic) {
  const exact = {
    "泰勒公式初步": ["泰勒用于把复杂函数局部多项式化，极限和证明题常用。", "交付：默写常见展开，说明余项阶数。", "12-18 题"],
    "间断点分类": ["先找无定义或分段点，再看左右极限和函数值。", "交付：可去、跳跃、无穷、振荡分类表。", "12-18 题"],
    "高阶导数": ["高阶导数重在规律归纳和常见函数模板。", "交付：写出前 3 阶并归纳通项。", "12-18 题"],
    "隐函数求导": ["把 y 看成 x 的函数，两边同时求导并解出 y'。", "交付：写完整链式过程，不漏 y 的导数。", "12-20 题"],
    "参数方程求导": ["先分别对参数求导，再用 dy/dx 连接。", "交付：一阶、二阶求导步骤卡。", "10-16 题"],
    "微分": ["微分是局部线性近似，和导数、误差估计相连。", "交付：会写 dy=f'(x)dx 并做近似计算。", "10-16 题"],
    "凹凸性与拐点": ["二阶导数符号看弯曲方向，拐点要看符号变化。", "交付：画二阶导符号表。", "12-18 题"],
    "渐近线": ["分别检查垂直、水平、斜渐近线，先看极限。", "交付：列三类渐近线判定式。", "10-15 题"],
    "罗尔定理": ["罗尔是中值定理证明入口，条件是连续、可导、端点相等。", "交付：写条件核验 + 辅助函数。", "8-12 题"],
    "拉格朗日中值定理": ["把函数增量和某点导数联系起来，常用于不等式证明。", "交付：写出套用区间和结论。", "8-12 题"],
    "柯西中值定理": ["两个函数的增量比连接导数比，常用于复杂比值证明。", "交付：明确 f、g 和 g' 不为 0。", "8-12 题"],
    "泰勒中值定理": ["用多项式加余项表达函数，常处理极限和估计。", "交付：写展开点、阶数、余项形式。", "8-12 题"],
    "证明题常见构造": ["证明题先看要证形式，再构造辅助函数或套中值。", "交付：归纳 5 类构造信号。", "8-12 题"],
    "有理函数积分": ["先做因式分解或拆分，复杂题再部分分式。", "交付：写拆分过程和基本积分模板。", "12-18 题"],
    "反常积分": ["重点是无穷区间和瑕点，先判收敛再计算。", "交付：写出比较判别或极限定义。", "12-18 题"],
    "定积分应用": ["应用题先画几何对象，再写面积、体积或物理量。", "交付：画图 + 列积分式。", "12-18 题"],
    "条件极值": ["约束极值优先拉格朗日乘子，边界不能漏。", "交付：写方程组和候选点比较。", "12-18 题"],
    "交换积分次序": ["先画积分区域，再把边界改写成另一方向。", "交付：区域图 + 两种积分限。", "12-18 题"],
    "柱坐标与球坐标": ["三重积分遇圆柱、球面结构要换坐标。", "交付：写变量替换和雅可比因子。", "10-16 题"],
    "格林公式": ["平面曲线积分和二重积分互化，先检查闭合和方向。", "交付：写方向判断和公式条件。", "10-16 题"],
    "高斯公式": ["曲面积分转三重积分，先补闭合面并判断外法向。", "交付：画封闭区域和法向。", "8-14 题"],
    "斯托克斯公式": ["空间曲线积分和曲面积分互化，重在方向一致。", "交付：写边界方向和旋度。", "8-12 题"],
    "幂级数": ["幂级数先求收敛半径，再单独检查端点。", "交付：收敛域步骤卡。", "12-18 题"],
    "函数展开为幂级数": ["利用标准展开和逐项求导积分，不硬推。", "交付：默写常见展开并标收敛域。", "10-16 题"],
    "二阶常系数线性方程": ["先写特征方程，再处理齐次和非齐次。", "交付：特征根分类表。", "10-16 题"],
    "行列式计算": ["先用性质化简，再展开，避免硬算大行列式。", "交付：3 类化简手法 + 计算题。", "15-25 题"],
    "矩阵运算": ["矩阵乘法看维度和顺序，运算律不要套错。", "交付：维度检查 + 典型运算题。", "15-25 题"],
    "逆矩阵": ["逆矩阵和可逆条件、初等变换、伴随矩阵相连。", "交付：写出 3 种求逆路径。", "15-25 题"],
    "矩阵秩": ["秩是线代主轴，和方程组、向量组、可逆性贯通。", "交付：初等变换求秩 + 结论解释。", "15-25 题"],
    "特征值与特征向量": ["先求特征方程，再解特征向量，注意重根。", "交付：完整计算流程。", "15-25 题"],
    "相似对角化": ["能否对角化看特征向量个数，不只看特征值。", "交付：判定条件 + P 矩阵构造。", "12-20 题"],
    "二次型": ["二次型重在矩阵表示、合同变换和标准形。", "交付：写矩阵、化标准形、判正定。", "15-25 题"],
    "随机事件": ["先把文字事件翻译成集合运算，再算概率。", "交付：事件关系图和公式。", "12-18 题"],
    "条件概率": ["条件概率先缩小样本空间，别机械套公式。", "交付：写条件空间和计算步骤。", "12-18 题"],
    "全概率与贝叶斯": ["全概率先分完备事件，贝叶斯反推原因。", "交付：画树状图。", "12-18 题"],
    "常见离散分布": ["二项、泊松、几何等要会识别试验模型。", "交付：分布表 + 适用信号。", "12-18 题"],
    "常见连续分布": ["均匀、指数、正态要会密度、分布函数和数字特征。", "交付：公式表 + 基础计算。", "12-18 题"],
    "期望": ["期望是加权平均，先判离散还是连续。", "交付：写求和/积分式。", "12-18 题"],
    "方差": ["方差看波动，常用 E(X^2)-E(X)^2。", "交付：两种公式都能用。", "12-18 题"],
    "中心极限定理": ["大样本近似正态，重点是标准化。", "交付：写标准化步骤。", "8-12 题"],
    "参数估计": ["估计题先区分矩估计和最大似然。", "交付：两种方法流程卡。", "10-16 题"]
  };
  if (exact[topic]) return exact[topic];
  if (group.includes("积分")) return [`${topic} 先判断积分对象和区域，再选择换元、分部或坐标系。`, "交付：写出适用条件、计算步骤和错因。", "12-20 题"];
  if (group.includes("线性代数")) return [`${topic} 要和秩、方程组、特征值或二次型关系一起学。`, "交付：概念关系图 + 典型题步骤。", "15-25 题"];
  if (group.includes("概率")) return [`${topic} 先识别随机模型，再写公式条件，不背孤立公式。`, "交付：模型信号 + 公式条件 + 基础题。", "12-20 题"];
  return null;
}

function generatedCsGuide(group, topic) {
  const exact = {
    "结构体": ["结构体把多个字段合成一个对象，是链表和树节点基础。", "交付：定义节点结构并完成输入输出。", "代码+8题"],
    "递归": ["递归先明确终止条件，再写子问题，不要只背调用栈。", "交付：画调用树，写 3 个递归函数。", "代码+10题"],
    "复杂度分析": ["复杂度看输入规模增长，不是数机器运行秒数。", "交付：循环、递归、排序复杂度表。", "10-15 题"],
    "伪代码书写": ["408 算法题要写清输入、处理、输出和边界。", "交付：按规范写 2 道算法题。", "2 题"],
    "循环队列": ["循环队列重点是 front/rear 约定和判空判满。", "交付：画指针变化，写入队出队。", "15-20 题"],
    "KMP 思想": ["KMP 核心是利用已匹配信息，重点理解 next 数组。", "交付：手推 next 数组和匹配过程。", "10-16 题"],
    "二叉树性质": ["二叉树性质题常考结点数、高度、叶子关系。", "交付：性质公式 + 推导题。", "15-20 题"],
    "线索二叉树": ["线索化用空指针保存前驱后继，先理解遍历线索。", "交付：画线索指向和遍历过程。", "10-16 题"],
    "树与森林": ["树、森林和二叉树转换要会画左孩子右兄弟。", "交付：互转图 + 遍历对应关系。", "10-16 题"],
    "哈夫曼树": ["哈夫曼树按权值合并，目标是最短带权路径。", "交付：构造过程和 WPL 计算。", "10-16 题"],
    "平衡二叉树": ["AVL 调整看失衡类型，先判 LL/RR/LR/RL。", "交付：旋转过程图。", "10-16 题"],
    "B 树与 B+ 树": ["B 类树服务外存索引，重点是阶、关键字和分裂合并。", "交付：插入删除过程图。", "8-14 题"],
    "最小生成树": ["Prim 和 Kruskal 都求连通最小代价，选择边的逻辑不同。", "交付：手推两种算法。", "10-16 题"],
    "最短路径": ["Dijkstra 和 Floyd 分别处理单源和多源最短路。", "交付：距离表更新过程。", "10-16 题"],
    "拓扑排序": ["拓扑排序用于有向无环图，入度为 0 是入口。", "交付：队列变化和序列。", "8-14 题"],
    "关键路径": ["关键路径看工程最短完成时间，先算最早最迟时间。", "交付：ve/vl/e/l 表。", "8-14 题"],
    "散列表": ["散列表重在冲突处理和查找长度。", "交付：构造表并计算 ASL。", "12-18 题"],
    "插入排序": ["插入排序每轮把元素插入有序区，稳定性要记。", "交付：手推过程 + 复杂度。", "8-12 题"],
    "交换排序": ["冒泡和快排都属交换，快排分区过程是重点。", "交付：分区过程和复杂度。", "10-16 题"],
    "选择排序": ["选择排序每轮选最小或最大，通常不稳定。", "交付：过程表 + 稳定性判断。", "8-12 题"],
    "归并排序": ["归并排序先分后合，时间稳定但需要额外空间。", "交付：递归树和合并过程。", "8-12 题"],
    "进制转换": ["进制转换是数据表示入口，注意整数和小数方法不同。", "交付：二八十六互转。", "12-18 题"],
    "补码运算": ["补码统一加减法，溢出判断是重点。", "交付：补码表示和溢出例题。", "15-20 题"],
    "IEEE754": ["浮点数按符号、阶码、尾数拆解，先会编码解码。", "交付：单精度字段拆分。", "10-16 题"],
    "指令执行过程": ["取指、译码、执行、访存、写回要能串起来。", "交付：周期流程图。", "12-18 题"],
    "流水线性能": ["流水线题算吞吐率、加速比和周期数。", "交付：时空图 + 公式。", "12-18 题"],
    "流水线冒险": ["冒险分结构、数据、控制，处理方法要对应。", "交付：冒险类型表。", "10-16 题"],
    "Cache 映射": ["Cache 先做地址划分，再判断映射位置和命中。", "交付：标记/组号/块内地址。", "15-20 题"],
    "虚拟存储器": ["虚存把地址转换和页面置换联系起来。", "交付：页表转换过程。", "15-20 题"],
    "进程状态转换": ["状态转换要看事件触发：创建、就绪、运行、阻塞、终止。", "交付：状态图 + 触发条件。", "12-18 题"],
    "处理机调度": ["调度题先列到达、服务、优先级，再手算周转时间。", "交付：甘特图和指标。", "12-18 题"],
    "信号量": ["PV 操作题先找资源和互斥/同步关系。", "交付：PV 伪代码和执行序列。", "15-20 题"],
    "银行家算法": ["银行家算法判断安全序列，先算 Need 和 Available。", "交付：安全性检查表。", "10-16 题"],
    "分页管理": ["分页题核心是页号、页内偏移和页表地址转换。", "交付：地址划分和转换。", "15-20 题"],
    "页面置换": ["FIFO、LRU、Clock 要会手推缺页过程。", "交付：置换表 + 缺页率。", "12-18 题"],
    "磁盘调度": ["磁盘调度看访问序列和移动距离。", "交付：FCFS/SSTF/SCAN 手推。", "10-16 题"],
    "子网划分": ["子网题先写二进制掩码，再算网络号和可用地址。", "交付：网络号、广播地址、主机范围。", "15-20 题"],
    "ARP": ["ARP 解决 IP 到 MAC 的映射，发生在同一链路。", "交付：请求/响应过程图。", "8-12 题"],
    "路由选择": ["路由题先看目的网络和最长前缀匹配。", "交付：转发表匹配过程。", "10-16 题"],
    "TCP 报文段": ["TCP 字段服务可靠传输、流控和拥塞控制。", "交付：字段作用表。", "10-16 题"],
    "三次握手": ["握手用于建立连接和同步序号，必须会画时序图。", "交付：SYN/ACK 序号图。", "8-12 题"],
    "四次挥手": ["挥手是双向关闭，重点理解 TIME_WAIT。", "交付：状态转换图。", "8-12 题"],
    "拥塞控制": ["慢开始、拥塞避免、快重传、快恢复要会画窗口变化。", "交付：cwnd 曲线。", "10-16 题"],
    "HTTP": ["HTTP 是应用层请求响应协议，和 TCP、DNS 常综合。", "交付：一次访问网页的协议链路。", "8-12 题"]
  };
  if (exact[topic]) return exact[topic];
  if (group.includes("计组")) return [`${topic} 先画硬件结构或数据流，再做计算题。`, "交付：过程图 + 关键字段/公式。", "12-20 题"];
  if (group.includes("OS")) return [`${topic} 先画状态、资源或地址转换过程，再做选择和大题。`, "交付：过程表 + 易错条件。", "12-20 题"];
  if (group.includes("计网")) return [`${topic} 要回答解决什么问题、报文怎么走、代价是什么。`, "交付：协议流程图 + 计算或字段题。", "10-18 题"];
  return null;
}

function generatedEnglishGuide(group, topic) {
  const exact = {
    "熟词僻义": ["真题常用熟词僻义制造障碍，要在语境里记。", "交付：当天 10 个熟词僻义例句。", "20min"],
    "词根词缀": ["词根词缀用于降低生词恐惧，不替代真题语境。", "交付：整理 8 个词族。", "20min"],
    "同义替换": ["阅读正确选项常改写原文，同义替换是定位核心。", "交付：每篇摘 5 组替换。", "1 篇"],
    "从句识别": ["先找主干，再判断名词性、定语、状语从句。", "交付：切分 5 个长句。", "3-5 句"],
    "非谓语结构": ["非谓语常作定语、状语、补足语，翻译要还原逻辑。", "交付：标出形式和成分。", "3-5 句"],
    "主旨题": ["主旨题看文章框架和转折，不被局部细节带跑。", "交付：段落功能表。", "1 篇"],
    "细节题": ["细节题必须回原文定位，选项逐词比对。", "交付：定位句 + 改写方式。", "1 篇"],
    "推断题": ["推断题不能脑补，只能从原文逻辑推出一步。", "交付：依据句 + 排除理由。", "1 篇"],
    "态度题": ["态度题看评价词和转折，区分作者与他人观点。", "交付：态度词清单。", "1 篇"],
    "选项干扰类型": ["干扰项常见偷换、扩大、无中生有、反向。", "交付：每篇错题归类。", "1 篇"],
    "段落排序": ["排序题先找代词、连接词和主题推进。", "交付：写连接依据。", "1 组"],
    "小标题匹配": ["小标题看段落中心句和重复主题词。", "交付：每段一句话概括。", "1 组"],
    "定语从句翻译": ["定语从句先找先行词，再决定前置或拆句。", "交付：翻译 3-5 句。", "3-5 句"],
    "被动语态": ["被动翻译按中文表达重组，不硬译“被”。", "交付：改写 5 句。", "3-5 句"],
    "小作文格式": ["小作文先保格式和功能句，内容简洁准确。", "交付：默写 1 个格式模板。", "20min"],
    "图画作文": ["大作文先描述图，再提观点，最后展开原因和建议。", "交付：写提纲 + 1 段。", "30min"],
    "限时写作": ["作文要在限时内稳定成文，后期反复默写和改错。", "交付：30-40 分钟完整一篇。", "1 篇"]
  };
  if (exact[topic]) return exact[topic];
  return [`${topic} 不单独死记，要放进真题句子或篇章里复盘。`, "交付：例句/定位句 + 错因或改写记录。", group.includes("阅读") ? "1 篇" : "20-30min"];
}

function generatedPoliticsGuide(group, topic) {
  const exact = {
    "哲学基本问题": ["先分物质意识和可知论，选择题常考概念边界。", "交付：概念对照表 + 错题归类。", "20 题"],
    "唯物论": ["唯物论看物质、意识、实践及其关系。", "交付：关键词默写和材料对应。", "20 题"],
    "认识论": ["认识论重点是实践、认识、真理和价值。", "交付：原理关键词 + 材料例子。", "20 题"],
    "唯物史观": ["社会存在、社会意识、人民群众是高频点。", "交付：框架图 + 选择错因。", "20 题"],
    "政治经济学": ["政经概念密集，先分商品、价值、剩余价值。", "交付：概念链条表。", "20 题"],
    "新时代思想": ["中特后期分值高，先建政策和关键词框架。", "交付：章节框架 + 选择错因。", "20-40 题"],
    "重要会议": ["史纲会议要按时间线和意义记，不孤立背。", "交付：时间轴 + 关键词。", "20min"],
    "热点专题": ["时政热点后期整合，先关注主题和官方表述。", "交付：热点关键词卡。", "20min"],
    "当年版预测题背诵": ["考前用当年版非官方预测资料或同类材料背主观题，重在关键词和层次。", "交付：闭卷默写一题框架。", "1 题"]
  };
  if (exact[topic]) return exact[topic];
  return [`${topic} 先放进 ${group} 框架里理解，再用选择题校正概念边界。`, "交付：框架关键词 + 选择题错因。", "20-40 题"];
}

function topicId(subject, group, topic) {
  return `${subject}/${group}/${topic}`;
}

function syllabusProgress(subject) {
  return { percent: syllabusSubjectDetail(subject).percent };
}

function syllabusSubjectDetail(subject) {
  const data = syllabus[subject];
  let total = 0;
  let score = 0;
  let done = 0;
  let review = 0;
  const groups = [];
  data.groups.forEach(([group, topics]) => {
    let groupScore = 0;
    let groupTotalScore = 0;
    let groupDone = 0;
    let groupReview = 0;
    topics.forEach((topic) => {
      const value = topicStateValue(topicId(subject, group, topic));
      total += 2;
      score += value;
      groupTotalScore += 2;
      groupScore += value;
      if (value === 2) {
        done += 1;
        groupDone += 1;
      }
      if (value === 1) {
        review += 1;
        groupReview += 1;
      }
    });
    groups.push({
      group,
      total: topics.length,
      done: groupDone,
      review: groupReview,
      percent: groupTotalScore ? Math.round(groupScore / groupTotalScore * 100) : 0
    });
  });
  const totalTopics = data.groups.reduce((sum, [, topics]) => sum + topics.length, 0);
  return {
    percent: total ? Math.round(score / total * 100) : 0,
    total: totalTopics,
    done,
    review,
    todo: totalTopics - done - review,
    groups
  };
}

function groupProgress(subject, groupName) {
  return syllabusSubjectDetail(subject).groups.find((item) => item.group === groupName) || { percent: 0, done: 0, review: 0, total: 0 };
}

function renderReviewScience() {
  const scienceGrid = document.getElementById("reviewScienceGrid");
  const adjustmentTable = document.getElementById("adjustmentTable");

  if (scienceGrid) {
    scienceGrid.innerHTML = learningScienceRules.map((rule, index) => `
      <article class="review-science-card">
        <header>
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div><strong>${escapeHtml(rule.name)}</strong><em>${escapeHtml(rule.evidence)}</em></div>
        </header>
        <p>${escapeHtml(rule.action)}</p>
        <div><span>边界</span><p>${escapeHtml(rule.guardrail)}</p></div>
      </article>
    `).join("");
  }

  if (adjustmentTable) {
    adjustmentTable.innerHTML = `
      <div class="adjustment-table-head"><span>决策</span><span>触发条件</span><span>只执行这一个动作</span></div>
      ${adaptiveAdjustmentRules.map(([label, trigger, action]) => `
        <article>
          <strong>${escapeHtml(label)}</strong>
          <p>${escapeHtml(trigger)}</p>
          <p>${escapeHtml(action)}</p>
        </article>
      `).join("")}
    `;
  }
}

function renderReviewModeLayouts({ weekHours, coreRatio, mistakeRatio, activeDays, dueCount, avg14, monthHours, monthTarget, weeklyTarget }) {
  const focus = document.getElementById("reviewFocusLayout");
  const operations = document.getElementById("reviewOperationsLayout");
  const diagnostic = document.getElementById("reviewDiagnosticLayout");
  const posture = reviewPosture({
    dueCount,
    activeDays,
    mistakeRatio,
    weekHours,
    weeklyTarget,
    coreRatio
  });
  const nextAction = posture.action;
  const status = posture.status;

  if (focus) {
    focus.innerHTML = `
      <header><span>本周只做一个决定</span><strong>${escapeHtml(status)}</strong></header>
      <div class="review-focus-action"><span>下一动作</span><p>${escapeHtml(nextAction)}</p></div>
      <dl><div><dt>有效学习</dt><dd>${weekHours.toFixed(1)}h</dd></div><div><dt>活跃天数</dt><dd>${activeDays} 天</dd></div><div><dt>到期复盘</dt><dd>${dueCount} 项</dd></div></dl>
      <footer><strong>停手线</strong><span>只调整总量、难度、复盘上限或一个弱项中的一个；不同时换资料、加时长和换方法。</span></footer>
    `;
  }

  if (operations) {
    operations.innerHTML = `
      <header><div><span>7 天执行复盘</span><h3>先看证据，再改计划</h3></div><strong>${escapeHtml(status)}</strong></header>
      <div class="review-operation-grid">
        <article><span>有效时长</span><strong>${weekHours.toFixed(1)}h</strong><p>14 天日均 ${avg14.toFixed(1)}h，检查趋势而不是单日峰值。</p></article>
        <article><span>核心投入</span><strong>${Math.round(coreRatio * 100)}%</strong><p>数学与 408 看 7 天窗口，参考区间 60%-75%。</p></article>
        <article><span>回炉结果</span><strong>${Math.round(mistakeRatio * 100)}%</strong><p>低于 70% 先减少新内容，不用追加整套资料。</p></article>
        <article><span>月度容量</span><strong>${monthHours.toFixed(1)} / ${monthTarget}h</strong><p>这是排程容量，不是必须追满的绩效指标。</p></article>
      </div>
      <footer><strong>本周建议</strong><span>${escapeHtml(nextAction)}</span></footer>
    `;
  }

  if (diagnostic) {
    diagnostic.innerHTML = `
      <header><div><span>诊断口径</span><h3>容量、证据与风险</h3></div><strong>${escapeHtml(studyCapacityPolicy.decisionWindow)}</strong></header>
      <div class="review-diagnostic-grid">
        <article><span>参考容量</span><strong>${studyCapacityPolicy.referenceHours}h</strong><p>${escapeHtml(studyCapacityPolicy.interpretation)}</p></article>
        <article><span>加量门</span><p>${escapeHtml(studyCapacityPolicy.increase)}</p></article>
        <article><span>保持门</span><p>${escapeHtml(studyCapacityPolicy.hold)}</p></article>
        <article><span>降载门</span><p>${escapeHtml(studyCapacityPolicy.reduce)}</p></article>
      </div>
    `;
  }
}

function renderPlanGovernance() {
  const corrections = document.getElementById("planCorrectionList");
  const roadmap = document.getElementById("oversightRoadmap");
  if (corrections) {
    corrections.innerHTML = studyPlanCorrections.map((item, index) => `
      <article><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(item.issue)}</strong><p>${escapeHtml(item.correction)}</p><em>${escapeHtml(item.action)}</em></div></article>
    `).join("");
  }
  if (roadmap) {
    roadmap.innerHTML = `
      <header><div><span>功能路线</span><strong>监管、时长展示与复盘</strong></div><p>P0 先解决记录是否可信，P1 再做趋势和资料治理，P2 最后扩展共享与恢复提醒。</p></header>
      <div>${oversightFeatureRoadmap.map((feature) => `
        <article><span>${escapeHtml(feature.priority)}</span><strong>${escapeHtml(feature.name)}</strong><p>${escapeHtml(feature.value)}</p><em>${escapeHtml(feature.acceptance)}</em></article>
      `).join("")}</div>
    `;
  }
}

function renderReview() {
  const phase = getCurrentPhase();
  const week = lastDaysEntries(7);
  const days14 = lastDaysEntries(14);
  const weekHours = sumMinutes(week, "total") / 60;
  const avg14 = days14.length ? sumMinutes(days14, "total") / 60 / 14 : 0;
  const coreRatio = sumMinutes(week, "total") ? sumMinutes(week, "core") / sumMinutes(week, "total") : 0;
  const newMistakes = sumMinutes(week, "newMistakes");
  const fixedMistakes = sumMinutes(week, "fixedMistakes");
  const mistakeRatio = newMistakes ? fixedMistakes / newMistakes : 1;
  const activeDays = new Set(week.filter((entry) => entry.total > 0).map((entry) => entry.date)).size;
  const planDate = planTodayISO();
  const monthHours = sumMinutes(entriesArray().filter((entry) => entry.date.startsWith(planDate.slice(0, 7))), "total") / 60;
  const currentMonth = monthlyPlan.find((row) => planDate.startsWith(row[0]));
  const monthTarget = currentMonth ? currentMonth[1] : phase.weeklyTarget * 4;
  const dueCount = reviewRows().filter((item) => isReviewDue(item, planDate)).length;
  const avgSyllabus = Math.round(["math", "cs408", "english", "politics"].reduce((sum, subject) => sum + syllabusProgress(subject).percent, 0) / 4);
  const learningStatus = reviewPosture({
    dueCount,
    activeDays,
    mistakeRatio,
    weekHours,
    weeklyTarget: phase.weeklyTarget,
    coreRatio
  }).load;

  // The banner above already reports weekly hours, core ratio and mistake
  // recovery with the same numbers, so the grid only carries what the banner
  // does not: the breakdown, the backlog and the resulting advice.
  const items = [
    ["本周学习天数", `${activeDays} 天`, "目标 6-7 天"],
    ["14天日均", `${avg14.toFixed(1)}h`, "判断曲线，不看单日"],
    ["本月累计", `${monthHours.toFixed(1)}h`, `月目标 ${monthTarget}h`],
    ["到期复盘", `${dueCount} 项`, dueCount ? "先清到期再开新内容" : "队列正常"],
    ["考纲证据", `${avgSyllabus}%`, "四科平均掌握标记"],
    ["负荷建议", learningStatus, "按完成率与复盘积压调整难度"]
  ];

  document.getElementById("weeklyReview").innerHTML = items.map(([label, value, hint]) => `
    <div class="review-item">
      <span>${label}</span>
      <strong>${value}</strong>
      <span>${hint}</span>
    </div>
  `).join("");

  renderMilestone();
  renderRollingWindowChart();
  renderReviewScience();
  renderReviewModeLayouts({ weekHours, coreRatio, mistakeRatio, activeDays, dueCount, avg14, monthHours, monthTarget, weeklyTarget: phase.weeklyTarget });
  renderPlanGovernance();

  const totalHours = sumMinutes(entriesArray(), "total") / 60;
  document.getElementById("monthTable").innerHTML = monthlyPlan.map((row) => {
    const [month, target, cumulative, math, cs408, other, score] = row;
    const reached = totalHours >= cumulative;
    const current = planTodayISO().startsWith(month) ? " current" : "";
    return `
      <div class="month-row${current}">
        <div class="month-row-head">
          <span>${month} · 参考预算 ${target}h</span>
          <span>${reached ? "达到参考累计" : `参考累计 ${cumulative}h`}</span>
        </div>
        <div class="month-meta">数学：${math} · 408：${cs408} · 其他：${other} · 监测：${score}</div>
      </div>
    `;
  }).join("");
}

function renderRollingWindowChart() {
  const container = document.getElementById("rollingWindowChart");
  if (!container) return;
  const controls = normalizePlanControls(state.settings.planControls);
  const reviews = reviewRows();
  const windows = buildRollingReviewWindows(reviews, planTodayISO(), { controls });
  const maxMinutes = Math.max(1, ...windows.map((item) => item.minutes));
  const signal = reviewLoadSignal(reviews, planTodayISO(), controls);
  container.innerHTML = `
    <article class="rolling-window-summary ${signal.level}">
      <span>滚动复盘负荷</span>
      <strong>${escapeHtml(signal.label)}</strong>
      <p>${escapeHtml(signal.action)}</p>
    </article>
    <div class="rolling-window-bars">
      ${windows.map((item) => `
        <div class="rolling-window-bar">
          <div class="rolling-window-track"><span data-height="${Math.max(4, item.minutes / maxMinutes * 100)}"></span></div>
          <strong>${item.count}</strong>
          <em>${escapeHtml(item.label)}</em>
          <small>${item.minutes}m</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCoach(week, phase) {
  const weekHours = sumMinutes(week, "total") / 60;
  const coreRatio = sumMinutes(week, "total") ? sumMinutes(week, "core") / sumMinutes(week, "total") : 0;
  const streak = currentStreak();
  const mathProgress = syllabusProgress("math").percent;
  const csProgress = syllabusProgress("cs408").percent;
  const englishProgress = syllabusProgress("english").percent;
  const englishDays = lastDaysEntries(7).filter((entry) => sanitizeNumber(entry.english) >= 15).length;
  const dueCount = dueReviewItems(planTodayISO()).length;
  const next = nextMilestone();

  let title = `${phase.name}：先稳住每日底线`;
  let text = `本阶段重点是：${phase.focus}`;
  let pace = "节奏未建立";

  if (streak >= 7 && weekHours >= phase.weeklyTarget * 0.9 && coreRatio >= 0.65) {
    title = "节奏健康，可以推进新内容";
    text = `继续保持数学+408 的核心占比。下一节点 ${next[0]}，参考累计 ${next[2]}h。`;
    pace = "节奏健康";
  } else if (weekHours < phase.weeklyTarget * 0.7 && streak >= 3) {
    title = "执行偏轻，先补核心时长";
    text = "下周减少新增资料，补足数学和 408 日均时间。";
    pace = "需要加固";
  } else if (mathProgress < csProgress - 15) {
    title = "数学考纲进度偏慢";
    text = "今日任务优先安排数学未完成条目。";
    pace = "数学补强";
  } else if (csProgress < mathProgress - 15) {
    title = "408 考纲进度偏慢";
    text = "今日任务优先安排 408 未完成条目。";
    pace = "408 补强";
  } else if (englishDays < 5) {
    title = "英语连续性不足";
    text = `英语一当前图谱 ${englishProgress}%。先保证每天 20 分钟单词和定位句，不用一次补很多。`;
    pace = "英语不断档";
  } else if (dueCount >= 3) {
    title = "复盘债务偏高";
    text = "今日新内容自动收紧，先清最高优先级复盘，其余在复盘页按 D 轮处理。";
    pace = "先复盘";
  }

  document.getElementById("coachTitle").textContent = title;
  document.getElementById("coachText").textContent = text;
  document.getElementById("streakBadge").textContent = `连续 ${streak} 天`;
  document.getElementById("paceBadge").textContent = pace;
}

function renderHeatmap() {
  renderExecutionSignals();
  const container = document.getElementById("heatmap");
  const today = parseDate(planTodayISO());
  const cells = [];
  for (let index = 27; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const iso = formatDateISO(date);
    const entry = entryRow(iso);
    const minutes = entry ? getEntryTotals(entry).total : 0;
    const level = minutes >= 300 ? 4 : minutes >= 180 ? 3 : minutes >= 90 ? 2 : minutes > 0 ? 1 : 0;
    cells.push(`<div class="heat-cell level-${level}" title="${iso} · ${Math.round(minutes / 60 * 10) / 10}h"><span>${date.getDate()}</span></div>`);
  }
  container.innerHTML = cells.join("");
}

function currentStreak() {
  let streak = 0;
  const cursor = parseDate(planTodayISO());
  while (true) {
    const iso = formatDateISO(cursor);
    const entry = entryRow(iso);
    if (!entry || getEntryTotals(entry).total <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function nextMilestone() {
  const totalHours = sumMinutes(entriesArray(), "total") / 60;
  return monthlyPlan.find((row) => totalHours < row[2]) || monthlyPlan[monthlyPlan.length - 1];
}

function renderMilestone() {
  const [month, target, cumulative, math, cs408, other, score] = nextMilestone();
  const totalHours = sumMinutes(entriesArray(), "total") / 60;
  const remaining = Math.max(0, cumulative - totalHours);
  const percent = Math.min(100, totalHours / cumulative * 100);
  document.getElementById("milestoneCard").innerHTML = `
    <div class="milestone-top">
      <div>
        <span>下一节点</span>
        <strong>${month}</strong>
      </div>
      <div>
        <span>还差</span>
        <strong>${remaining.toFixed(1)}h</strong>
      </div>
    </div>
    <div class="progress-track"><div class="progress-fill" data-fill="${percent}"></div></div>
    <p>本月参考预算 ${target}h，参考累计 ${cumulative}h。数学：${math}；408：${cs408}；其他：${other}；监测：${score}。阶段推进仍以证据和趋势为准。</p>
  `;
}

function renderScores() {
  const sorted = [...scoreRows()].sort((a, b) => b.date.localeCompare(a.date));
  const last5 = sorted.slice(0, 5);
  const last10 = sorted.slice(0, 10);
  const avg = averageScores(last5);
  const avg10 = averageScores(last10);
  const weak = weakestScoreSubject(avg);
  const chips = [
    ["近 5 套总分", avg.total ? avg.total.toFixed(1) : "--"],
    ["近 10 套总分", avg10.total ? avg10.total.toFixed(1) : "--"],
    ["数学均分", avg.math ? avg.math.toFixed(1) : "--"],
    ["408均分", avg.cs408 ? avg.cs408.toFixed(1) : "--"],
    ["当前短板", weak]
  ];

  document.getElementById("scoreSummary").innerHTML = chips.map(([label, value]) => `
    <div class="score-chip">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  const trend = document.getElementById("scoreTrend");
  if (trend) {
    const chronological = [...sorted].reverse().slice(-10);
    const maxTotal = Math.max(420, ...chronological.map((score) => Number(score.total) || 0), 1);
    trend.innerHTML = chronological.length ? chronological.map((score) => {
      const total = Number(score.total) || 0;
      const height = Math.max(6, Math.round(total / maxTotal * 100));
      return `<span class="score-trend-bar" title="${escapeAttr(score.date)} · ${escapeAttr(score.name)} · ${total}"><i data-height="${height}"></i><em>${total}</em></span>`;
    }).join("") : `<p class="score-trend-empty">保存两套以上模考后，这里显示总分走向。</p>`;
  }

  document.getElementById("scoreList").innerHTML = sorted.length ? sorted.map((score) => `
    <div class="score-row">
      <div class="score-row-head">
        <span>${escapeHtml(score.date)} · ${escapeHtml(score.name)}</span>
        <span>${Number(score.total) || 0}</span>
      </div>
      <div class="score-meta">政治 ${sanitizeNumber(score.politics)} · 英语 ${sanitizeNumber(score.english)} · 数学 ${sanitizeNumber(score.math)} · 408 ${sanitizeNumber(score.cs408)}${score.note ? ` · ${escapeHtml(score.note)}` : ""}</div>
      <div class="record-actions">
        <button type="button" data-edit-score="${escapeAttr(score.id)}">编辑</button>
        <button type="button" data-delete-score="${escapeAttr(score.id)}">删除</button>
      </div>
    </div>
  `).join("") : `<div class="score-row"><div class="score-meta">还没有模考记录。2027 年 6 月后再重点看总分趋势。</div></div>`;

  document.querySelectorAll("[data-edit-score]").forEach((button) => {
    button.addEventListener("click", () => {
      const score = scoreRows().find((item) => item.id === button.dataset.editScore);
      if (!score) return;
      document.getElementById("scoreDate").value = score.date;
      document.getElementById("scoreName").value = score.name;
      document.getElementById("scorePol").value = score.politics;
      document.getElementById("scoreEng").value = score.english;
      document.getElementById("scoreMath").value = score.math;
      document.getElementById("scoreCs").value = score.cs408;
      document.getElementById("scoreNote").value = score.note || "";
      document.getElementById("scoreForm").dataset.editingScore = score.id;
      clearScoreValidation();
      showToast("已载入模考，可修改后保存。");
    });
  });
  document.querySelectorAll("[data-delete-score]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("确认删除这条模考记录？")) return;
      createLocalSnapshot("before-delete-score");
      markDeleted("scores", button.dataset.deleteScore);
      state.scores = scoreRows().filter((item) => item.id !== button.dataset.deleteScore);
      const saved = saveState();
      renderScores();
      renderDashboard();
      renderSnapshotPanel();
      setLocalSaveResult(saved, "模考记录已删除", "已保留删除前快照，可在账号面板恢复。", "模考删除未写入本机缓存");
    });
  });
}

function weakestScoreSubject(avg) {
  if (!avg.total) return "--";
  const gaps = [
    ["政治", 75 - avg.politics],
    ["英语", 80 - avg.english],
    ["数学", 130 - avg.math],
    ["408", 135 - avg.cs408]
  ].sort((a, b) => b[1] - a[1]);
  return gaps[0][1] > 0 ? gaps[0][0] : "保持";
}

function renderRecentLogs() {
  const recent = entriesArray().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  document.getElementById("recentLogs").innerHTML = recent.length ? recent.map((entry) => {
    const hours = entry.total / 60;
    const coreRatio = entry.total ? Math.round(entry.core / entry.total * 100) : 0;
    const note = entry.note ? ` · ${escapeHtml(entry.note)}` : "";
    return `
      <div class="log-item">
        <div class="log-item-head">
          <span>${entry.date}</span>
          <span>${hours.toFixed(1)}h</span>
        </div>
        <div class="log-meta">数学 ${entry.math || 0}m · 408 ${entry.cs408 || 0}m · 英语 ${entry.english || 0}m · 核心占比 ${coreRatio}%${note}</div>
      </div>
    `;
  }).join("") : `<div class="log-item"><div class="log-meta">还没有记录。今天先填一条，哪怕只有 120 分钟。</div></div>`;
}

function averageScores(scores) {
  if (!scores.length) return { total: 0, politics: 0, english: 0, math: 0, cs408: 0 };
  const sum = scores.reduce((acc, score) => {
    acc.total += score.total || 0;
    acc.politics += score.politics || 0;
    acc.english += score.english || 0;
    acc.math += score.math || 0;
    acc.cs408 += score.cs408 || 0;
    return acc;
  }, { total: 0, politics: 0, english: 0, math: 0, cs408: 0 });
  Object.keys(sum).forEach((key) => {
    sum[key] = sum[key] / scores.length;
  });
  return sum;
}

function resourceStackForSubject(subject) {
  const key = { "数学": "math", "数学一": "math", "408": "cs408", "英语": "english", "英语一": "english", "政治": "politics" }[subject];
  return subjectResourceStacks.find((item) => item.key === key) || null;
}

function resourceStageForPhase(stack, phaseId) {
  if (!stack) return null;
  const phaseIndexes = {
    math: { A: 0, B: 1, C: 1, D: 2, E: 3, F: 4, G: 4, H: 5 },
    cs408: { A: 0, B: 1, C: 2, D: 3, E: 4, F: 4, G: 4, H: 5 },
    english: { A: 0, B: 1, C: 1, D: 2, E: 3, F: 4, G: 4, H: 5 },
    politics: { A: 0, B: 0, C: 0, D: 0, E: 1, F: 2, G: 3, H: 4 }
  };
  const index = phaseIndexes[stack.key]?.[phaseId] ?? 0;
  return stack.stages[Math.min(index, stack.stages.length - 1)];
}

function renderResourcePlaybooks() {
  const phase = getCurrentPhase();
  const playbook = phasePlanById(phase.id);
  const today = planTodayISO();
  const tasks = normalizeTaskList(planTasksForDate(today), today).filter((task) => task.status !== "shifted");
  const firstTask = tasks.find((task) => !isTaskDone(task, state.tasks)) || tasks[0];
  const prescription = firstTask ? phaseSubjectPlan(phase.id, firstTask.subject) : playbook.subjects[0];
  const focusStack = resourceStackForSubject(firstTask?.subject || prescription?.subject) || subjectResourceStacks[0];
  const focusStage = resourceStageForPhase(focusStack, phase.id) || focusStack.stages[0];
  const focusGovernance = resourceSubjectGovernance[focusStack.key] || resourceSubjectGovernance.math;
  const focusControl = resourceStageControl(focusStack.key, focusStage);
  const focus = document.getElementById("resourceFocusLayout");
  if (focus) {
    focus.innerHTML = `
      <div><span>${escapeHtml(focusStage.window)}</span><strong>${escapeHtml(focusStack.subject)}</strong><em>${escapeHtml(focusStage.stage)}</em></div>
      <div class="resource-focus-copy"><span>当前只拿这一套</span><p>${escapeHtml(focusStage.material)}</p><em>${escapeHtml(focusStage.role)}</em></div>
      <div class="resource-now-action"><span>今天怎么用</span><strong>${escapeHtml(focusStage.session)}</strong><em>留下：${escapeHtml(focusStage.evidence)}</em></div>
      <div class="resource-focus-stop"><strong>停用线</strong><span>${escapeHtml(focusStage.switchRule)}</span></div>
      <div class="resource-focus-contract"><p><strong>启用门</strong>${escapeHtml(focusControl.activation)}</p><p><strong>版本</strong>${escapeHtml(focusGovernance.version)}</p></div>
    `;
  }

  const operations = document.getElementById("resourceOperationsLayout");
  if (operations) {
    operations.innerHTML = `
      <header><div><span>阶段 ${escapeHtml(playbook.id)}</span><h3>资料操作台</h3><p>资料不是阅读清单，每次必须连到今日任务、交付和验收。</p></div><strong>${escapeHtml(playbook.name)}</strong></header>
      <div class="resource-operation-grid">
        ${playbook.subjects.map((item) => {
          const stack = resourceStackForSubject(item.subject);
          const stage = resourceStageForPhase(stack, phase.id);
          const control = resourceStageControl(stack?.key || "math", stage);
          return `
            <article>
              <div><strong>${escapeHtml(item.subject)}</strong><span>${escapeHtml(item.hours)}</span></div>
              <h4>${escapeHtml(stage?.material || item.resource)}</h4>
              <p>${escapeHtml(stage?.session || item.dailyTask)}</p>
              <dl><div><dt>产出</dt><dd>${escapeHtml(stage?.evidence || item.output)}</dd></div><div><dt>启用</dt><dd>${escapeHtml(control.activation)}</dd></div><div><dt>停用</dt><dd>${escapeHtml(stage?.switchRule || item.pass)}</dd></div></dl>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  const diagnostic = document.getElementById("resourceDiagnosticLayout");
  if (diagnostic) {
    diagnostic.innerHTML = `
      <header><div><span>资料控制</span><h3>资料选择诊断</h3></div><strong>${subjectResourceStacks.length} 科 · ${subjectResourceStacks.reduce((sum, item) => sum + item.stages.length, 0)} 个使用窗口</strong></header>
      <div class="resource-diagnostic-grid">
        <article><span>范围与角色</span><p>${escapeHtml(resourceGovernanceRules.slice(0, 2).map(([, rule]) => rule).join(" "))}</p></article>
        <article><span>购买与版本</span><p>${escapeHtml(resourceGovernanceRules.slice(2, 4).map(([, rule]) => rule).join(" "))}</p></article>
        <article><span>当前阶段</span><p>${escapeHtml(playbook.weeklyGoal)}</p></article>
        <article><span>替换与纠错</span><p>${escapeHtml(adaptiveAdjustmentRules.find(([label]) => label === "换资料")?.[2] || "一次只替换一套主线。")} ${escapeHtml(studyPlanCorrections.find((item) => item.issue.includes("资料完成"))?.correction || "候补位未触发时保持空置。")}</p></article>
      </div>
    `;
  }
}

function renderResourceSubjectStack() {
  const tabs = document.getElementById("resourceSubjectTabs");
  const grid = document.getElementById("resourceGrid");
  if (!tabs || !grid) return;
  if (!subjectResourceStacks.some((item) => item.key === selectedResourceSubject)) selectedResourceSubject = subjectResourceStacks[0].key;
  tabs.innerHTML = subjectResourceStacks.map((item) => `
    <button type="button" class="seg ${item.key === selectedResourceSubject ? "active" : ""}" data-resource-subject="${escapeAttr(item.key)}" aria-pressed="${item.key === selectedResourceSubject}">${escapeHtml(item.subject)}</button>
  `).join("");
  const stack = subjectResourceStacks.find((item) => item.key === selectedResourceSubject) || subjectResourceStacks[0];
  grid.innerHTML = `
    <section class="resource-protocol-intro"><div><span>主线配置</span><h4>${escapeHtml(stack.subject)}</h4></div><div><p>${escapeHtml(stack.primary)}</p><em>${escapeHtml(stack.decision)}</em></div><div><strong>候补位</strong><p>${escapeHtml(stack.reservePolicy)}</p></div></section>
    <section class="resource-subject-governance"><p><strong>官方锚点</strong>${escapeHtml((resourceSubjectGovernance[stack.key] || resourceSubjectGovernance.math).officialAnchor)}</p><p><strong>启用前置</strong>${escapeHtml((resourceSubjectGovernance[stack.key] || resourceSubjectGovernance.math).prerequisite)}</p><p><strong>冲突检查</strong>${escapeHtml((resourceSubjectGovernance[stack.key] || resourceSubjectGovernance.math).conflict)}</p></section>
    <div class="resource-protocol-list">
      ${stack.stages.map((stage, index) => `
        <article class="resource-protocol-row">
          <div class="resource-protocol-stage"><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(stage.window)}</span><strong>${escapeHtml(stage.stage)}</strong><em>${escapeHtml(stage.role)}</em></div>
          <div class="resource-protocol-main"><h4>${escapeHtml(stage.material)}</h4><p>${escapeHtml(stage.session)}</p><dl><div><dt>必须产出</dt><dd>${escapeHtml(stage.evidence)}</dd></div><div><dt>启用门</dt><dd>${escapeHtml(resourceStageControl(stack.key, stage).activation)}</dd></div><div><dt>停用 / 切换</dt><dd>${escapeHtml(stage.switchRule)}</dd></div><div><dt>预留候补</dt><dd>${escapeHtml(stage.reserve)}</dd></div></dl></div>
        </article>
      `).join("")}
    </div>
  `;
  tabs.querySelectorAll("[data-resource-subject]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedResourceSubject = button.dataset.resourceSubject;
      renderResourceSubjectStack();
      renderResourceDossier();
    });
  });
}

function renderResourceDossier() {
  const container = document.getElementById("resourceDossier");
  if (!container) return;
  container.innerHTML = renderResourceDossierTemplate(subjectResourceStacks, selectedResourceSubject);
  container.querySelectorAll("[data-resource-dossier-subject]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedResourceSubject = button.dataset.resourceDossierSubject;
      renderResourceSubjectStack();
      renderResourceDossier();
    });
  });
}

function renderResources() {
  const assets = ensureAssetContainers();
  renderResourcePlaybooks();
  renderResourceSubjectStack();
  renderResourceDossier();

  document.getElementById("projectChecklist").innerHTML = projectItems.map((item) => {
    const checked = assets.project[item] ? "checked" : "";
    return `
      <label class="check-row">
        <input type="checkbox" data-project="${escapeAttr(item)}" ${checked}>
        <span>${escapeHtml(item)}</span>
      </label>
    `;
  }).join("");

  document.querySelectorAll("[data-project]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      ensureAssetContainers();
      state.project[checkbox.dataset.project] = checkbox.checked;
      state.project.updatedAt = new Date().toISOString();
      const saved = saveState();
      setLocalSaveResult(saved, "项目清单已更新", "项目任务状态已保存。", "项目清单未写入本机缓存");
    });
  });

  renderResourceProgress();
}

function renderResourceProgress() {
  const resourcesState = ensureAssetContainers().resources;
  document.getElementById("resourceProgress").innerHTML = resourceProgressItems.map(([label, key]) => {
    const value = normalizeResourceProgressValue(resourcesState[key]);
    return `
      <label class="resource-progress-row">
        <span>${label}</span>
        <input type="range" min="0" max="100" step="5" value="${value}" data-resource-progress="${escapeAttr(key)}">
        <strong>${value}%</strong>
      </label>
    `;
  }).join("");

  document.querySelectorAll("[data-resource-progress]").forEach((input) => {
    input.addEventListener("input", () => {
      updateResourceProgressInput(input);
    });
    input.addEventListener("change", () => {
      const saved = updateResourceProgressInput(input);
      setLocalSaveResult(saved, "资料进度已更新", `当前进度：${input.value}%。`, "资料进度未写入本机缓存");
    });
  });
}

function updateResourceProgressInput(input) {
  ensureAssetContainers();
  ensureSettingsContainer();
  const value = normalizeResourceProgressValue(input.value);
  const updatedAt = new Date().toISOString();
  input.value = String(value);
  state.resources[input.dataset.resourceProgress] = value;
  state.settings.resourcesUpdatedAt = updatedAt;
  const label = input.closest(".resource-progress-row")?.querySelector("strong");
  if (label) label.textContent = `${value}%`;
  return saveState();
}

function normalizeResourceProgressValue(value) {
  return Math.round(sanitizeNumber(value, 0, 100) / 5) * 5;
}

function renderSettings() {
  ensureSettingsContainer();
  document.getElementById("settingWeekdayMinutes").value = state.settings.weekdayMinutes;
  document.getElementById("settingWeekendMinutes").value = state.settings.weekendMinutes;
  document.getElementById("settingTaskCount").value = state.settings.taskCount;
  document.getElementById("settingCoreRatio").value = state.settings.coreRatio;
  document.getElementById("settingTargetExamDate").value = state.settings.targetExamDate || DEFAULT_EXAM_DATE;
  document.getElementById("settingReviewDays").value = state.settings.reviewDays.join(",");
  const notifications = document.getElementById("settingNotifications");
  if (notifications) notifications.checked = Boolean(state.settings.notificationsEnabled);
  const controls = normalizePlanControls(state.settings.planControls);
  state.settings.planControls = controls;
  setValue("settingMaxNewTopics", controls.maxNewTopics);
  setValue("settingReviewLoad", controls.reviewLoad);
  setValue("settingRollingWindowDays", controls.rollingWindowDays);
  setSelectValue("settingPlanIntensity", controls.planIntensity);
  setSelectValue("settingFocusSubject", controls.focusSubject);
  setSelectValue("settingExperienceTrack", controls.experienceTrack);
  document.querySelectorAll("#settingEnabledSubjects input").forEach((input) => {
    input.checked = controls.enabledSubjects.includes(input.value);
  });
  setText("settingsExamDateStatus", examDateStatusText());
  setText("appBuildText", APP_BUILD);
  renderStorageHealthText();

  document.getElementById("standardsList").innerHTML = [
    ["数据起点", `${PLAN_START_DATE} 从头开始；早于起点的记录、模考、周计划、复盘队列和考纲掌握证据只归档，不参与统计和排程。`],
    ["渐进时长", "首四周从工作日 90m、周末 150m 起步，再按 120/180m、150/210m 爬坡；完成率连续达到 80% 后进入 180/300m 主干预算。"],
    ...highStandards
  ].map(([subject, standard]) => `
    <div class="standard-item">
      <strong>${subject}</strong>
      <p>${standard}</p>
    </div>
  `).join("");

  const customTasks = customTaskRows();
  document.getElementById("customTaskList").innerHTML = customTasks.length ? customTasks.map((task) => `
    <div class="custom-task-row">
      <span>${escapeHtml(task.subject)}</span>
      <strong>${escapeHtml(task.text)}</strong>
      <em>${Number(task.minutes) || 0}m</em>
      <button type="button" data-delete-custom="${escapeAttr(task.id)}">删除</button>
    </div>
  `).join("") : `<div class="empty-state">还没有自定义任务。可以添加固定错题回炉、项目推进或单词任务。</div>`;

  document.querySelectorAll("[data-delete-custom]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = customTaskRows().find((item) => item.id === button.dataset.deleteCustom);
      if (!task) return;
      if (!window.confirm(`确认删除自定义任务“${task.text}”？`)) return;
      createLocalSnapshot("before-delete-custom-task");
      state.settings.customTasksUpdatedAt = new Date().toISOString();
      state.customTasks = customTaskRows().filter((item) => item.id !== button.dataset.deleteCustom);
      const saved = saveState();
      renderSettings();
      renderSnapshotPanel();
      setLocalSaveResult(saved, "自定义任务已删除", "已保留删除前快照，可在账号面板恢复。", "自定义任务删除未写入本机缓存");
    });
  });

  renderSourceRegistry();
  renderDesignReferences();
  renderExecutionBoundaries();
  renderStrategySources();
}

function renderSourceRegistry() {
  const container = document.getElementById("sourceRegistry");
  if (!container) return;
  container.innerHTML = sourceRegistry.map((item) => {
    const url = safeExternalUrl(item.url);
    return `
      <article class="source-card">
        <span>${escapeHtml(item.level)} · ${escapeHtml(item.checkedAt)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.claim)}</p>
        <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
      </article>
    `;
  }).join("");
}

function renderDesignReferences() {
  const container = document.getElementById("designReferences");
  if (!container) return;
  container.innerHTML = designReferences.map(([name, pattern, use]) => `
    <article class="design-card">
      <span>${escapeHtml(name)}</span>
      <strong>${escapeHtml(pattern)}</strong>
      <p>${escapeHtml(use)}</p>
    </article>
  `).join("");
}

function renderExecutionBoundaries() {
  const container = document.getElementById("executionBoundaries");
  if (!container) return;
  const rows = [
    ...executionBoundaries,
    ...methodEvidence.map(([title, text]) => [title, text]),
    ...auditCadenceRules.map((item) => [item.label, item.text]),
    ...studyMetricRules.map(([title, text]) => [title, text])
  ];
  container.innerHTML = rows.map(([title, text]) => `
    <article class="boundary-card">
      <span>规则</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `).join("");
}

function renderStrategySources() {
  const container = document.getElementById("strategySourceGrid");
  if (!container) return;
  container.innerHTML = strategySources.map((item) => `
    <article class="strategy-source-card">
      <span>${escapeHtml(item.source)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.use)}</p>
    </article>
  `).join("");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = safeScalarText(message, "", 1200);
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function installRecoveryMode(error) {
  hydrateIcons();
  setDefaultDates();
  state = freshState();
  renderAuthPanel();
  try {
    renderAll();
  } catch (renderError) {
    console.warn("[rw] recovery render failed", renderError);
  }
  if (document.documentElement.dataset.navBound !== "1") {
    try {
      bindNavigation();
    } catch (navError) {
      console.warn("[rw] recovery navigation wiring failed", navError);
    }
  }
  if (document.documentElement.dataset.authBound !== "1") {
    bindRecoveryAuthControls();
  }
  initRoute();
  setText("syncStatusText", "恢复模式");
  setText("sideDataSave", "恢复模式");
  showToast(`页面已进入恢复模式：${safeErrorMessage(error, "初始化失败")}`);
}

function bindRecoveryAuthControls() {
  const dialog = document.getElementById("authDialog");
  document.getElementById("authForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (passwordRecoveryPending) updatePasswordFromRecovery();
    else authAction("login");
  });
  document.getElementById("authOpenBtn")?.addEventListener("click", () => {
    openAuthDialog(dialog);
  });
  document.getElementById("authCloseBtn")?.addEventListener("click", () => {
    closeAuthDialog(dialog);
  });
  document.getElementById("signInBtn")?.addEventListener("click", () => authAction("login"));
  document.getElementById("signUpBtn")?.addEventListener("click", () => authAction("signup"));
  document.getElementById("resetPasswordBtn")?.addEventListener("click", requestPasswordReset);
  document.getElementById("cancelPasswordRecoveryBtn")?.addEventListener("click", cancelPasswordRecovery);
  document.getElementById("signOutBtn")?.addEventListener("click", signOutAction);
  document.getElementById("syncNowBtn")?.addEventListener("click", manualSyncNow);
  document.getElementById("downloadBackupBtn")?.addEventListener("click", () => downloadStateBackup("manual-backup"));
  document.getElementById("pushLocalBtn")?.addEventListener("click", pushLocalToCloud);
  document.getElementById("keepLocalBtn")?.addEventListener("click", () => keepLocalOnly(dialog));
  document.getElementById("resetLocalBtn")?.addEventListener("click", resetLocalData);
  document.querySelectorAll("#authEmail, #authPassword").forEach((input) => {
    input.addEventListener("input", clearAuthValidation);
  });
  bindPasswordVisibility(hydrateIcons);
  document.documentElement.dataset.authBound = "1";
}

window.__rwDebug = {
  build: APP_BUILD,
  route: setRoute,
  view: activeViewId,
  resetLocal: resetLocalData,
  health: () => ({
    build: APP_BUILD,
    appStarted,
    storageAvailable: browserStorage.available,
    activeView: activeViewId(),
    hash: window.location.hash,
    supabaseConfigured,
    user: currentUser?.email || null
  })
};

// ---------------------------------------------------------------------------
// Testable surface.
//
// This module is the only production implementation, but 6,900 lines of it mix
// DOM wiring with pure state rules. The exports below isolate the pure half so
// `tests/unit/state-rules.test.js` can exercise it with real inputs instead of
// pattern-matching this file's source text.
//
// Everything exported here MUST stay free of DOM, `localStorage`, `state`,
// `currentUser` and Supabase access: it has to be callable with plain arguments.
// New pure rules belong in `src/domain/`, which is the intended long-term home;
// these exports are the seam that makes moving them out safe.
// ---------------------------------------------------------------------------
export {
  // State scaffolding
  migrateState,
  freshState,
  defaultSyncState,
  // Primitives
  isPlainStateObject,
  stateObject,
  stateArray,
  sanitizeBoolean,
  sanitizeEnum,
  sanitizeNumber,
  sanitizeInteger,
  sanitizeText,
  sanitizeStringList,
  booleanValue,
  // First-value coercion
  firstNumberValue,
  firstIntegerValue,
  firstTextValue,
  firstStateLabel,
  firstEnumValue,
  firstBooleanValue,
  firstStringList,
  firstDateKey,
  // Text, key and date safety
  safeScalarText,
  safeErrorMessage,
  safeStateKey,
  firstSafeStateKey,
  safeStateLabel,
  sanitizeDateKey,
  sanitizeDateOrFallback,
  sanitizeUserText,
  sanitizeUser,
  // Numbers, statuses and timestamps
  normalizeRatio,
  normalizeTimestamp,
  timestampMs,
  normalizeTopicStatus,
  normalizeTaskRecordImpact,
  firstTaskRecordImpact,
  // Collection sanitizers
  sanitizeEntries,
  sanitizeScores,
  sanitizeNumericObject,
  sanitizeTopicEvidence,
  sanitizeWeekPlans,
  sanitizeTask,
  sanitizeReviewItems,
  sanitizeCustomTasks,
  sanitizeProjectState,
  sanitizeSnapshots,
  sanitizeSnapshotReason,
  sanitizeSnapshotPayload,
  snapshotRows,
  cloneJson,
  // Clean-start filtering
  isOnOrAfterPlanStart,
  filterEntriesFromStart,
  filterScoresFromStart,
  filterWeekPlansFromStart,
  filterTaskStateFromStart,
  filterReviewItemsFromStart,
  filterTopicEvidenceFromStart,
  filterDeletedFromStart,
  sanitizeTaskState,
  buildCleanStartArchive,
  // Task identity
  taskIdDate,
  hasMalformedDatePrefix,
  taskDateFromWeekPlans,
  // Merge layer
  mergeStateByUpdatedAt,
  mergeArrayById,
  mergeSettingsByVersionedAssets,
  mergeCustomTasks,
  mergeTopicState,
  mergeVersionedObject,
  mergeObjectsByUpdatedAt,
  mergeWeekPlans,
  // Tombstone layer
  mergeDeletedTombstones,
  mergeDeletedTombstoneMeta,
  shouldApplyTombstone,
  pruneTombstone,
  applyTombstones,
  markDeleted,
  unmarkDeleted,
  sanitizeDeleted,
  sanitizeDeletedMeta
};

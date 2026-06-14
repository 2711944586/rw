import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("app imports", () => {
  it("does not shadow the built-in Map constructor with the lucide icon", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toContain("Map as MapIcon");
    expect(source).not.toMatch(/\bMap,\s*\n\s*RefreshCw/);
  });

  it("keeps account controls available in recovery mode", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toContain("function bindRecoveryAuthControls()");
    expect(source).toMatch(/function bindRecoveryAuthControls\(\) \{\s*const dialog = document\.getElementById\("authDialog"\);\s*document\.getElementById\("authForm"\)\?\.addEventListener\("submit", \(event\) => \{\s*event\.preventDefault\(\);\s*authAction\("login"\);\s*\}\);/);
    expect(source).toMatch(/document\.getElementById\("authOpenBtn"\)\?\.addEventListener\("click", \(\) => \{\s*openAuthDialog\(dialog\);\s*\}\);/);
    expect(source).toMatch(/document\.getElementById\("authCloseBtn"\)\?\.addEventListener\("click", \(\) => \{\s*closeAuthDialog\(dialog\);\s*\}\);/);
    expect(source).toContain('document.getElementById("resetLocalBtn")?.addEventListener("click", resetLocalData)');
    expect(source).toMatch(/document\.querySelectorAll\("#authEmail, #authPassword"\)\.forEach\(\(input\) => \{\s*input\.addEventListener\("input", clearAuthValidation\);\s*\}\);\s*document\.documentElement\.dataset\.authBound = "1";\s*\}/);
  });

  it("clears persisted account state when auth no longer has a session", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const signOutBindings = source.match(/document\.getElementById\("signOutBtn"\)\?\.addEventListener\("click", signOutAction\)/g) || [];

    expect(source).toMatch(/function clearLocalSessionState\(lastError = "not-authenticated"\) \{\s*currentUser = null;\s*state\.user = null;\s*state\.sync = \{\s*status: "local",\s*lastSyncAt: "",\s*lastError,\s*pending: false,\s*localImportPending: false,\s*cloudPaused: false\s*\};\s*legacyImportPending = false;\s*const saved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return saved;\s*\}/);
    expect(source).toMatch(/async function signOutAction\(\) \{\s*try \{\s*setAuthBusy\(true\);\s*setAuthResult\("pending", "正在退出", "正在断开云端会话，本机数据会保留。"\);\s*await signOut\(\);\s*const saved = clearLocalSessionState\(""\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "已退出账号", "当前数据已保留在本机。", "退出状态未写入本机缓存"\);\s*\} catch \(error\) \{\s*setAuthResult\("error", "退出失败", friendlyAuthError\(error\)\);\s*\} finally \{\s*setAuthBusy\(false\);\s*renderAuthPanel\(\);/);
    expect(source).toContain('if (mode === "signup" && result?.needsEmailConfirmation) {');
    expect(source).toContain('clearLocalSessionState("email-confirmation-required")');
    expect(source).toContain('clearLocalSessionState(result?.needsEmailConfirmation ? "email-confirmation-required" : "not-authenticated")');
    expect(signOutBindings.length).toBe(2);
  });

  it("clears stale account display when cloud session initialization fails", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toMatch(/async function initCloudSession\(\) \{[\s\S]*\} catch \(error\) \{\s*currentUser = null;\s*state\.user = null;\s*const message = friendlyAuthError\(error\);\s*lastAuthResult = \{\s*status: "error",\s*title: "云端会话不可用",\s*message\s*\};\s*state\.sync = \{ \.\.\.state\.sync, status: "error", lastError: safeErrorMessage\(error, "云端会话不可用"\), pending: false \};\s*const saved = saveState\(\{ skipCloud: true \}\);\s*if \(!saved\) \{\s*lastAuthResult = \{\s*status: "error",\s*title: "云端会话状态未写入本机缓存",\s*message: `\$\{message\} 浏览器阻止写入本机缓存；请立即导出备份，刷新前不要关闭页面。`\s*\};\s*\}\s*renderAuthPanel\(\);\s*\}\s*renderSyncStatus\(\);/);
  });

  it("reports explicit account-panel feedback for manual sync attempts", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const manualSyncBindings = source.match(/document\.getElementById\("syncNowBtn"\)\?\.addEventListener\("click", manualSyncNow\)/g) || [];

    expect(manualSyncBindings.length).toBe(2);
    expect(source).toMatch(/async function manualSyncNow\(\) \{\s*try \{\s*setAuthBusy\(true\);\s*setAuthResult\("pending", "正在同步", "正在检查本机与云端状态。"\);\s*const result = await syncNow\(\);/);
    expect(source).toMatch(/if \(result\?\.ok\) \{[\s\S]*setLocalSaveResult\(result\.localSaved !== false, "同步完成", `本机数据已写入云端。最近同步：\$\{syncedAt\}`, "同步状态未写入本机缓存"\);/);
    expect(source).toMatch(/if \(result\?\.localSaved === false && result\?\.reason !== "sync-error"\) \{\s*setLocalSaveResult\(false, "同步状态已保存", "同步状态已写入本机缓存。", "同步状态未写入本机缓存"\);\s*return;\s*\}/);
    expect(source).toMatch(/if \(result\?\.reason === "cloud-paused"\) \{[\s\S]*setAuthResult\("pending", "云端同步暂停"/);
    expect(source).toMatch(/if \(result\?\.reason === "local-import-pending"\) \{[\s\S]*setAuthResult\("pending", "等待迁移选择"/);
    expect(source).toMatch(/if \(result\?\.reason === "offline"\) \{[\s\S]*setAuthResult\("error", "当前离线"/);
    expect(source).toMatch(/if \(result\?\.reason === "not-authenticated"\) \{[\s\S]*setAuthResult\("error", "未登录"/);
    expect(source).toContain('["signInBtn", "signUpBtn", "signOutBtn", "syncNowBtn", "downloadBackupBtn", "pushLocalBtn", "keepLocalBtn"]');
    expect(source).toContain('document.getElementById("authForm")?.setAttribute("aria-busy", String(isBusy))');
    expect(source).toContain('document.getElementById("migrationBox")?.setAttribute("aria-busy", String(isBusy))');
  });

  it("confirms URL reset requests after removing the reset query", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toMatch(/function consumeResetRequest\(\) \{[\s\S]*const resetValue = url\.searchParams\.get\("reset"\);/);
    expect(source).toContain("return { requested: false, confirmed: false, cleared: false }");
    expect(source).toMatch(/url\.searchParams\.delete\("reset"\);\s*window\.history\.replaceState\(null, "", `\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash \|\| "#dashboard"\}`\);\s*if \(!window\.confirm\("确认清理本浏览器里的学习数据和缓存？建议先导出备份。"\)\) \{\s*return \{ requested: true, confirmed: false, cleared: false \};\s*\}\s*const cleared = clearAppLocalStorage\(\);\s*return \{ requested: true, confirmed: true, cleared \};/);
    expect(source).toContain("const resetRequest = consumeResetRequest()");
    expect(source).toMatch(/if \(resetRequest\.confirmed && resetRequest\.cleared\) \{\s*showToast\("已清理本机缓存，当前为全新本机数据。"\);\s*\} else if \(resetRequest\.confirmed && !resetRequest\.cleared\) \{\s*showToast\("本机缓存未完全清理，请在账号面板重试或手动导出后清理浏览器存储。"\);/);
  });

  it("starts from a fresh in-memory state after a confirmed URL reset", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toMatch(/function loadState\(\) \{\s*if \(resetRequest\.confirmed\) \{\s*const resetState = freshState\(\);[\s\S]*return resetState;\s*\}\s*const currentRaw = readStorage\(STORAGE_KEY\);/);
    expect(source).toMatch(/if \(!resetRequest\.cleared\) \{\s*resetState\.sync = \{\s*\.\.\.resetState\.sync,\s*status: "local",\s*lastError: "local-reset-incomplete",\s*pending: false\s*\};\s*\}/);
  });

  it("clears current and legacy local cache keys during reset", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const clearSource = source.slice(
      source.indexOf("function clearAppLocalStorage"),
      source.indexOf("function consumeResetRequest")
    );

    expect(source).toContain('const STATE_MANAGER_STORAGE_KEY = "pku_swm_420_state"');
    expect(source).toContain('const STATE_MANAGER_DIRTY_KEY = "pku_swm_420_dirty"');
    expect(source).toContain('const OFFLINE_DIRTY_QUEUE_KEY = "pku_swm_420_dirty_queue"');
    expect(source).toContain('const LEGACY_DIRTY_MAP_KEY = "pku_swm_dirty_map"');
    expect(source).toContain('const LEGACY_OFFLINE_CACHE_KEY = "pku_swm_offline_cache"');
    expect(source).toContain('const LEGACY_DIRTY_QUEUE_KEY = "pku_swm_dirty_queue"');
    expect(clearSource).toContain("STORAGE_KEY");
    expect(clearSource).toContain("LEGACY_STORAGE_KEY");
    expect(clearSource).toContain("STATE_MANAGER_STORAGE_KEY");
    expect(clearSource).toContain("STATE_MANAGER_DIRTY_KEY");
    expect(clearSource).toContain("OFFLINE_DIRTY_QUEUE_KEY");
    expect(clearSource).toContain("LEGACY_DIRTY_MAP_KEY");
    expect(clearSource).toContain("LEGACY_OFFLINE_CACHE_KEY");
    expect(clearSource).toContain("LEGACY_DIRTY_QUEUE_KEY");
    expect(clearSource).toContain("].map(removeStorage).every(Boolean)");
    expect(clearSource).toContain("storageAvailable = removed");
    expect(clearSource).toContain("return removed");
    expect(source).toMatch(/function removeStorage\(key\) \{\s*try \{\s*window\.localStorage\.removeItem\(key\);\s*storageAvailable = true;\s*return true;\s*\} catch \{\s*storageAvailable = false;\s*return false;\s*\}\s*\}/);
  });

  it("downloads a backup before clearing local data from the account panel", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const resetRequestSource = source.slice(
      source.indexOf("function consumeResetRequest"),
      source.indexOf("const rampBudgets")
    );

    expect(source).toMatch(/function resetLocalData\(\) \{[\s\S]*window\.confirm\("确认清理本浏览器里的学习数据和缓存？系统会先下载一份 JSON 备份。"\)[\s\S]*try \{\s*exportStateJson\("before-reset"\);\s*\} catch \(error\) \{\s*setAuthResult\("error", "备份下载失败", `未清理本机缓存。请先手动导出备份后再重试：\$\{safeErrorMessage\(error, "浏览器下载失败"\)\}`\);\s*return;\s*\}\s*window\.clearTimeout\(syncTimer\);\s*syncTimer = null;\s*const cacheCleared = clearAppLocalStorage\(\);\s*currentUser = null;\s*state = freshState\(\);[\s\S]*lastAuthResult = \{[\s\S]*title: "本机缓存已清理",[\s\S]*message: "当前页面已断开账号同步。重新登录或刷新后可再次拉取云端数据。"[\s\S]*const saved = saveState\(\{ skipCloud: true \}\);/);
    expect(source).toContain('setLocalSaveResult(cacheCleared && saved, "本机缓存已清理", "已下载备份并断开云端会话。", "本机缓存未完全清理")');
    expect(resetRequestSource).not.toContain('exportStateJson("before-reset")');
  });

  it("routes debug local reset through the protected reset flow", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const debugSource = source.slice(
      source.indexOf("window.__rwDebug = {"),
      source.indexOf("};", source.indexOf("window.__rwDebug = {")) + 2
    );

    expect(debugSource).toContain("resetLocal: resetLocalData");
    expect(debugSource).not.toContain("clearAppLocalStorage()");
    expect(debugSource).not.toContain('window.location.href = "/?reset=1"');
  });

  it("tracks every normal JSON backup download in the backup status", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const downloadBackupBindings = source.match(/document\.getElementById\("downloadBackupBtn"\)\?\.addEventListener\("click", \(\) => downloadStateBackup\("manual-backup"\)\)/g) || [];

    expect(source).toMatch(/function bindImportExport\(\) \{[\s\S]*document\.getElementById\("exportBtn"\)\.addEventListener\("click", \(\) => \{\s*downloadStateBackup\("dashboard"\);\s*\}\);/);
    expect(source).toMatch(/function downloadStateBackup\(label = "dashboard"\) \{\s*try \{\s*exportStateJson\(label\);\s*\} catch \(error\) \{\s*setAuthResult\("error", "备份导出失败", `本次未更新备份状态。请检查浏览器下载权限后重试：\$\{safeErrorMessage\(error, "浏览器下载失败"\)\}`\);\s*return false;\s*\}\s*ensureSettingsContainer\(\);\s*state\.settings\.lastExportDate = todayISO\(\);\s*const saved = saveState\(\);\s*renderStorageStatus\(\);\s*setLocalSaveResult\(saved, "备份已导出", "JSON 备份已下载，备份状态已更新。", "备份状态未写入本机缓存"\);\s*return true;\s*\}/);
    expect(source).toMatch(/function exportStateJson\(label = "dashboard"\) \{[\s\S]*const href = URL\.createObjectURL\(blob\);\s*link\.href = href;[\s\S]*try \{\s*link\.click\(\);\s*\} finally \{\s*URL\.revokeObjectURL\(href\);\s*\}/);
    expect(downloadBackupBindings.length).toBe(2);
    expect(source).toContain('exportStateJson("before-reset")');
    expect(source).not.toContain('downloadStateBackup("before-reset")');
  });

  it("surfaces local-storage write failures without spamming repeated alerts", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toContain("const STORAGE_FAILURE_NOTICE_INTERVAL_MS = 30000");
    expect(source).toContain("let lastStorageFailureNoticeAt = 0");
    expect(source).toMatch(/function saveState\(options = \{\}\) \{[\s\S]*const saved = writeStorage\(STORAGE_KEY, JSON\.stringify\(state\)\);\s*if \(!saved\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "local", lastError: "local-storage-unavailable", pending: false \};\s*notifyStorageWriteFailure\(\);\s*\}[\s\S]*return saved;\s*\}/);
    expect(source).toMatch(/function notifyStorageWriteFailure\(\) \{\s*const now = Date\.now\(\);\s*if \(now - lastStorageFailureNoticeAt < STORAGE_FAILURE_NOTICE_INTERVAL_MS\) return;\s*lastStorageFailureNoticeAt = now;\s*setAuthResult\("error", "本机缓存不可用", "浏览器阻止写入本机缓存，请先导出备份；刷新后本次更改可能不会保留。"\);\s*renderStorageStatus\(\);\s*renderAuthPanel\(\);\s*\}/);
    expect(source).toMatch(/function setLocalSaveResult\(saved, successTitle, successMessage, failureTitle\) \{\s*setAuthResult\(saved \? "success" : "error", saved \? successTitle : failureTitle, saved[\s\S]*浏览器阻止写入本机缓存；本次更改只保留在当前页面。请立即导出备份，刷新前不要关闭页面。/);
    expect(source).toContain("function renderStorageHealthText()");
    expect(source).toMatch(/function renderStorageStatus\(\) \{[\s\S]*renderStorageHealthText\(\);[\s\S]*const container = document\.getElementById\("storageStatus"\);/);
    expect(source).toMatch(/function renderStorageHealthText\(\) \{\s*setText\("storageHealthText", storageAvailable \? "本机缓存正常" : "本机缓存不可用，建议检查浏览器隐私\/存储权限"\);\s*\}/);
  });

  it("marks invalid account fields before auth requests", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

    expect(html).toContain('id="authDialog" aria-labelledby="authDialogTitle" aria-describedby="authHint"');
    expect(html).toContain('<h3 id="authDialogTitle">账号与云同步</h3>');
    expect(html).toContain('id="authForm" novalidate');
    expect(html).toContain('id="authEmail" autocomplete="email" placeholder="you@example.com" aria-describedby="authResult"');
    expect(html).toContain('id="authPassword" autocomplete="current-password" placeholder="至少 6 位" aria-describedby="authResult"');

    expect(appSource).toContain("function validateAuthForm({ email, password })");
    expect(appSource).toMatch(/document\.getElementById\("authOpenBtn"\)\?\.addEventListener\("click", \(\) => \{\s*openAuthDialog\(\);\s*\}\);/);
    expect(appSource).toMatch(/document\.getElementById\("authCloseBtn"\)\?\.addEventListener\("click", \(\) => \{\s*closeAuthDialog\(\);\s*\}\);/);
    expect(appSource).toMatch(/function openAuthDialog\(dialog = document\.getElementById\("authDialog"\)\) \{\s*renderAuthPanel\(\);\s*dialog\?\.showModal\(\);\s*document\.getElementById\("authEmail"\)\?\.focus\(\);\s*\}/);
    expect(appSource).toMatch(/function closeAuthDialog\(dialog = document\.getElementById\("authDialog"\)\) \{\s*if \(dialog\?\.open\) dialog\.close\(\);\s*document\.getElementById\("authOpenBtn"\)\?\.focus\(\);\s*\}/);
    expect(appSource).toContain('emailInput?.setAttribute("aria-invalid", String(!email))');
    expect(appSource).toContain('passwordInput?.setAttribute("aria-invalid", String(!password))');
    expect(appSource).toContain('return { valid: false, title: "邮箱格式不正确"');
    expect(appSource).toContain('return { valid: false, title: "密码太短"');
    expect(appSource).toContain("function clearAuthValidation()");
    expect(appSource).toMatch(/const authValidation = validateAuthForm\(\{ email, password \}\);\s*if \(!authValidation\.valid\) \{/);
    expect(appSource).toContain('document.querySelectorAll("#authEmail, #authPassword").forEach((input) => {');
    expect(css).toContain('.auth-card input[aria-invalid="true"]');
  });

  it("honors paused cloud sync before pulling or pushing remote state", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const displayStatusSource = appSource.match(/function syncDisplayStatus\(sync = state\.sync\) \{[\s\S]*?\n\}/)?.[0];
    const { syncDisplayStatus } = new Function(`${displayStatusSource}; return { syncDisplayStatus };`)();

    expect(html).toContain('id="migrationText"');
    expect(appSource).toMatch(/onAuthChange\(async \(user\) => \{[\s\S]*let localSaved = true;\s*if \(user\) \{\s*const pullResult = await pullCloudState\(\);\s*localSaved = pullResult\?\.localSaved !== false;\s*\} else \{\s*state\.sync = \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : "local",\s*pending: false,\s*lastError: "not-authenticated"[\s\S]*localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*renderSyncStatus\(\);\s*renderAll\(\);\s*renderAuthPanel\(\);\s*if \(!localSaved\) \{\s*setLocalSaveResult\(false, "账号会话状态已保存", "账号会话状态已写入本机缓存。", "账号会话状态未写入本机缓存"\);/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{[\s\S]*if \(state\.sync\?\.cloudPaused\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "cloud-paused", localSaved \};\s*\}[\s\S]*if \(state\.sync\?\.localImportPending\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "local-import-pending", localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{\s*if \(!currentUser \|\| !supabaseConfigured\) \{\s*const reason = currentUser && !supabaseConfigured \? "unconfigured" : "not-authenticated";\s*if \(!currentUser\) state\.user = null;\s*state\.sync = \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : \(currentUser \? "unconfigured" : "local"\),\s*pending: false,\s*lastError: reason[\s\S]*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason, localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{[\s\S]*const cloudState = await loadCloudState\(state\);\s*if \(!cloudState\) \{\s*currentUser = null;\s*state\.user = null;\s*state\.sync = \{ \.\.\.state\.sync, status: "local", pending: false, lastError: "not-authenticated" \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "not-authenticated", localSaved \};\s*\}\s*if \(cloudState\) \{\s*state = migrateState\(mergeStateByUpdatedAt\(state, cloudState\)\);\s*state\.sync = \{\s*status: "synced",\s*lastSyncAt: new Date\(\)\.toISOString\(\),\s*lastError: "",\s*pending: false,\s*localImportPending: false,\s*cloudPaused: false\s*\};\s*legacyImportPending = false;\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*return \{ ok: true, pulled: true, localSaved \};\s*\}\s*return \{ ok: true, pulled: true, localSaved: true \};/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{[\s\S]*\} catch \(error\) \{\s*const message = safeErrorMessage\(error, "拉取云端失败"\);\s*state\.sync = \{ \.\.\.state\.sync, status: "error", lastError: message, pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "pull-failed", error: message, localSaved \};\s*\}/);
    expect(appSource).toMatch(/function queueCloudSync\(\) \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : \(currentUser \? "unconfigured" : "local"\),[\s\S]*if \(state\.sync\?\.localImportPending\)[\s\S]*if \(state\.sync\?\.cloudPaused\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};/);
    expect(appSource).toMatch(/function queueCloudSync\(\) \{[\s\S]*if \(!currentUser \|\| !supabaseConfigured\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*if \(state\.sync\?\.localImportPending\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*if \(state\.sync\?\.cloudPaused\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*if \(navigator && navigator\.onLine === false\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*saveState\(\{ skipCloud: true \}\);\s*window\.clearTimeout\(syncTimer\);/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{\s*if \(!currentUser \|\| !supabaseConfigured\) \{\s*const reason = currentUser && !supabaseConfigured \? "unconfigured" : "not-authenticated";\s*if \(!currentUser\) state\.user = null;\s*state\.sync = \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : \(currentUser \? "unconfigured" : "local"\),\s*pending: false,\s*lastError: reason[\s\S]*const localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*renderAuthPanel\(\);[\s\S]*return \{ ok: false, reason, localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{[\s\S]*if \(state\.sync\?\.localImportPending && !options\.force\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*showToast\("检测到旧版本地数据。请在账号面板选择导入云端或保留本机。"\);\s*return \{ ok: false, reason: "local-import-pending", localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{[\s\S]*if \(state\.sync\?\.cloudPaused && !options\.force\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*return \{ ok: false, reason: "cloud-paused", localSaved \};/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{[\s\S]*if \(navigator && navigator\.onLine === false\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "offline", pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "offline", localSaved \};\s*\}/);
    expect(appSource).toContain("const result = await saveCloudState(state, { force: Boolean(options.force) })");
    expect(appSource).toMatch(/if \(result\?\.skipped\) \{\s*const reason = result\.reason \|\| "sync-skipped";[\s\S]*if \(reason === "not-authenticated"\) \{\s*currentUser = null;\s*state\.user = null;\s*\}[\s\S]*status: reason === "cloud-paused" \? "paused" : \(reason === "local-import-pending" \? "pending" : "local"\),\s*pending: reason === "local-import-pending",[\s\S]*const localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*return \{ ok: false, reason, localSaved \};\s*\}/);
    expect(appSource).toMatch(/state\.sync = \{\s*status: "synced",\s*lastSyncAt: result\?\.syncedAt \|\| new Date\(\)\.toISOString\(\),\s*lastError: "",\s*pending: false,\s*localImportPending: false,\s*cloudPaused: false\s*\};\s*legacyImportPending = false;\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: true, syncedAt: state\.sync\.lastSyncAt, localSaved \};/);
    expect(appSource).toMatch(/\} catch \(error\) \{\s*const message = safeErrorMessage\(error, "同步失败"\);\s*state\.sync = \{ \.\.\.state\.sync, status: "error", lastError: message, pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*const syncError = friendlySyncError\(message\);\s*setAuthResult\("error", localSaved \? "同步失败" : "同步状态未写入本机缓存", localSaved[\s\S]*return \{ ok: false, reason: "sync-error", error: message, localSaved \};\s*\}/);
    expect(syncSource).toMatch(/export async function saveCloudState\(state, options = \{\}\) \{\s*if \(asBoolean\(state\?\.sync\?\.cloudPaused\) && !options\.force\) return \{ skipped: true, reason: "cloud-paused" \};\s*if \(asBoolean\(state\?\.sync\?\.localImportPending\) && !options\.force\) return \{ skipped: true, reason: "local-import-pending" \};\s*const user = await getCurrentUser\(\);\s*if \(!supabase \|\| !user\) return \{ skipped: true, reason: "not-authenticated" \};/);
    expect(appSource).toContain('paused: "云端暂停"');
    expect(syncDisplayStatus({ cloudPaused: true, status: "paused" })).toBe("paused");
    expect(syncDisplayStatus({ cloudPaused: true, status: "syncing" })).toBe("syncing");
    expect(syncDisplayStatus({ cloudPaused: true, status: "error" })).toBe("error");
    expect(appSource).toContain("const status = syncDisplayStatus()");
    expect(appSource).toContain('if (pill) pill.dataset.status = status || "local"');
    expect(appSource).toContain("state.sync?.localImportPending || legacyImportPending || state.sync?.cloudPaused");
    expect(appSource).toContain("已选择保留本机，云端同步暂停。要恢复同步，请先下载备份，再点击“导入云端”。");
    expect(appSource).toMatch(/function keepLocalOnly\(dialog\) \{\s*state\.sync = \{ \.\.\.state\.sync, localImportPending: false, cloudPaused: true, status: "paused", pending: false \};\s*legacyImportPending = false;\s*const saved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*setLocalSaveResult\(saved, "已保留本机数据", "云端同步已暂停。", "保留本机选择未写入本机缓存"\);\s*if \(saved\) closeAuthDialog\(dialog\);\s*\}/);
    expect(appSource).toContain('document.getElementById("pushLocalBtn")?.addEventListener("click", pushLocalToCloud)');
    expect(appSource).toContain('document.getElementById("keepLocalBtn")?.addEventListener("click", () => keepLocalOnly(document.getElementById("authDialog")))');
    expect(appSource).toContain('document.getElementById("keepLocalBtn")?.addEventListener("click", () => keepLocalOnly(dialog))');
    expect(appSource).toMatch(/const pullResult = await pullCloudState\(\);\s*if \(!pullResult\?\.ok\) \{[\s\S]*if \(pullResult\?\.reason === "cloud-paused"\)[\s\S]*if \(pullResult\?\.reason === "local-import-pending"\)[\s\S]*const pullMessage = pullResult\?\.error \|\| state\.sync\?\.lastError \|\| "拉取云端失败";[\s\S]*"登录成功，但拉取云端失败"[\s\S]*return;\s*\}\s*if \(pullResult\.localSaved === false\) \{\s*renderAll\(\);\s*renderAuthPanel\(\);\s*setLocalSaveResult\(false, "云端拉取完成", "云端数据已写入本机缓存。", "云端拉取未写入本机缓存"\);\s*return;\s*\}\s*const syncResult = await syncNow\(\);/);
    expect(appSource).toMatch(/if \(syncResult\?\.reason === "cloud-paused"\) \{[\s\S]*setAuthResult\("pending", "已登录，云端同步暂停"/);
    expect(appSource).toMatch(/if \(syncResult\?\.reason === "local-import-pending"\) \{[\s\S]*setAuthResult\("pending", "已登录，等待迁移选择"/);
    expect(appSource).toMatch(/const localSaved = syncResult\.localSaved !== false;\s*setLocalSaveResult\(localSaved, mode === "signup" \? "注册成功" : "登录成功", `当前账号：\$\{currentUser\.email \|\| email\}。数据已开启云同步。`, "登录状态未写入本机缓存"\);\s*if \(localSaved\) showToast\(mode === "signup" \? "注册成功，已登录并开启云同步。" : "登录成功，数据已同步。"\);/);
  });

  it("keeps migration and paused sync choices until cloud import succeeds", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.match(/function cloudImportFailureMessage\(result\) \{[\s\S]*?\n\}/)?.[0];
    const helpers = new Function(`
      function friendlySyncError(message) { return "friendly:" + message; }
      ${helperSource}
      return { cloudImportFailureMessage };
    `)();

    expect(appSource).toMatch(/async function pushLocalToCloud\(\) \{\s*try \{\s*setAuthBusy\(true\);\s*setAuthResult\("pending", "正在导入云端", "正在把本机数据写入云端，请保持页面打开。"\);\s*createLocalSnapshot\("before-cloud-import"\);\s*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true, lastError: "" \};\s*const result = await syncNow\(\{ force: true \}\);\s*if \(result\?\.ok\) legacyImportPending = false;\s*const saved = saveState\(\{ skipCloud: true \}\);/);
    expect(appSource).toMatch(/if \(result\?\.ok\) \{\s*setLocalSaveResult\(saved, "导入云端完成", "本机数据已导入云端，同步已恢复。", "导入云端状态未写入本机缓存"\);\s*\} else \{\s*const detail = cloudImportFailureMessage\(result\);\s*setAuthResult\("error", saved \? "导入云端失败" : "导入云端状态未写入本机缓存", saved[\s\S]*浏览器阻止写入本机缓存；本机迁移选择只保留在当前页面。请立即导出备份。`\);\s*\}\s*\} catch \(error\) \{\s*const message = safeErrorMessage\(error, "导入云端失败"\);\s*state\.sync = \{ \.\.\.state\.sync, status: "error", lastError: message, pending: false \};\s*const saved = saveState\(\{ skipCloud: true \}\);\s*const detail = friendlySyncError\(message\);\s*setAuthResult\("error", saved \? "导入云端失败" : "导入云端状态未写入本机缓存", saved[\s\S]*浏览器阻止写入本机缓存；本机迁移选择只保留在当前页面。请立即导出备份。`\);\s*\} finally \{\s*setAuthBusy\(false\);\s*renderAuthPanel\(\);/);
    expect(helpers.cloudImportFailureMessage({ error: "duplicate key" })).toBe("friendly:duplicate key");
    expect(helpers.cloudImportFailureMessage({ reason: "offline" })).toContain("当前离线");
    expect(helpers.cloudImportFailureMessage({ reason: "unconfigured" })).toContain("云端未配置");
    expect(helpers.cloudImportFailureMessage({ reason: "not-authenticated" })).toContain("当前未登录");
    expect(appSource).not.toContain('state.sync = { ...state.sync, localImportPending: false, cloudPaused: false, status: "pending", pending: true }');
  });

  it("preserves guarded sync choices when the browser network changes", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const networkSource = appSource.slice(
      appSource.indexOf("function bindNetworkStatus"),
      appSource.indexOf("function upgradeGeneratedPlans")
    );

    expect(networkSource).toContain('window.addEventListener("online", async () => {');
    expect(networkSource).toContain('state.sync?.status === "offline" && state.sync?.pending && !state.sync?.localImportPending && !state.sync?.cloudPaused');
    expect(networkSource).toMatch(/const result = await syncNow\(\);\s*if \(result\?\.localSaved === false && result\?\.reason !== "sync-error"\) \{\s*setLocalSaveResult\(false, "网络恢复状态已保存", "网络恢复后的同步状态已写入本机缓存。", "网络恢复同步状态未写入本机缓存"\);/);
    expect(networkSource).toMatch(/renderSyncStatus\(\);\s*renderAuthPanel\(\);/);
    expect(networkSource).toContain('window.addEventListener("offline", () => {');
    expect(networkSource).toMatch(/if \(state\.sync\?\.cloudPaused\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};\s*\} else if \(state\.sync\?\.localImportPending \|\| legacyImportPending\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*\} else if \(!currentUser \|\| !supabaseConfigured\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: currentUser \? "unconfigured" : "local", pending: false \};\s*\} else \{\s*state\.sync = \{ \.\.\.state\.sync, status: "offline", pending: true \};\s*\}/);
    expect(networkSource).toMatch(/const saved = saveState\(\{ skipCloud: true \}\);\s*renderAuthPanel\(\);\s*if \(!saved\) \{\s*setLocalSaveResult\(false, "离线状态已保存", "离线状态已写入本机缓存。", "离线状态未写入本机缓存"\);/);
  });

  it("reports storage failures during startup plan upgrades", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(appSource).toMatch(/async function bootstrapApp\(\) \{[\s\S]*const upgradeSaved = upgradeGeneratedPlans\(\);\s*await initCloudSession\(\);\s*renderAll\(\);\s*initRoute\(\);\s*appStarted = true;\s*if \(upgradeSaved === false\) setLocalSaveResult\(false, "启动升级已保存", "计划升级状态已写入本机缓存。", "启动升级未写入本机缓存"\);/);
    expect(appSource).toMatch(/function upgradeGeneratedPlans\(\) \{\s*state\.settings = stateObject\(state\.settings\);\s*const weekPlans = ensurePlanContainers\(\);\s*if \(state\.settings\.planLogicVersion === PLAN_LOGIC_VERSION\) return true;[\s\S]*state\.settings\.planLogicVersion = PLAN_LOGIC_VERSION;\s*return saveState\(\{ skipCloud: true \}\);\s*\}/);
  });

  it("keeps view routing state available to assistive technology", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const fallbackSource = fs.readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(html).toContain('id="main-content" tabindex="-1"');
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/<section class="view" id="today" hidden aria-hidden="true">/);

    for (const source of [appSource, fallbackSource]) {
      expect(source).toContain('item.setAttribute("aria-current", "page")');
      expect(source).toContain('item.removeAttribute("aria-current")');
      expect(source).toContain("view.hidden = !active");
      expect(source).toContain('view.setAttribute("aria-hidden", String(!active))');
    }

    expect(appSource).toContain('button.setAttribute("aria-pressed", String(active))');
    expect(appSource).toContain('const DENSITY_BUTTON_SELECTOR = ".density-toggle button[data-density]"');
    expect(appSource).toContain("document.querySelectorAll(DENSITY_BUTTON_SELECTOR)");
    expect(appSource).toContain('setLocalSaveResult(saved, "信息密度已切换", `当前为：${densityLabel(state.settings.density)}。`, "信息密度未写入本机缓存")');
    expect(appSource).not.toContain('document.querySelectorAll("[data-density]")');
  });

  it("exposes syllabus subject tabs as pressed segmented controls", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(html).toContain('<div class="segmented" role="group" aria-label="考纲科目切换">');
    expect(html).toContain('<button class="seg active" type="button" data-syllabus="math" aria-pressed="true">数学一</button>');
    expect(html).toContain('<button class="seg" type="button" data-syllabus="cs408" aria-pressed="false">408</button>');
    expect(appSource).toMatch(/document\.querySelectorAll\("\.seg"\)\.forEach\(\(item\) => \{\s*item\.classList\.remove\("active"\);\s*item\.setAttribute\("aria-pressed", "false"\);\s*\}\);\s*button\.classList\.add\("active"\);\s*button\.setAttribute\("aria-pressed", "true"\);\s*renderSyllabus\(button\.dataset\.syllabus\);/);
  });

  it("normalizes invalid hash routes back to the dashboard", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const fallbackSource = fs.readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");

    expect(appSource).toContain('const DEFAULT_VIEW_ID = "dashboard"');
    expect(appSource).toContain("function normalizeHashRoute(options = {})");
    expect(appSource).toContain("const nextView = isValidView(view) ? view : DEFAULT_VIEW_ID");
    expect(appSource).toMatch(/window\.addEventListener\("hashchange", \(\) => \{\s*normalizeHashRoute\(\{ moveFocus: true \}\);/);
    expect(appSource).toMatch(/window\.addEventListener\("pageshow", \(\) => \{\s*normalizeHashRoute\(\);/);
    expect(appSource).toMatch(/function initRoute\(\) \{\s*normalizeHashRoute\(\);/);

    expect(fallbackSource).toContain('const defaultViewId = "dashboard"');
    expect(fallbackSource).toContain("const nextView = isValidView(viewId) ? viewId : defaultViewId");
    expect(fallbackSource).toContain("setView(currentHashView())");
  });

  it("gives explicit feedback for custom task and import form failures", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const customMinutesSource = appSource.match(/function isValidCustomTaskMinutes\(minutes\) \{[\s\S]*?\n\}/);
    const isValidCustomTaskMinutes = new Function(`${customMinutesSource?.[0]}; return isValidCustomTaskMinutes;`)();

    expect(isValidCustomTaskMinutes(10)).toBe(true);
    expect(isValidCustomTaskMinutes(240)).toBe(true);
    expect(isValidCustomTaskMinutes(9)).toBe(false);
    expect(isValidCustomTaskMinutes(241)).toBe(false);
    expect(isValidCustomTaskMinutes(10.5)).toBe(false);

    expect(appSource).toContain("function validateCustomTaskForm({ subject, text, minutes })");
    expect(appSource).toContain("function isValidCustomTaskMinutes(minutes)");
    expect(appSource).toContain("[document.getElementById(\"customMinutes\"), isValidCustomTaskMinutes(minutes)]");
    expect(appSource).toContain('input?.setAttribute("aria-invalid", String(!valid))');
    expect(appSource).toContain('showToast("请补全自定义任务的科目、任务，并把分钟数填写为 10-240 的整数。")');
    expect(appSource).toContain("function clearCustomTaskValidation()");
    expect(appSource).toContain('input.removeAttribute("aria-invalid")');
    expect(appSource).toMatch(/const saved = saveState\(\);\s*event\.target\.reset\(\);\s*clearCustomTaskValidation\(\);\s*renderSettings\(\);\s*setLocalSaveResult\(saved, "自定义任务已添加", "任务模板已加入设置页列表。", "自定义任务未写入本机缓存"\);/);
    expect(appSource).toContain('input.value = ""');
    expect(appSource).toContain('reader.onerror = () => {');
    expect(appSource).toContain("function setImportBusy(isBusy)");
    expect(appSource).toContain('input.setAttribute("aria-busy", String(isBusy))');
    expect(appSource).toContain('label?.setAttribute("aria-disabled", String(isBusy))');

    expect(html).toContain('id="customMinutes" inputmode="numeric"');
    expect(css).toContain('.custom-task-form input[aria-invalid="true"]');
    expect(css).toContain('.import-label[aria-disabled="true"]');
  });

  it("validates and confirms JSON imports before replacing local state", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const candidateSource = appSource.slice(
      appSource.indexOf("function isPlainImportRecord"),
      appSource.indexOf("function importConfirmationMessage")
    );
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function safeStateKey")
    );
    const countsSource = appSource.match(/function importStateCounts\(nextState\) \{[\s\S]*?\n\}/);
    const messageSource = appSource.match(/function importConfirmationMessage\(nextState\) \{[\s\S]*?\n\}/);
    const importFileSource = appSource.match(/function isLikelyJsonImportFile\(file\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      ${importFileSource?.[0]}
      ${candidateSource}
      ${shapeHelperSource}
      ${countsSource?.[0]}
      ${messageSource?.[0]}
      return { extractImportStatePayload, isImportPayloadCandidate, importStateCounts, importConfirmationMessage, isLikelyJsonImportFile };
    `)();

    expect(helpers.isLikelyJsonImportFile({ name: "backup.JSON", type: "" })).toBe(true);
    expect(helpers.isLikelyJsonImportFile({ name: "backup", type: "application/json" })).toBe(true);
    expect(helpers.isLikelyJsonImportFile({ name: "backup", type: "application/vnd.app+json" })).toBe(true);
    expect(helpers.isLikelyJsonImportFile({ name: "records.csv", type: "text/csv" })).toBe(false);

    expect(helpers.isImportPayloadCandidate(null)).toBe(false);
    expect(helpers.isImportPayloadCandidate([])).toBe(false);
    expect(helpers.isImportPayloadCandidate({ foo: "bar" })).toBe(false);
    expect(helpers.isImportPayloadCandidate({ sync: { status: "synced" } })).toBe(false);
    expect(helpers.isImportPayloadCandidate({ user: { email: "old@example.com" } })).toBe(false);
    expect(helpers.isImportPayloadCandidate({ schemaVersion: 3 })).toBe(false);
    expect(helpers.isImportPayloadCandidate({ entries: {} })).toBe(true);
    expect(helpers.isImportPayloadCandidate({ project: { README: true } })).toBe(true);
    expect(helpers.isImportPayloadCandidate({ deleted_meta: { tasks: {} } })).toBe(true);
    expect(helpers.isImportPayloadCandidate({ snapshots: [{ payload: { entries: {} } }] })).toBe(true);
    expect(helpers.extractImportStatePayload({ payload: { entries: { "2026-06-08": {} } } })).toEqual({ entries: { "2026-06-08": {} } });
    expect(helpers.extractImportStatePayload({ state: { settings: { density: "focus" } } })).toEqual({ settings: { density: "focus" } });

    const counts = helpers.importStateCounts({
      entries: { "2026-06-08": {}, "2026-06-16": {} },
      scores: [{ id: "s1" }],
      weekPlans: { "2026-06-08": [{ id: "t1" }, { id: "t2" }] },
      reviewItems: [{ id: "r1" }],
      customTasks: [{ id: "c1" }],
      resources: { math: 40, cs: 20 }
    });
    expect(counts).toEqual({ entries: 2, scores: 1, weekTasks: 2, reviews: 1, customTasks: 1, resources: 2 });
    expect(helpers.importStateCounts({
      entries: "bad-entries",
      scores: { 0: { id: "bad-score" } },
      weekPlans: { "2026-06-08": "bad-task-list", "2026-06-16": [{ id: "t1" }, "bad-task"] },
      reviewItems: "bad-reviews",
      customTasks: [null, { id: "c1" }],
      resources: "bad-resources"
    })).toEqual({ entries: 0, scores: 0, weekTasks: 1, reviews: 0, customTasks: 1, resources: 0 });
    expect(helpers.importConfirmationMessage({
      entries: { "2026-06-08": {} },
      scores: [],
      weekPlans: {},
      reviewItems: [],
      customTasks: [],
      resources: {}
    })).toContain("确认导入这份备份？当前本机数据会先保存为快照。");

    expect(appSource).toContain("function isImportPayloadCandidate(payload)");
    expect(appSource).toContain("function isLikelyJsonImportFile(file)");
    expect(appSource).toContain('setAuthResult("error", "导入失败", "不是有效的 JSON 数据。")');
    expect(appSource).toContain('setAuthResult("error", "导入失败", "请选择本应用导出的 JSON 备份。")');
    expect(appSource).toContain('setAuthResult("idle", "导入已取消", "当前数据未改变。")');
    expect(appSource).toContain('const input = event.target');
    expect(appSource).toContain('const file = input.files?.[0]');
    expect(appSource).toMatch(/if \(!isLikelyJsonImportFile\(file\)\) \{\s*input\.value = "";\s*setAuthResult\("error", "导入失败", "请选择 \.json 备份文件。"\);\s*return;\s*\}/);
    expect(appSource).toContain("const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024");
    expect(appSource).toMatch(/if \(file\.size > MAX_IMPORT_FILE_BYTES\) \{\s*input\.value = "";\s*setAuthResult\("error", "导入失败", "备份文件超过 10MB，请确认是否选错文件。"\);\s*return;\s*\}/);
    expect(appSource).toMatch(/setImportBusy\(true\);\s*setAuthResult\("pending", "正在导入备份", "正在读取并验证 JSON 备份。"\);\s*const finishImport = \(\) => \{\s*input\.value = "";\s*setImportBusy\(false\);\s*\};/);
    expect(appSource).toMatch(/try \{\s*reader\.readAsText\(file\);\s*\} catch \{\s*setAuthResult\("error", "导入失败", "无法读取这个文件。"\);\s*finishImport\(\);/);
    expect(appSource).toContain('setAuthResult("error", "导入失败", "处理备份时出错，请导出当前数据后重试。")');
    expect(appSource).toMatch(/const importPayload = extractImportStatePayload\(imported\);\s*if \(!importPayload\) \{[\s\S]*?return;\s*\}\s*const migratedState = migrateState\(importPayload\);\s*const nextState = protectImportedSession\(migratedState\);/);
    expect(appSource).toMatch(/const nextState = protectImportedSession\(migratedState\);\s*if \(!window\.confirm\(importConfirmationMessage\(nextState\)\)\) \{[\s\S]*?return;\s*\}\s*const snapshot = createLocalSnapshot\("before-import"\);/);
    expect(appSource).toMatch(/state = nextState;\s*state\.snapshots = \[snapshot, \.\.\.snapshotRows\(state\.snapshots\)\]\.slice\(0, 5\);\s*const saved = saveState\(\);\s*renderAll\(\);\s*renderSnapshotPanel\(\);\s*setLocalSaveResult\(saved, "导入完成", "已保留导入前快照，可在账号面板恢复。", "导入未写入本机缓存"\);/);
  });

  it("protects current account identity and sync consent when importing legacy backups", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.slice(
      appSource.indexOf("function currentSessionUser"),
      appSource.indexOf("function isImportPayloadCandidate")
    );
    const helpers = new Function(`
      function sanitizeBoolean(value) {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (["true", "1", "yes", "on"].includes(normalized)) return true;
          if (["false", "0", "no", "off", ""].includes(normalized)) return false;
        }
        return Boolean(value);
      }
      function isPlainStateObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
      }
      function stateObject(value) {
        return isPlainStateObject(value) ? value : {};
      }
      function safeStateKey(key, maxLength = 160) {
        const text = String(key || "").trim();
        if (!text || text.length > maxLength || ["__proto__", "constructor", "prototype"].includes(text)) return "";
        return text;
      }
      function sanitizeUserText(value, maxLength = 254) {
        const type = typeof value;
        if (!["string", "number", "bigint"].includes(type)) return "";
        return safeStateKey(value, maxLength);
      }
      ${helperSource}
      return { currentSessionUser, syncStateAfterJsonImport, protectImportedSession };
    `)();

    const legacyBackupState = {
      entries: { "2026-06-08": { math: 45 } },
      sync: { status: "paused", lastSyncAt: "2026-06-01T00:00:00.000Z", lastError: "legacy-error", cloudPaused: true },
      user: { id: "legacy-user", email: "legacy@example.com" }
    };
    const currentUser = { id: "current-user", email: "current@example.com" };

    expect(helpers.currentSessionUser({ email: "fallback@example.com" }, { id: "u1" })).toEqual({
      id: "u1",
      email: "fallback@example.com"
    });
    expect(helpers.currentSessionUser({ email: "fallback@example.com" }, { id: { bad: true }, email: { bad: true } })).toEqual({
      id: "",
      email: "fallback@example.com"
    });
    expect(helpers.currentSessionUser({ email: { bad: true } }, { id: { bad: true }, email: { bad: true } })).toBeNull();
    expect(helpers.currentSessionUser({ email: "fallback@example.com" }, null)).toBeNull();
    expect(helpers.syncStateAfterJsonImport({ cloudPaused: false }, currentUser, true)).toEqual({
      status: "pending",
      lastSyncAt: "",
      lastError: "",
      pending: true,
      localImportPending: false,
      cloudPaused: false
    });
    expect(helpers.syncStateAfterJsonImport({ cloudPaused: "false" }, currentUser, true)).toMatchObject({
      status: "pending",
      pending: true,
      cloudPaused: false
    });
    expect(helpers.syncStateAfterJsonImport({ cloudPaused: true }, currentUser, true)).toEqual({
      status: "paused",
      lastSyncAt: "",
      lastError: "",
      pending: false,
      localImportPending: false,
      cloudPaused: true
    });
    expect(helpers.syncStateAfterJsonImport({ cloudPaused: "true" }, currentUser, true)).toMatchObject({
      status: "paused",
      pending: false,
      cloudPaused: true
    });
    expect(helpers.syncStateAfterJsonImport({ cloudPaused: false }, currentUser, false)).toMatchObject({
      status: "unconfigured",
      pending: false,
      cloudPaused: false
    });

    expect(helpers.protectImportedSession(
      legacyBackupState,
      { sync: { cloudPaused: false }, user: { id: "old-current", email: "old-current@example.com" } },
      currentUser,
      true
    )).toEqual({
      entries: legacyBackupState.entries,
      sync: {
        status: "pending",
        lastSyncAt: "",
        lastError: "",
        pending: true,
        localImportPending: false,
        cloudPaused: false
      },
      user: { id: "current-user", email: "current@example.com" }
    });
    expect(helpers.protectImportedSession(
      legacyBackupState,
      { sync: { cloudPaused: true }, user: { id: "old-current", email: "old-current@example.com" } },
      currentUser,
      true
    ).sync).toMatchObject({ status: "paused", pending: false, cloudPaused: true });
    expect(helpers.protectImportedSession(
      legacyBackupState,
      { sync: { cloudPaused: false }, user: null },
      null,
      true
    ).user).toBeNull();

    expect(appSource).toContain("function protectImportedSession(nextState, previousState = state, user = currentUser, cloudReady = supabaseConfigured)");
    expect(appSource).toContain("sync: syncStateAfterJsonImport(previousState?.sync, user, cloudReady)");
    expect(appSource).toContain("user: currentSessionUser(previousState?.user, user)");
  });

  it("migrates legacy settings-scoped assets into top-level state fields", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.slice(
      appSource.indexOf("function sanitizeBoolean"),
      appSource.indexOf("function sanitizeNumber")
    );
    const helpers = new Function(`
      ${helperSource}
      return { sanitizeBoolean, defaultSyncState, sanitizeDateKey, sanitizeDateOrFallback, sanitizeProjectState };
    `)();

    expect(helpers.sanitizeBoolean("false")).toBe(false);
    expect(helpers.sanitizeBoolean("true")).toBe(true);
    expect(helpers.sanitizeBoolean(1)).toBe(true);
    expect(helpers.sanitizeBoolean(0)).toBe(false);
    expect(helpers.sanitizeBoolean({ bad: true })).toBe(false);
    expect(helpers.sanitizeBoolean(["true"])).toBe(false);
    expect(helpers.defaultSyncState({
      status: "synced",
      lastSyncAt: { bad: true },
      lastError: { bad: true },
      pending: { bad: true },
      localImportPending: ["true"],
      cloudPaused: "false"
    })).toEqual({
      status: "synced",
      lastSyncAt: "",
      lastError: "",
      pending: false,
      localImportPending: false,
      cloudPaused: false
    });
    expect(helpers.sanitizeDateKey({ bad: true })).toBe("");
    expect(helpers.sanitizeDateOrFallback(null, "2026-06-16")).toBe("2026-06-16");
    expect(helpers.sanitizeDateOrFallback("", "2026-06-16")).toBe("2026-06-16");
    expect(helpers.sanitizeDateOrFallback({ bad: true }, "2026-06-16")).toBe("");
    expect(helpers.sanitizeProjectState(JSON.parse(`{
      "__proto__": true,
      "constructor": true,
      "Git 仓库和 README": "true",
      "本地可运行版本": "false",
      "updated_at": "2026-06-17T08:00:00.000Z"
    }`))).toEqual({
      "Git 仓库和 README": true,
      "本地可运行版本": false,
      updatedAt: "2026-06-17T08:00:00.000Z"
    });
    expect(helpers.sanitizeProjectState({
      "本地可运行版本": { bad: true },
      updatedAt: { bad: true }
    })).toEqual({
      "本地可运行版本": false,
      updatedAt: ""
    });

    expect(appSource).toContain("customTasks: settingsCustomTasks");
    expect(appSource).toContain("project: settingsProject");
    expect(appSource).toContain("resources: settingsResources");
    expect(appSource).toContain("const settings = { ...defaultSettings, ...settingsInput }");
    expect(appSource).toContain('const hasTopLevelProject = Object.prototype.hasOwnProperty.call(source, "project")');
    expect(appSource).toContain('const hasTopLevelResources = Object.prototype.hasOwnProperty.call(source, "resources")');
    expect(appSource).toContain('const hasTopLevelCustomTasks = Object.prototype.hasOwnProperty.call(source, "customTasks")');
    expect(appSource).toContain("const customTasksState = hasTopLevelCustomTasks ? source.customTasks : settingsCustomTasks");
    expect(appSource).toContain("project: sanitizeProjectState(hasTopLevelProject ? source.project : settingsProject)");
    expect(appSource).toContain("resources: resourcesState");
    expect(appSource).toContain("customTasks: sanitizeCustomTasks(customTasksState || [])");
    expect(appSource).not.toContain("project: parsed.project || {}");
    expect(appSource).not.toContain("customTasks: sanitizeCustomTasks(parsed.customTasks || [])");
  });

  it("filters malformed imported state maps before they reach runtime state", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.slice(
      appSource.indexOf("function sanitizeBoolean"),
      appSource.indexOf("function freshState")
    );
    const helpers = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      const CLEAN_START_VERSION = "2026-06-15-from-zero-v1";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      function uid(prefix) { return prefix + "-generated"; }
      function planTodayISO() { return "2026-06-16"; }
      ${helperSource}
      return {
        sanitizeEntries,
        sanitizeScores,
        sanitizeNumericObject,
        sanitizeTopicEvidence,
        sanitizeWeekPlans,
        sanitizeReviewItems,
        sanitizeCustomTasks,
        normalizeTaskRecordImpact,
        sanitizeTaskState,
        sanitizeDeleted,
        sanitizeDeletedMeta,
        filterTaskStateFromStart,
        filterReviewItemsFromStart,
        filterDeletedFromStart,
        filterEntriesFromStart,
        filterScoresFromStart,
        filterWeekPlansFromStart,
        filterTopicEvidenceFromStart,
        buildCleanStartArchive,
        sanitizeUser
      };
    `)();
    const malformed = JSON.parse(`{
      "entries": {
        "2026-06-16": { "math": "45", "quality": { "bad": true }, "quality_score": "4", "nextTask": { "bad": true }, "note": { "bad": true } },
        "bad-date": { "math": 90 },
        "2026-02-31": { "math": 30 },
        "__proto__": { "math": 999 }
      },
      "topics": {
        "math/topic": "2",
        "__proto__": 2,
        "constructor": 1
      },
      "topicEvidence": {
        "math/topic": {
          "problems": "20",
          "accuracy": "84",
          "evidence": { "bad": true },
          "lastReviewDate": "2026-06-16",
          "masteryStatus": "constructor",
          "prerequisites": ["极限", { "bad": true }, "constructor", ""]
        },
        "__proto__": { "evidence": "bad" }
      },
      "resources": {
        "math-book": "40",
        "__proto__": 100,
        "constructor": 50
      },
      "scores": [
        { "id": "score-safe", "date": "2026-06-16", "politics": "70", "name": { "bad": true }, "note": { "bad": true } },
        { "id": "score-bad-date", "date": "bad-date", "politics": "80" },
        { "id": "score-invalid-calendar", "date": "2026-02-31", "politics": "80" }
      ],
      "weekPlans": {
        "2026-06-16": [
          {
            "id": "__proto__",
            "subject": { "bad": true },
            "text": { "bad": true },
            "topicId": "constructor",
            "sourceTaskId": "__proto__",
            "status": "bad-status",
            "source": { "bad": true },
            "contractType": "__proto__",
            "completedAt": { "bad": true },
            "recordImpact": {
              "date": "bad-date",
              "changes": [{ "field": "math", "before": 0, "after": 45 }]
            },
            "requiredArtifacts": ["错题照片", { "bad": true }, "prototype", ""],
            "locked": "false",
            "recordApplied": "false",
            "evidenceSubmitted": "true"
          }
        ],
        "bad-date": [{ "id": "bad" }],
        "2026-02-31": [{ "id": "invalid-calendar" }]
      },
      "reviewItems": [
        { "id": "review-safe", "dueDate": "2026-06-16", "subject": { "bad": true }, "text": { "bad": true }, "title": "安全复盘", "status": "bad-status", "done": "false", "lastResult": "bad-result", "failureReason": { "bad": true } },
        { "id": "review-bad-date", "dueDate": "bad-date", "text": "坏复盘" },
        { "id": "review-invalid-calendar", "dueDate": "2026-02-31", "text": "坏复盘" },
        { "id": "review-invalid-source-date", "dueDate": "2026-06-16", "sourceTaskId": "2026-02-31-task", "text": "坏复盘" }
      ],
      "tasks": {
        "__proto__": true,
        "2026-06-16-task": "false",
        "2026-02-31-task": true
      },
      "customTasks": [
        { "id": "custom-safe", "subject": { "bad": true }, "text": "自定义任务", "minutes": "20" },
        { "id": "custom-bad", "text": { "bad": true }, "minutes": "20" }
      ],
      "deleted": {
        "records": ["bad", "2026-02-31", "2026-06-16"],
        "scores": ["__proto__", "score-1"],
        "tasks": ["constructor", "2026-02-31-task", "task-1"],
        "reviews": ["prototype", "2026-02-31-review", "review-1"]
      },
      "deletedMeta": {
        "records": { "2026-06-16": "2026-06-17T00:00:00Z", "bad": "2026-06-17T00:00:00Z", "2026-02-31": "2026-06-17T00:00:00Z" },
        "scores": { "score-1": "2026-06-17T01:00:00Z", "__proto__": "2026-06-17T01:00:00Z" }
      },
      "user": {
        "id": { "bad": true },
        "email": { "bad": true }
      }
    }`);

    const entries = helpers.sanitizeEntries(malformed.entries);
    const scores = helpers.sanitizeScores(malformed.scores);
    const topics = helpers.sanitizeNumericObject(malformed.topics, 0, 2, true);
    const topicEvidence = helpers.sanitizeTopicEvidence(malformed.topicEvidence);
    const resources = helpers.sanitizeNumericObject(malformed.resources, 0, 100);
    const weekPlans = helpers.sanitizeWeekPlans(malformed.weekPlans);
    const reviewItems = helpers.filterReviewItemsFromStart(helpers.sanitizeReviewItems(malformed.reviewItems));
    const customTasks = helpers.sanitizeCustomTasks(malformed.customTasks);
    const tasks = helpers.filterTaskStateFromStart(helpers.sanitizeTaskState(malformed.tasks, weekPlans), weekPlans);
    const deleted = helpers.filterDeletedFromStart(helpers.sanitizeDeleted(malformed.deleted));
    const deletedMeta = helpers.sanitizeDeletedMeta(malformed.deletedMeta, deleted);
    const user = helpers.sanitizeUser(malformed.user);

    expect(entries).toEqual({ "2026-06-16": expect.objectContaining({ math: 45, quality: 4, nextTask: "", note: "" }) });
    expect(scores).toEqual([expect.objectContaining({ id: "score-safe", date: "2026-06-16", name: "未命名模考", note: "" })]);
    expect(topics).toEqual({ "math/topic": 2 });
    expect(topicEvidence).toEqual({
      "math/topic": expect.objectContaining({ problems: 20, accuracy: 84, evidence: "", masteryStatus: "", prerequisites: ["极限"] })
    });
    expect(resources).toEqual({ "math-book": 40 });
    expect(weekPlans).toEqual({
      "2026-06-16": [expect.objectContaining({
        id: "2026-06-16-0",
        status: "todo",
        subject: "复盘",
        text: "回炉错题，写明下次识别信号",
        topicId: "",
        sourceTaskId: "",
        source: "generated",
        contractType: "problems",
        completedAt: "",
        requiredArtifacts: ["错题照片"],
        locked: false,
        recordApplied: false,
        evidenceSubmitted: true
      })]
    });
    expect(weekPlans["2026-06-16"][0].recordImpact).toEqual({
      date: "",
      changes: [{ field: "math", before: 0, after: 45 }]
    });
    expect(reviewItems).toEqual([expect.objectContaining({
      id: "review-safe",
      dueDate: "2026-06-16",
      subject: "复盘",
      text: "安全复盘",
      status: "due",
      done: false,
      failureReason: "",
      lastResult: ""
    })]);
    expect(customTasks).toEqual([expect.objectContaining({
      id: "custom-safe",
      subject: "复盘",
      text: "自定义任务",
      minutes: 20
    })]);
    expect(tasks).toEqual({ "2026-06-16-task": false, "2026-06-16-0": false });
    expect(deleted).toEqual({
      records: ["2026-06-16"],
      scores: ["score-1"],
      tasks: ["task-1"],
      reviews: ["review-1"]
    });
    expect(deletedMeta).toEqual({
      records: { "2026-06-16": "2026-06-17T00:00:00.000Z" },
      scores: { "score-1": "2026-06-17T01:00:00.000Z" },
      tasks: {},
      reviews: {}
    });
    expect(user).toBeNull();
    expect(helpers.sanitizeUser({ id: "user-safe", email: "safe@example.com" })).toEqual({
      id: "user-safe",
      email: "safe@example.com"
    });
    expect(Object.getPrototypeOf(topicEvidence)).toBe(Object.prototype);
    expect(appSource).toContain("function safeStateKey(key, maxLength = 160)");
    expect(appSource).toContain("function stateObject(value)");
    expect(appSource).toContain("function stateArray(value)");
    expect(appSource).toContain("function safeScalarText(value, fallback = \"\", maxLength = 2000)");
    expect(appSource).toContain("function safeStateLabel(value, fallback = \"\", maxLength = 80)");
    expect(appSource).toContain("function sanitizeEnum(value, allowedValues, fallback = \"\")");
    expect(appSource).toContain("function sanitizeStringList(value, limit = 12, itemMaxLength = 160)");
    expect(appSource).toContain("function sanitizeDateKey(value)");
    expect(appSource).toContain("function sanitizeDateOrFallback(value, fallback = \"\")");
    expect(appSource).toContain("function sanitizeText(value, fallback = \"\", maxLength = 2000)");
    expect(appSource).toContain("function sanitizeUserText(value, maxLength = 254)");
    expect(appSource).toContain("function hasMalformedDatePrefix(value = \"\")");
  });

  it("rejects object-like state keys before they can become object strings", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const keySource = appSource.match(/function safeStateKey\(key, maxLength = 160\) \{[\s\S]*?\n\}/);
    const safeStateKey = new Function(`${keySource?.[0]}; return safeStateKey;`)();

    expect(safeStateKey({ bad: true })).toBe("");
    expect(safeStateKey(["bad"])).toBe("");
    expect(safeStateKey("safe-key")).toBe("safe-key");
    expect(safeStateKey(42)).toBe("42");
    expect(safeStateKey(false)).toBe("false");
    expect(safeStateKey("__proto__")).toBe("");
    expect(appSource).toContain('if (!["string", "number", "boolean", "bigint"].includes(type)) return "";');
  });

  it("keeps object-like errors out of sync and auth messages", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const safeScalarTextSource = appSource.match(/function safeScalarText\(value, fallback = "", maxLength = 2000\) \{[\s\S]*?\n\}/);
    const safeErrorMessageSource = appSource.match(/function safeErrorMessage\(error, fallback = "未知错误", maxLength = 500\) \{[\s\S]*?\n\}/);
    const shortSyncErrorSource = appSource.match(/function shortSyncError\(message\) \{[\s\S]*?\n\}/);
    const friendlySyncErrorSource = appSource.match(/function friendlySyncError\(message\) \{[\s\S]*?\n\}/);
    const friendlyAuthErrorSource = appSource.match(/function friendlyAuthError\(error\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      function isPlainStateObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
      }
      ${safeScalarTextSource?.[0]}
      ${safeErrorMessageSource?.[0]}
      ${shortSyncErrorSource?.[0]}
      ${friendlySyncErrorSource?.[0]}
      ${friendlyAuthErrorSource?.[0]}
      return { safeErrorMessage, shortSyncError, friendlySyncError, friendlyAuthError };
    `)();

    expect(helpers.safeErrorMessage(new Error("duplicate key"))).toBe("duplicate key");
    expect(helpers.safeErrorMessage({ message: { toString: () => "bad" }, details: "safe-detail" }, "fallback")).toBe("safe-detail");
    expect(helpers.safeErrorMessage({ toString: () => "object-leak" }, "下载失败")).toBe("下载失败");
    expect(helpers.shortSyncError({ toString: () => "object-leak" })).toBe("");
    expect(helpers.friendlySyncError({ toString: () => "object-leak" })).toBe("未知错误");
    expect(helpers.friendlyAuthError({ message: { toString: () => "invalid login credentials" } })).toBe("未知错误");
    expect(appSource).toContain('function safeErrorMessage(error, fallback = "未知错误", maxLength = 500)');
    expect(appSource).toContain('toast.textContent = safeScalarText(message, "", 1200)');
    expect(appSource).not.toContain("error.message || String(error)");
    expect(appSource).not.toContain("error.message || error");
    expect(appSource).not.toContain("error?.message || error");
  });

  it("parses app dates through strict date-key validation", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const safeScalarTextSource = appSource.match(/function safeScalarText\(value, fallback = "", maxLength = 2000\) \{[\s\S]*?\n\}/);
    const sanitizeDateKeySource = appSource.match(/function sanitizeDateKey\(value\) \{[\s\S]*?\n\}/);
    const parseDateSource = appSource.match(/function parseDate\(value\) \{[\s\S]*?\n\}/);
    const formatDateSource = appSource.match(/function formatDateISO\(date\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      ${safeScalarTextSource?.[0]}
      ${sanitizeDateKeySource?.[0]}
      ${parseDateSource?.[0]}
      ${formatDateSource?.[0]}
      return { sanitizeDateKey, parseDate, formatDateISO };
    `)();

    expect(helpers.sanitizeDateKey("2026-06-16")).toBe("2026-06-16");
    expect(helpers.sanitizeDateKey("2026-02-31")).toBe("");
    expect(helpers.formatDateISO(helpers.parseDate("2026-06-16"))).toBe("2026-06-16");
    expect(helpers.formatDateISO(helpers.parseDate("2026-02-31"))).toBe("2026-06-15");
    expect(helpers.formatDateISO(helpers.parseDate({ bad: true }))).toBe("2026-06-15");
    expect(appSource).toContain("const text = sanitizeDateKey(value) || PLAN_START_DATE;");
  });

  it("falls back to snake_case import fields when camelCase fields are malformed", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.slice(
      appSource.indexOf("function sanitizeBoolean"),
      appSource.indexOf("function freshState")
    );
    const helpers = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      const CLEAN_START_VERSION = "2026-06-15-from-zero-v1";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      function uid(prefix) { return prefix + "-generated"; }
      function planTodayISO() { return "2026-06-16"; }
      ${helperSource}
      return { sanitizeTopicEvidence, sanitizeWeekPlans, sanitizeReviewItems, sanitizeCustomTasks, sanitizeSnapshots };
    `)();

    const plans = helpers.sanitizeWeekPlans({
      "2026-06-16": [{
        id: "task-fallback",
        text: "任务",
        topicId: { bad: true },
        topic_id: "topic-safe",
        sourceTaskId: { bad: true },
        source_task_id: "source-safe",
        carriedFrom: { bad: true },
        carried_from: "2026-06-08",
        shiftedTo: { bad: true },
        shifted_to: "2026-06-17",
        completedAt: { bad: true },
        completed_at: "2026-06-16T07:00:00.000Z",
        updatedAt: { bad: true },
        updated_at: "2026-06-16T08:00:00.000Z",
        contractType: { bad: true },
        contract_type: "practice",
        requiredProblemCount: { bad: true },
        required_problem_count: "12",
        requiredAccuracy: { bad: true },
        required_accuracy: "84",
        requiredArtifacts: { bad: true },
        required_artifacts: ["错题照片"],
        minutesMin: { bad: true },
        minutes_min: "20",
        minutesMax: { bad: true },
        minutes_max: "50",
        actualProblems: { bad: true },
        actual_problems: "14",
        actualCorrect: { bad: true },
        actual_correct: "11",
        actualMinutes: { bad: true },
        actual_minutes: "45",
        recordApplied: { bad: true },
        record_applied: "true",
        evidenceSubmitted: { bad: true },
        evidence_submitted: "true",
        recordImpact: { date: "2026-06-16", changes: [{ field: "bad", before: 0, after: 1 }] },
        record_impact: { date: "2026-06-16", changes: [{ field: "math", before: 0, after: 30 }] },
      }],
    });
    expect(plans["2026-06-16"][0]).toMatchObject({
      topicId: "topic-safe",
      sourceTaskId: "source-safe",
      carriedFrom: "2026-06-08",
      shiftedTo: "2026-06-17",
      completedAt: "2026-06-16T07:00:00.000Z",
      updatedAt: "2026-06-16T08:00:00.000Z",
      contractType: "practice",
      requiredProblemCount: 12,
      requiredAccuracy: 0.84,
      requiredArtifacts: ["错题照片"],
      minutesMin: 20,
      minutesMax: 50,
      actualProblems: 14,
      actualCorrect: 11,
      actualMinutes: 45,
      recordApplied: true,
      evidenceSubmitted: true,
      recordImpact: {
        date: "2026-06-16",
        changes: [{ field: "math", before: 0, after: 30 }]
      },
    });

    const reviews = helpers.sanitizeReviewItems([{
      id: "review-fallback",
      dueDate: { bad: true },
      due_date: "2026-06-16",
      text: { bad: true },
      title: "安全标题",
      round: { bad: true },
      review_round: "D+3",
      sourceTaskId: { bad: true },
      source_task_id: "task-safe",
      delayCount: { bad: true },
      delay_count: "3",
      failureReason: { bad: true },
      failure_reason: "需要回炉",
      quality: { bad: true },
      quality_score: "4",
      completedAt: { bad: true },
      completed_at: "2026-06-16T09:00:00.000Z",
      intervalIndex: { bad: true },
      interval_index: "2",
      failStreak: { bad: true },
      fail_streak: "1",
      lastResult: { bad: true },
      last_result: "delay",
      lastSubmittedDate: { bad: true },
      last_submitted_date: "2026-06-08",
      topicId: { bad: true },
      topic_id: "topic-safe",
      updatedAt: { bad: true },
      updated_at: "2026-06-16T10:00:00.000Z",
    }]);
    expect(reviews[0]).toMatchObject({
      dueDate: "2026-06-16",
      text: "安全标题",
      round: "D+3",
      sourceTaskId: "task-safe",
      delayCount: 3,
      failureReason: "需要回炉",
      quality: 4,
      completedAt: "2026-06-16T09:00:00.000Z",
      intervalIndex: 2,
      failStreak: 1,
      lastResult: "delay",
      lastSubmittedDate: "2026-06-08",
      topicId: "topic-safe",
      updatedAt: "2026-06-16T10:00:00.000Z",
    });

    const evidence = helpers.sanitizeTopicEvidence({
      "topic-safe": {
        totalProblems: { bad: true },
        total_problems: "60",
        recent14dAccuracy: { bad: true },
        recent_14d_accuracy: "76",
        lastReviewAt: { bad: true },
        last_review_at: "2026-06-16T11:00:00.000Z",
        masteryStatus: { bad: true },
        mastery_status: "mastered",
        updatedAt: { bad: true },
        updated_at: "2026-06-16T12:00:00.000Z",
      }
    });
    expect(evidence["topic-safe"]).toMatchObject({
      totalProblems: 60,
      recent14dAccuracy: 0.76,
      lastReviewAt: "2026-06-16T11:00:00.000Z",
      masteryStatus: "mastered",
      updatedAt: "2026-06-16T12:00:00.000Z",
    });

    const customTasks = helpers.sanitizeCustomTasks([{
      text: "自定义",
      updatedAt: { bad: true },
      updated_at: "2026-06-16T13:00:00.000Z",
    }]);
    expect(customTasks[0].updatedAt).toBe("2026-06-16T13:00:00.000Z");

    const snapshots = helpers.sanitizeSnapshots([{
      reason: "manual",
      createdAt: { bad: true },
      created_at: "2026-06-16T00:00:00.000Z",
      payload: { entries: {} },
    }]);
    expect(snapshots[0].createdAt).toBe("2026-06-16T00:00:00.000Z");
    expect(appSource).toContain("function firstSafeStateKey(values, maxLength = 160)");
    expect(appSource).toContain("function firstDateKey(values)");
    expect(appSource).toContain("function firstStringList(values, limit = 12, itemMaxLength = 160)");
    expect(appSource).toContain("function firstNumberValue(values, min = 0, max = Number.POSITIVE_INFINITY, fallback = min)");
    expect(appSource).toContain("function firstBooleanValue(values, fallback = false)");
    expect(appSource).toContain("function firstEnumValue(values, allowedValues, fallback = \"\")");
    expect(appSource).toContain("function firstTextValue(values, fallback = \"\", maxLength = 2000)");
  });

  it("keeps clean-start filters stable with malformed containers", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.slice(
      appSource.indexOf("function sanitizeBoolean"),
      appSource.indexOf("function freshState")
    );
    const helpers = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      const CLEAN_START_VERSION = "2026-06-15-from-zero-v1";
      function planTodayISO() { return "2026-06-16"; }
      ${helperSource}
      return {
        filterEntriesFromStart,
        filterScoresFromStart,
        filterWeekPlansFromStart,
        sanitizeTaskState,
        filterTaskStateFromStart,
        filterReviewItemsFromStart,
        filterTopicEvidenceFromStart,
        filterDeletedFromStart,
        buildCleanStartArchive
      };
    `)();

    expect(helpers.filterEntriesFromStart("not-an-entry-map")).toEqual({});
    expect(helpers.filterScoresFromStart({ 0: { date: "2026-06-16" } })).toEqual([]);
    expect(helpers.filterWeekPlansFromStart({ "2026-06-16": "not-a-task-list" })).toEqual({ "2026-06-16": [] });
    expect(helpers.sanitizeTaskState({}, { "2026-06-16": { id: "loose-task", status: "done" } })).toEqual({});
    expect(helpers.filterTaskStateFromStart({ "2026-06-16-task": true }, { "2026-06-16": "not-a-task-list" })).toEqual({
      "2026-06-16-task": true
    });
    expect(helpers.filterReviewItemsFromStart({ 0: { dueDate: "2026-06-16" } })).toEqual([]);
    const reviewRows = [
      { id: "snake-fallback", dueDate: { bad: true }, due_date: "2026-06-16", sourceTaskId: { bad: true }, source_task_id: "2026-06-16-task" },
      { id: "next-due", nextDueAt: "2026-06-17T12:00:00.000Z" },
      { id: "bad-camel-date", dueDate: "2026-02-31", due_date: "2026-06-16" },
      { id: "bad-snake-source", dueDate: "2026-06-16", source_task_id: "2026-02-31-task" },
      { id: "before-source", dueDate: "2026-06-16", sourceTaskId: "2026-06-07-task" }
    ];
    expect(helpers.filterReviewItemsFromStart(reviewRows).map((row) => row.id)).toEqual(["snake-fallback", "next-due"]);
    expect(helpers.filterTopicEvidenceFromStart({
      malformed: null,
      keep: { lastReviewDate: "2026-06-16", evidence: "ok" },
      fallbackKeep: { lastReviewDate: { bad: true }, lastReviewAt: "2026-06-16T12:00:00.000Z", evidence: "ok" },
      fallbackDrop: { lastReviewDate: { bad: true }, lastReviewAt: "2026-02-31T12:00:00.000Z", evidence: "bad" }
    })).toEqual({
      keep: { lastReviewDate: "2026-06-16", evidence: "ok" },
      fallbackKeep: { lastReviewDate: { bad: true }, lastReviewAt: "2026-06-16T12:00:00.000Z", evidence: "ok" }
    });
    expect(helpers.filterDeletedFromStart({
      records: "2026-06-16",
      scores: "score-1",
      tasks: { 0: "task-1" },
      reviews: null
    })).toEqual({ records: [], scores: [], tasks: [], reviews: [] });

    const archive = helpers.buildCleanStartArchive({
      entries: "bad",
      scores: { 0: { date: "2026-06-01" } },
      weekPlans: "bad",
      reviewItems: "bad",
      topics: "bad",
      topicEvidence: null,
      previousArchive: "bad"
    });
    expect(archive).toMatchObject({
      version: "2026-06-15-from-zero-v1",
      startDate: "2026-06-15",
      counts: {
        entriesBeforeStart: 0,
        scoresBeforeStart: 0,
        weekPlanDaysBeforeStart: 0,
        reviewsBeforeStart: 0,
        previousTopicMarks: 0,
        previousTopicEvidence: 0
      }
    });
    expect(archive.entryDates).toEqual([]);
    expect(archive.weekPlanDates).toEqual([]);
  });

  it("applies tombstones after migrating imported or stored state", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(appSource).toContain("const deletedMeta = sanitizeDeletedMeta(source.deletedMeta ?? source.deleted_meta ?? {}, deleted)");
    expect(appSource).toMatch(/const nextState = \{[\s\S]*deleted,[\s\S]*deletedMeta,[\s\S]*user: sanitizeUser\(source\.user\)\s*\};\s*return applyTombstones\(nextState\);/);
    expect(appSource).not.toContain("source.deletedMeta || source.deleted_meta || {}");
  });

  it("keeps local and cloud snapshot payloads complete without recursive snapshots", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const appHelperSource = appSource.slice(
      appSource.indexOf("function sanitizeSnapshotPayload"),
      appSource.indexOf("function createLocalSnapshot")
    );
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function safeStateKey")
    );
    const appHelpers = new Function(`
      ${shapeHelperSource}
      ${appHelperSource}
      return { sanitizeSnapshotPayload, snapshotStatePayload };
    `)();
    const cloudHelperSource = syncSource.match(/function buildCloudSnapshotPayload\(state, reason = "manual"\) \{[\s\S]*?\n\}/)?.[0];
    const buildCloudSnapshotPayload = new Function(`${cloudHelperSource}; return buildCloudSnapshotPayload;`)();

    const state = {
      schemaVersion: 3,
      entries: { "2026-06-08": { math: 45 } },
      scores: [{ id: "score-1" }],
      topics: { limits: 1 },
      topicEvidence: { limits: { problems: 20 } },
      tasks: { "2026-06-08-A-math": true },
      weekPlans: { "2026-06-08": [{ id: "2026-06-08-A-math" }] },
      project: { README: true },
      resources: { "math-main": 65 },
      settings: { density: "focus" },
      customTasks: [{ id: "custom-1", text: "错题回炉", minutes: 20 }],
      reviewItems: [{ id: "review-1" }],
      deleted: { records: ["2026-06-16"], scores: [], tasks: ["task-old"], reviews: [] },
      deletedMeta: { records: { "2026-06-16": "2026-06-17T00:00:00.000Z" }, scores: {}, tasks: { "task-old": "2026-06-17T00:00:00.000Z" }, reviews: {} },
      cleanStartArchive: { version: "2026-06-15-from-zero-v1" },
      sync: { status: "paused", cloudPaused: true },
      user: { id: "u1", email: "me@example.com" },
      snapshots: [{ reason: "old", payload: { snapshots: [{ reason: "older" }] } }]
    };

    expect(appHelpers.sanitizeSnapshotPayload({
      entries: {},
      unexpected: { keep: false },
      snapshots: [{ reason: "nested" }],
      sync: { lastError: "runtime" },
      user: { email: "old@example.com" }
    })).toEqual({ entries: {} });
    const circularEntry = { math: 45, large: 10n };
    circularEntry.self = circularEntry;
    expect(appHelpers.sanitizeSnapshotPayload({
      entries: { "2026-06-08": circularEntry },
      constructor: "bad",
      sync: { lastError: "runtime" },
      user: { email: "old@example.com" }
    })).toEqual({ entries: { "2026-06-08": { math: 45, large: "10" } } });
    const localPayload = appHelpers.snapshotStatePayload(state);
    expect(localPayload.snapshots).toBeUndefined();
    expect(localPayload.sync).toBeUndefined();
    expect(localPayload.user).toBeUndefined();
    expect(localPayload.weekPlans).toEqual(state.weekPlans);
    expect(localPayload.tasks).toEqual(state.tasks);
    expect(localPayload.deleted).toEqual(state.deleted);
    expect(localPayload.deletedMeta).toEqual(state.deletedMeta);
    expect(localPayload.cleanStartArchive).toEqual(state.cleanStartArchive);
    expect(appHelpers.snapshotStatePayload("bad-state")).toEqual({});
    const circularState = { entries: { "2026-06-08": circularEntry }, scores: [] };
    expect(appHelpers.snapshotStatePayload(circularState).entries).toEqual({ "2026-06-08": { math: 45, large: "10" } });

    const cloudPayload = buildCloudSnapshotPayload(state, "before-delete-record");
    expect(cloudPayload.snapshots).toBeUndefined();
    expect(cloudPayload.sync).toBeUndefined();
    expect(cloudPayload.user).toBeUndefined();
    expect(cloudPayload.reason).toBe("before-delete-record");
    expect(cloudPayload.weekPlans).toEqual(state.weekPlans);
    expect(cloudPayload.tasks).toEqual(state.tasks);
    expect(cloudPayload.deleted).toEqual(state.deleted);
    expect(cloudPayload.deletedMeta).toEqual(state.deletedMeta);
    expect(cloudPayload.cleanStartArchive).toEqual(state.cleanStartArchive);
    const cloudCircularPayload = buildCloudSnapshotPayload(circularState, "x".repeat(130));
    expect(cloudCircularPayload.reason).toHaveLength(120);
    expect(cloudCircularPayload.entries).toEqual({ "2026-06-08": { math: 45, large: "10" } });
    expect(cloudCircularPayload.snapshots).toBeUndefined();
    expect(buildCloudSnapshotPayload(state, { bad: true }).reason).toBe("manual");

    expect(appSource).toContain("payload: snapshotStatePayload(state)");
    expect(appSource).toContain("function cloneJson(value, fallback = {})");
    expect(appSource).toContain("state.snapshots = [snapshot, ...snapshotRows(state.snapshots)].slice(0, 5)");
    expect(appSource).toContain("currentUser && supabaseConfigured && !state.sync?.cloudPaused && !state.sync?.localImportPending && !legacyImportPending");
    expect(appSource).not.toContain("payload: JSON.parse(JSON.stringify(state))");
    expect(appSource).not.toContain("if (currentUser && supabaseConfigured) {\n    saveCloudSnapshot(state, reason)");
    expect(syncSource).toMatch(/export async function saveCloudSnapshot\(state, reason = "manual"\) \{\s*if \(asBoolean\(state\?\.sync\?\.cloudPaused\) \|\| asBoolean\(state\?\.sync\?\.localImportPending\)\) return;\s*const user = await getCurrentUser\(\);/);
    expect(syncSource).toContain('const snapshotReason = asString(reason, "manual").slice(0, 120) || "manual"');
    expect(syncSource).toContain("const payload = buildCloudSnapshotPayload(state, snapshotReason)");
    expect(syncSource).not.toContain('String(reason || "manual").slice(0, 120)');
  });

  it("exports restorable JSON backups without account identity or sync runtime fields", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const settingsSource = fs.readFileSync(new URL("../../src/views/settings-view.js", import.meta.url), "utf8");
    const sanitizerSource = appSource.slice(
      appSource.indexOf("function sanitizeSnapshots"),
      appSource.indexOf("function sanitizeUser")
    );
    const exportHelperSource = appSource.slice(
      appSource.indexOf("function snapshotStatePayload"),
      appSource.indexOf("function createLocalSnapshot")
    );
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function safeStateKey")
    );
    const { exportStatePayload } = new Function(`
      ${shapeHelperSource}
      ${sanitizerSource}
      ${exportHelperSource}
      return { exportStatePayload };
    `)();

    const state = {
      schemaVersion: 3,
      entries: { "2026-06-08": { math: 45 } },
      scores: [{ id: "score-1" }],
      topics: { limits: 1 },
      topicEvidence: { limits: { problems: 20 } },
      tasks: { "2026-06-08-A-math": true },
      weekPlans: { "2026-06-08": [{ id: "2026-06-08-A-math" }] },
      project: { README: true },
      resources: { "math-main": 65 },
      settings: { density: "focus", lastExportDate: "2026-06-08" },
      customTasks: [{ id: "custom-1", text: "错题回炉", minutes: 20 }],
      reviewItems: [{ id: "review-1" }],
      deleted: { records: ["2026-06-16"], scores: [], tasks: ["task-old"], reviews: [] },
      deletedMeta: { records: { "2026-06-16": "2026-06-17T00:00:00.000Z" }, scores: {}, tasks: { "task-old": "2026-06-17T00:00:00.000Z" }, reviews: {} },
      cleanStartArchive: { version: "2026-06-15-from-zero-v1" },
      sync: { status: "error", lastError: "contains-session-details", lastSyncAt: "2026-06-08T12:00:00.000Z", cloudPaused: true },
      user: { id: "u1", email: "me@example.com" },
      snapshots: [{
        reason: "before-delete-record",
        createdAt: "2026-06-08T13:00:00.000Z",
        payload: {
          entries: { "2026-06-08": { math: 30 } },
          unknownRuntimeField: "drop-me",
          sync: { status: "paused", lastError: "nested-session-details" },
          user: { id: "u1", email: "snapshot@example.com" },
          snapshots: [{ reason: "nested" }]
        }
      }, {
        reason: { bad: true },
        createdAt: "2026-06-08T14:00:00.000Z",
        payload: {
          scores: [{ id: "score-snapshot" }],
          user: { id: "u2", email: "snapshot-2@example.com" }
        }
      }]
    };

    const payload = exportStatePayload(state);
    const serialized = JSON.stringify(payload);

    expect(payload.entries).toEqual(state.entries);
    expect(payload.deleted).toEqual(state.deleted);
    expect(payload.deletedMeta).toEqual(state.deletedMeta);
    expect(payload.cleanStartArchive).toEqual(state.cleanStartArchive);
    expect(payload.user).toBeUndefined();
    expect(payload.sync).toBeUndefined();
    expect(payload.snapshots).toEqual([{
      reason: "before-delete-record",
      createdAt: "2026-06-08T13:00:00.000Z",
      payload: { entries: { "2026-06-08": { math: 30 } } }
    }, {
      reason: "manual",
      createdAt: "2026-06-08T14:00:00.000Z",
      payload: { scores: [{ id: "score-snapshot" }] }
    }]);
    expect(serialized).not.toContain("me@example.com");
    expect(serialized).not.toContain("snapshot@example.com");
    expect(serialized).not.toContain("snapshot-2@example.com");
    expect(serialized).not.toContain("contains-session-details");
    expect(serialized).not.toContain("nested-session-details");
    expect(exportStatePayload("bad-state")).toEqual({ snapshots: [] });
    const circularPayload = { entries: { "2026-06-08": { math: 45 } }, snapshots: [] };
    circularPayload.entries["2026-06-08"].self = circularPayload.entries["2026-06-08"];
    expect(exportStatePayload(circularPayload).entries).toEqual({ "2026-06-08": { math: 45 } });

    expect(appSource).toContain("JSON.stringify(exportStatePayload(state), null, 2)");
    expect(appSource).toContain("function sanitizeSnapshotReason(value)");
    expect(appSource).not.toContain("JSON.stringify(state, null, 2)");
    expect(settingsSource).toContain("sanitizeLocalExportState(state)");
    expect(settingsSource).toContain("function getExportUserId()");
    expect(settingsSource).toContain("const user = objectValue(StateManager.getState('user'))");
    expect(settingsSource).toContain("return safeText(user.id) || safeText(user.user_id)");
    expect(settingsSource).toMatch(/const exportUserId = getExportUserId\(\);\s*const result = await exportAllData\(exportUserId\);/);
    expect(settingsSource).not.toContain("JSON.stringify(state, null, 2)");
  });

  it("normalizes cloud snapshots into the local restore shape", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const helperSource = syncSource.slice(
      syncSource.indexOf("function asDate"),
      syncSource.indexOf("function splitProfileSettings")
    );
    const normalizeCloudSnapshot = new Function(`
      ${helperSource}
      return normalizeCloudSnapshot;
    `)();

    expect(normalizeCloudSnapshot({
      reason: "before-delete-record",
      created_at: "2026-06-08T12:00:00Z",
      payload: {
        entries: { "2026-06-08": {} },
        unknownRuntimeField: "drop-me",
        sync: { lastError: "session-detail" },
        user: { email: "snapshot@example.com" },
        snapshots: [{ reason: "nested" }]
      }
    })).toEqual({
      reason: "before-delete-record",
      createdAt: "2026-06-08T12:00:00.000Z",
      payload: { entries: { "2026-06-08": {} } }
    });
    expect(normalizeCloudSnapshot({
      created_at: "2026-06-08T12:30:00Z",
      payload: {
        reason: "legacy-wrapper",
        payload: {
          scores: [{ id: "s1" }],
          unexpected: true,
          sync: { lastError: "nested-session-detail" },
          user: { email: "nested@example.com" },
          snapshots: [{ reason: "nested" }]
        }
      }
    })).toEqual({
      reason: "legacy-wrapper",
      createdAt: "2026-06-08T12:30:00.000Z",
      payload: { scores: [{ id: "s1" }] }
    });
    expect(normalizeCloudSnapshot({
      reason: { toString: () => "object-reason" },
      created_at: { toString: () => "2026-06-08T13:00:00Z" },
      payload: {
        reason: "payload-reason",
        createdAt: "2026-06-08T13:30:00Z",
        entries: { "2026-06-08": {} }
      }
    })).toEqual({
      reason: "payload-reason",
      createdAt: "2026-06-08T13:30:00.000Z",
      payload: { entries: { "2026-06-08": {} } }
    });

    expect(syncSource).toContain("state.snapshots = snapshotRows.map(normalizeCloudSnapshot).filter(Boolean)");
  });

  it("renders recent snapshots and restores them after confirmation", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function safeStateKey")
    );
    const reasonSource = appSource.match(/function snapshotReasonLabel\(reason = "manual"\) \{[\s\S]*?\n\}/);
    const summarySource = appSource.match(/function snapshotSummary\(payload = \{\}\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      ${shapeHelperSource}
      ${reasonSource?.[0]}
      ${summarySource?.[0]}
      return { snapshotReasonLabel, snapshotSummary };
    `)();

    expect(html).toContain('class="snapshot-box" id="snapshotBox"');
    expect(html).toContain('class="snapshot-list" id="snapshotList" aria-live="polite"');
    expect(css).toContain(".snapshot-list");
    expect(css).toContain(".snapshot-item");

    expect(helpers.snapshotReasonLabel("before-delete-record")).toBe("删除记录前");
    expect(helpers.snapshotReasonLabel({ toString: () => "object-reason" })).toBe("手动快照");
    expect(helpers.snapshotReasonLabel("__proto__")).toBe("手动快照");
    expect(helpers.snapshotReasonLabel("custom-safe")).toBe("custom-safe");
    expect(helpers.snapshotSummary({
      entries: { "2026-06-08": {}, "2026-06-16": {} },
      scores: [{ id: "s1" }],
      weekPlans: { "2026-06-08": [{ id: "t1" }, { id: "t2" }] }
    })).toBe("记录 2 天 · 模考 1 条 · 任务 2 项");
    expect(helpers.snapshotSummary({
      entries: "bad-entries",
      scores: { 0: { id: "s1" } },
      weekPlans: { "2026-06-08": "bad-task-list", "2026-06-16": [{ id: "t1" }, "bad-task"] }
    })).toBe("记录 0 天 · 模考 0 条 · 任务 1 项");
    expect(helpers.snapshotSummary("bad-payload")).toBe("记录 0 天 · 模考 0 条 · 任务 0 项");

    expect(appSource).toMatch(/function renderAuthPanel\(\) \{[\s\S]*renderSnapshotPanel\(\);[\s\S]*\}/);
    expect(appSource).toContain("function snapshotRows(snapshots)");
    expect(appSource).toContain("const snapshots = snapshotRows(state.snapshots).slice(0, 5)");
    expect(appSource).toContain('data-restore-snapshot="${index}"');
    expect(appSource).toContain('aria-label="恢复 ${escapeAttr(label)} 快照"');
    expect(appSource).toMatch(/button\.addEventListener\("click", \(\) => restoreSnapshot\(Number\(button\.dataset\.restoreSnapshot\)\)\);/);
    expect(appSource).toMatch(/function restoreSnapshot\(index\) \{[\s\S]*window\.confirm\(`确认恢复[\s\S]*const currentSync = state\.sync;[\s\S]*const currentUserState = state\.user;[\s\S]*createLocalSnapshot\("before-restore-snapshot"\);[\s\S]*const restored = migrateState\(snapshot\.payload\);[\s\S]*sync: syncStateAfterJsonImport\(currentSync, currentUser, supabaseConfigured\),\s*user: currentSessionUser\(currentUserState, currentUser\)[\s\S]*const saved = saveState\(\);[\s\S]*renderAll\(\);[\s\S]*renderAuthPanel\(\);/);
    expect(appSource).toContain('setAuthResult("error", "快照不可恢复", "这个快照缺少可恢复的数据。")');
    expect(appSource).toContain('setLocalSaveResult(saved, "快照已恢复", "恢复前状态也已保存，可在最近快照中找回。", "快照恢复未写入本机缓存")');
  });

  it("validates daily entry numeric fields before saving records", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const entryValueSource = appSource.match(/function isValidEntryValue\(value, min, max = Infinity\) \{[\s\S]*?\n\}/);
    const isValidEntryValue = new Function(`${entryValueSource?.[0]}; return isValidEntryValue;`)();

    expect(isValidEntryValue(0, 0)).toBe(true);
    expect(isValidEntryValue(5, 1, 5)).toBe(true);
    expect(isValidEntryValue(-1, 0)).toBe(false);
    expect(isValidEntryValue(1.5, 0)).toBe(false);
    expect(isValidEntryValue(0, 1, 5)).toBe(false);
    expect(isValidEntryValue(6, 1, 5)).toBe(false);

    expect(appSource).toContain("function readEntryFormValues()");
    expect(appSource).toContain("function validateEntryForm(entry)");
    expect(appSource).toContain("function entryFieldRules(entry)");
    expect(appSource).toContain("function isValidEntryValue(value, min, max = Infinity)");
    expect(appSource).toContain('{ id: "qualityScore", value: entry.quality, min: 1, max: 5 }');
    expect(appSource).toContain('showToast("今日记录的时长、题量和错题数需填写为非负整数，质量评分为 1-5 的整数。")');
    expect(appSource).toMatch(/const entry = readEntryFormValues\(\);\s*if \(!validateEntryForm\(entry\)\) return;\s*unmarkDeleted\("records", date\);\s*state\.entries\[date\] = \{/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*clearEntryValidation\(\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "今日记录已保存", "进度已更新。", "今日记录未写入本机缓存"\);/);
    expect(appSource).toContain("function clearEntryValidation()");
    expect(appSource).toContain("document.querySelectorAll(entryFieldSelector())");
    expect(css).toContain('.entry-form input[aria-invalid="true"]');
  });

  it("keeps record edit navigation aligned with the URL route", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-edit-record\]"\)[\s\S]*setRoute\("today"\);[\s\S]*已载入该日记录/);
    expect(appSource).not.toMatch(/document\.querySelectorAll\("\[data-edit-record\]"\)[\s\S]*switchView\("today"\);[\s\S]*已载入该日记录/);
  });

  it("neutralizes formula-like values in exported CSV cells", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const csvCellSource = appSource.match(/function csvCell\(value\) \{[\s\S]*?\n\}/);
    const csvCell = new Function(`${csvCellSource?.[0]}; return csvCell;`)();

    expect(appSource).toContain("function csvCell(value) {");
    expect(appSource).toContain('const type = typeof value;');
    expect(appSource).toContain('const text = ["string", "number", "bigint"].includes(type) ? String(value) : "";');
    expect(appSource).not.toContain('String(value ?? "")');
    expect(appSource).toContain("/^[\\s]*[=+\\-@]/.test(text)");
    expect(appSource).toContain("/^[\\t\\r]/.test(text)");
    expect(appSource).toContain("`'${text}`");
    expect(appSource).toContain('safeText.replaceAll(\'"\', \'""\')');
    expect(csvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"');
    expect(csvCell({ bad: true })).toBe('""');
    expect(csvCell(42)).toBe('"42"');
    expect(appSource).toMatch(/function exportRecordsCsv\(\) \{\s*try \{\s*const entries = entriesArray\(\);\s*if \(!entries\.length\) \{\s*setAuthResult\("idle", "暂无可导出记录", "先保存至少一条学习记录，再导出 CSV。"\);\s*return false;\s*\}[\s\S]*const rows = entries\.map\(\(entry\) => \[/);
    expect(appSource).toMatch(/function exportRecordsCsv\(\) \{[\s\S]*const href = URL\.createObjectURL\(blob\);\s*link\.href = href;[\s\S]*try \{\s*link\.click\(\);\s*\} finally \{\s*URL\.revokeObjectURL\(href\);\s*\}\s*setAuthResult\("success", "CSV 已导出", "学习记录 CSV 已下载。"\);\s*return true;\s*\} catch \(error\) \{\s*setAuthResult\("error", "CSV 导出失败", `请检查浏览器下载权限后重试：\$\{safeErrorMessage\(error, "浏览器下载失败"\)\}`\);\s*return false;\s*\}/);
  });

  it("prevents saving empty mock-score records", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const scoreValueSource = appSource.match(/function isValidScoreValue\(value, max\) \{[\s\S]*?\n\}/);
    const isValidScoreValue = new Function(`${scoreValueSource?.[0]}; return isValidScoreValue;`)();

    expect(isValidScoreValue(0, 100)).toBe(true);
    expect(isValidScoreValue(100, 100)).toBe(true);
    expect(isValidScoreValue(150, 150)).toBe(true);
    expect(isValidScoreValue(-1, 100)).toBe(false);
    expect(isValidScoreValue(101, 100)).toBe(false);
    expect(isValidScoreValue(150.5, 150)).toBe(false);

    expect(appSource).toContain("function validateScoreForm(score) {");
    expect(appSource).toContain("function scoreFieldRules(score)");
    expect(appSource).toContain("function isValidScoreValue(value, max)");
    expect(appSource).toContain('{ id: "scorePol", value: score.politics, max: 100 }');
    expect(appSource).toContain('{ id: "scoreCs", value: score.cs408, max: 150 }');
    expect(appSource).toContain('field.input?.setAttribute("aria-invalid", String(Boolean(invalidField) ? !field.valid : !hasScore))');
    expect(appSource).toContain('showToast("模考分数需填写为整数：政治/英语 0-100，数学/408 0-150。")');
    expect(appSource).toContain('showToast("请至少填写一科模考分数。")');
    expect(appSource).toContain("function clearScoreValidation()");
    expect(appSource).toMatch(/score\.total = score\.politics \+ score\.english \+ score\.math \+ score\.cs408;\s*if \(!validateScoreForm\(score\)\) return;/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*event\.target\.reset\(\);\s*clearScoreValidation\(\);\s*document\.getElementById\("scoreDate"\)\.value = planTodayISO\(\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "模考成绩已保存", "成绩曲线已更新。", "模考成绩未写入本机缓存"\);/);
  });

  it("validates settings numeric ranges before saving settings", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const settingNumberSource = appSource.match(/function isValidSettingNumber\(value, min, max\) \{[\s\S]*?\n\}/);
    const isValidSettingNumber = new Function(`${settingNumberSource?.[0]}; return isValidSettingNumber;`)();

    expect(isValidSettingNumber(90, 90, 600)).toBe(true);
    expect(isValidSettingNumber(600, 90, 600)).toBe(true);
    expect(isValidSettingNumber(89, 90, 600)).toBe(false);
    expect(isValidSettingNumber(601, 90, 600)).toBe(false);
    expect(isValidSettingNumber(3.5, 3, 4)).toBe(false);
    expect(isValidSettingNumber(Number.NaN, 0, 4)).toBe(false);

    expect(appSource).toContain("function readSettingsNumericValues()");
    expect(appSource).toContain("function validateSettingsNumericForm(values)");
    expect(appSource).toContain("function settingsNumericFieldRules(values)");
    expect(appSource).toContain("function isValidSettingNumber(value, min, max)");
    expect(appSource).toContain('{ id: "settingWeekdayMinutes", value: values.weekdayMinutes, min: 90, max: 600 }');
    expect(appSource).toContain('{ id: "settingReviewLoad", value: values.reviewLoad, min: 15, max: 60 }');
    expect(appSource).toContain('showToast("设置数字需填写为整数，并保持在字段标注范围内。")');
    expect(appSource).toMatch(/const numericSettings = readSettingsNumericValues\(\);\s*if \(!validateSettingsNumericForm\(numericSettings\)\) return;\s*const reviewDays = parseReviewDays/);
    expect(appSource).toContain("weekdayMinutes: numericSettings.weekdayMinutes");
    expect(appSource).toContain("rollingWindowDays: numericSettings.rollingWindowDays");
    expect(appSource).toMatch(/state\.settings = nextSettings;\s*const saved = saveState\(\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "设置已保存", "新的计划参数已应用。", "设置未写入本机缓存"\);/);
    expect(appSource).toContain("document.querySelectorAll(settingsNumericFieldSelector())");
    expect(css).toContain('.settings-form input[aria-invalid="true"]');
  });

  it("rejects invalid review-day settings instead of silently saving defaults", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    const parseReviewDaysSource = appSource.match(/function parseReviewDays\(value\) \{[\s\S]*?\n\}/);
    const parseReviewDays = new Function(`${parseReviewDaysSource?.[0]}; return parseReviewDays;`)();

    expect(parseReviewDays("1,3,7,3")).toEqual([1, 3, 7]);
    expect(parseReviewDays("")).toEqual([]);
    expect(parseReviewDays("abc")).toEqual([]);
    expect(parseReviewDays("0,3")).toEqual([]);
    expect(parseReviewDays("1,366")).toEqual([]);
    expect(parseReviewDays("1.5,3")).toEqual([]);

    expect(appSource).toContain("function validateReviewDaysSetting(reviewDays) {");
    expect(appSource).toContain("const valid = Array.isArray(reviewDays) && reviewDays.length > 0");
    expect(appSource).toContain('input?.setAttribute("aria-invalid", String(!valid))');
    expect(appSource).toContain('showToast("复盘间隔请填写 1-365 的整数，用英文逗号分隔。")');
    expect(appSource).toMatch(/const reviewDays = parseReviewDays\(document\.getElementById\("settingReviewDays"\)\.value\);\s*if \(!validateReviewDaysSetting\(reviewDays\)\) return;\s*const nextSettings = \{/);
    expect(appSource).toMatch(/reviewDays,\s*planControls: normalizePlanControls/);
    expect(appSource).toContain('document.getElementById("settingReviewDays")?.removeAttribute("aria-invalid")');
    expect(css).toContain('.settings-form input[aria-invalid="true"]');
  });

  it("versions custom task edits and snapshots custom task deletion", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(appSource).toContain("function mergeCustomTasks(localState = {}, cloudState = {})");
    expect(appSource).toContain("function timestampMs(value)");
    expect(appSource).toMatch(/const local = stateObject\(localState\);\s*const cloud = stateObject\(cloudState\);\s*const localTime = timestampMs\(stateObject\(local\.settings\)\.customTasksUpdatedAt\);\s*const cloudTime = timestampMs\(stateObject\(cloud\.settings\)\.customTasksUpdatedAt\);/);
    expect(appSource).toContain("if (localTime || cloudTime) return stateArray(cloudTime > localTime ? cloud.customTasks : local.customTasks).filter(isPlainStateObject);");
    expect(appSource).toContain("customTasks: mergeCustomTasks(localState, cloudState)");
    expect(appSource).toContain('updatedAt: firstTextValue([task.updatedAt, task.updated_at], "", 80)');
    expect(appSource).toMatch(/const updatedAt = new Date\(\)\.toISOString\(\);\s*customTaskRows\(\)\.push\(\{ id: String\(Date\.now\(\)\), subject, text, minutes, updatedAt \}\);\s*state\.settings\.customTasksUpdatedAt = updatedAt;\s*const saved = saveState\(\);/);
    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-delete-custom\]"\)[\s\S]*window\.confirm\(`确认删除自定义任务/);
    expect(appSource).toMatch(/window\.confirm\(`确认删除自定义任务[\s\S]*createLocalSnapshot\("before-delete-custom-task"\);[\s\S]*state\.settings\.customTasksUpdatedAt = new Date\(\)\.toISOString\(\);[\s\S]*state\.customTasks = customTaskRows\(\)\.filter[\s\S]*const saved = saveState\(\);[\s\S]*renderSnapshotPanel\(\);[\s\S]*setLocalSaveResult\(saved, "自定义任务已删除", "已保留删除前快照，可在账号面板恢复。", "自定义任务删除未写入本机缓存"\);/);
  });

  it("loads and saves profile-scoped user assets without leaking them into settings", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const helperSource = syncSource.slice(
      syncSource.indexOf("function normalizeRatio"),
      syncSource.indexOf("export async function getCurrentUser")
    );
    const helpers = new Function(`
      const PLAN_LOGIC_VERSION = "3.7-jun15-clean-start-2026-06-15";
      const PLAN_START_DATE = "2026-06-15";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      const DEFAULT_TARGET_EXAM_DATE = "2027-12-25";
      const DEFAULT_REVIEW_DAYS = [1, 3, 7, 14, 30];
      const DEFAULT_RETRO_TIME = "22:00";
      const DEFAULT_PROFILE_NUMBERS = { weekdayMinutes: 120, weekendMinutes: 210, taskCount: 3, coreRatio: 65 };
      const DENSITY_MODES = ["focus", "balanced", "detail"];
      const MASTERY_STATUSES = ["learning", "needs_review", "mastered"];
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
      ${helperSource}
      return { splitProfileSettings, buildProfileSettingsPayload };
    `)();

    const split = helpers.splitProfileSettings({
      density: "detail",
      constructor: "bad",
      resourcesUpdatedAt: "bad-time",
      customTasksUpdatedAt: "2026-06-16T00:00:00.000Z",
      planControls: {
        planIntensity: "evil",
        focusSubject: "数学",
        experienceTrack: "latePolitics",
        reviewLoad: 99,
        maxNewTopics: -1,
        rollingWindowDays: 3,
        enabledSubjects: ["english", "bad-subject"]
      },
      customTasks: [
        { id: "c1", subject: "数学", text: "极限题 10 道", minutes: "35", updated_at: "2026-06-16T08:00:00Z" },
        { id: "blank", subject: "408", text: "", minutes: 20 }
      ],
      project: {
        README: "true",
        Demo: "false",
        updated_at: "2026-06-17T09:00:00Z"
      },
      deleted: {
        records: ["2026-06-14", "2026-06-15"],
        scores: ["score-cloud"],
        tasks: ["task-cloud"],
        reviews: ["review-cloud"]
      },
      deletedMeta: {
        records: { "2026-06-14": "2026-06-14T00:00:00Z", "2026-06-15": "2026-06-15T00:00:00Z" },
        scores: { "score-cloud": "2026-06-16T00:00:00Z" },
        tasks: { "task-cloud": "invalid" },
        reviews: { "review-cloud": "2026-06-17T00:00:00Z" }
      }
    });

    expect(split.settings).toEqual({
      density: "detail",
      customTasksUpdatedAt: "2026-06-16T00:00:00.000Z",
      planControls: {
        planIntensity: "normal",
        focusSubject: "math",
        experienceTrack: "latePolitics",
        reviewLoad: 60,
        maxNewTopics: 0,
        rollingWindowDays: 7,
        enabledSubjects: ["english", "math", "cs408", "review"]
      }
    });
    expect(split.deleted).toEqual({
      records: ["2026-06-15"],
      scores: ["score-cloud"],
      tasks: ["task-cloud"],
      reviews: ["review-cloud"]
    });
    expect(split.deletedMeta).toEqual({
      records: { "2026-06-15": "2026-06-15T00:00:00.000Z" },
      scores: { "score-cloud": "2026-06-16T00:00:00.000Z" },
      tasks: {},
      reviews: { "review-cloud": "2026-06-17T00:00:00.000Z" }
    });
    expect(split.customTasks).toEqual([{
      id: "c1",
      subject: "数学",
      text: "极限题 10 道",
      minutes: 35,
      updatedAt: "2026-06-16T08:00:00.000Z"
    }]);
    expect(split.project).toEqual({
      README: true,
      Demo: false,
      updatedAt: "2026-06-17T09:00:00.000Z"
    });

    const payload = helpers.buildProfileSettingsPayload({
      settings: {
        density: "focus",
        planControls: { planIntensity: "strong", focusSubject: "408", enabledSubjects: ["政治", "review"] },
        resourcesUpdatedAt: "2026-06-19T02:00:00Z",
        constructor: "bad",
        customTasks: [{ id: "stale", text: "旧任务", minutes: 20 }],
        project: { stale: true },
        deleted: { records: ["2026-06-08"] }
      },
      customTasks: [{ id: "fresh", subject: "408", text: "同步任务", minutes: 25 }],
      project: { Milestone: true, updatedAt: "2026-06-18T09:00:00.000Z" },
      deleted: { records: ["2026-06-16"], scores: ["fresh-score"], tasks: [], reviews: [] },
      deletedMeta: {
        records: { "2026-06-16": "2026-06-19T00:00:00Z", stale: "2026-06-19T00:00:00Z" },
        scores: { "fresh-score": "2026-06-19T01:00:00Z" }
      }
    });

    expect(payload.density).toBe("focus");
    expect(Object.prototype.hasOwnProperty.call(payload, "constructor")).toBe(false);
    expect(payload.resourcesUpdatedAt).toBe("2026-06-19T02:00:00.000Z");
    expect(payload.planControls).toEqual({
      planIntensity: "strong",
      focusSubject: "cs408",
      experienceTrack: "balanced",
      reviewLoad: 25,
      maxNewTopics: 3,
      rollingWindowDays: 30,
      enabledSubjects: ["politics", "review", "math", "cs408"]
    });
    expect(payload.customTasks).toEqual([{
      id: "fresh",
      subject: "408",
      text: "同步任务",
      minutes: 25,
      updatedAt: ""
    }]);
    expect(payload.project).toEqual({
      Milestone: true,
      updatedAt: "2026-06-18T09:00:00.000Z"
    });
    expect(payload.deleted).toEqual({
      records: ["2026-06-16"],
      scores: ["fresh-score"],
      tasks: [],
      reviews: []
    });
    expect(payload.deletedMeta).toEqual({
      records: { "2026-06-16": "2026-06-19T00:00:00.000Z" },
      scores: { "fresh-score": "2026-06-19T01:00:00.000Z" },
      tasks: {},
      reviews: {}
    });

    expect(syncSource).toContain("const profileRow = cloudObject(profile.data)");
    expect(syncSource).toContain("function sanitizeCloudProfileSettings(value)");
    expect(syncSource).toContain("splitProfileSettings(profileRow.settings)");
    expect(syncSource).toContain("deleted: profileDeleted");
    expect(syncSource).toContain("deletedMeta: profileDeletedMeta");
    expect(syncSource).toContain("state.customTasks = profileCustomTasks");
    expect(syncSource).toContain("state.project = profileProject");
    expect(syncSource).toContain("settings: buildProfileSettingsPayload(state)");
    expect(syncSource).toContain("customTasks: state.customTasks");
    expect(syncSource).toContain("project: state.project");
    expect(syncSource).toContain("resources: state.resources");
    expect(syncSource).toContain("const deleted = sanitizeCloudDeleted(state.deleted || {})");
    expect(syncSource).toContain("deleted,");
    expect(syncSource).toContain("deletedMeta: sanitizeCloudDeletedMeta(state.deletedMeta || {}, deleted)");
  });

  it("loads cloud soft-deletes as tombstones so stale local rows do not resurrect", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const helperSource = syncSource.slice(
      syncSource.indexOf("function asDate"),
      syncSource.indexOf("function timestampMs")
    );
    const mergeDeletedTombstones = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      ${helperSource}
      return mergeDeletedTombstones;
    `)();

    expect(mergeDeletedTombstones(
      { records: ["2026-06-08"], scores: ["local-score"], tasks: [], reviews: ["local-review"] },
      { records: [], scores: ["cloud-score"], tasks: ["cloud-task"], reviews: ["local-review", "cloud-review"] }
    )).toEqual({
      records: ["2026-06-08"],
      scores: ["cloud-score", "local-score"],
      tasks: ["cloud-task"],
      reviews: ["local-review", "cloud-review"]
    });

    expect(syncSource).toContain('supabase.from("study_tasks").select("id,source_task_id,task_date,deleted_at").eq("user_id", user.id).gte("task_date", PLAN_START_DATE).not("deleted_at", "is", null)');
    expect(syncSource).toContain('supabase.from("review_items").select("id,source_task_id,due_date,deleted_at").eq("user_id", user.id).gte("due_date", PLAN_START_DATE).not("deleted_at", "is", null)');
    expect(syncSource).toContain('supabase.from("mock_scores").select("id,mock_date,deleted_at").eq("user_id", user.id).gte("mock_date", PLAN_START_DATE).not("deleted_at", "is", null)');
    expect(syncSource).toContain("const profileAndLocalDeleted = mergeDeletedTombstones(state.deleted, profileDeleted)");
    expect(syncSource).toContain("const profileAndLocalDeletedMeta = mergeDeletedTombstoneMeta(state.deletedMeta, profileDeletedMeta, profileAndLocalDeleted)");
    expect(syncSource).toContain("state.deleted = mergeDeletedTombstones(profileAndLocalDeleted, cloudSoftDeleted)");
    expect(syncSource).toContain("state.deletedMeta = mergeDeletedTombstoneMeta(profileAndLocalDeletedMeta, cloudSoftDeletedMeta, state.deleted)");
    expect(syncSource).toMatch(/scores: deletedScoreRows[\s\S]*safeCloudKey\(row\.id\)[\s\S]*\.map\(\(row\) => safeCloudKey\(row\.id\)\)/);
    expect(syncSource).toMatch(/tasks: deletedTaskRows[\s\S]*datedIdStarted\(row\.source_task_id\)[\s\S]*safeCloudKey\(row\.id\)[\s\S]*\.map\(\(row\) => safeCloudKey\(row\.id\)\)/);
    expect(syncSource).toMatch(/reviews: deletedReviewRows[\s\S]*datedIdStarted\(row\.source_task_id\)[\s\S]*safeCloudKey\(row\.id\)[\s\S]*\.map\(\(row\) => safeCloudKey\(row\.id\)\)/);
    expect(syncSource).toMatch(/cloudSoftDeletedMeta = \{[\s\S]*scores: Object\.fromEntries[\s\S]*row\.deleted_at[\s\S]*tasks: Object\.fromEntries[\s\S]*row\.deleted_at[\s\S]*reviews: Object\.fromEntries[\s\S]*row\.deleted_at/);
  });

  it("normalizes topic progress status values at cloud sync boundaries", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");

    expect(syncSource).toContain("const topicId = safeCloudKey(row.topic_id)");
    expect(syncSource).toContain("if (!topicId) return");
    expect(syncSource).toContain("const statusValue = asInteger(row.status_value, 0, 2)");
    expect(syncSource).toContain("state.topics[topicId] = statusValue");
    expect(syncSource).toContain("masteryStatus: normalizeMasteryStatus(row.mastery_status, statusValue)");
    expect(syncSource).toContain("const safeTopicId = safeCloudKey(topicId)");
    expect(syncSource).toContain("if (!safeTopicId) return []");
    expect(syncSource).toContain("const statusValue = asInteger(value, 0, 2)");
    expect(syncSource).toContain("status_value: statusValue");
    expect(syncSource).toContain('mastery_status: normalizeMasteryStatus(firstCloudString([evidence.masteryStatus, evidence.mastery_status]), statusValue)');
    expect(syncSource).not.toContain("state.topics[row.topic_id] = row.status_value || 0");
    expect(syncSource).not.toContain("status_value: value || 0");
  });

  it("clears cloud soft-delete markers when active rows are upserted again", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");

    expect(syncSource).toMatch(/const tasks = uniqueBy[\s\S]*source_task_id: firstCloudKey\(\[task\.sourceTaskId, task\.source_task_id\]\),[\s\S]*required_artifacts: firstCloudStringArray\(\[task\.requiredArtifacts, task\.required_artifacts\]\),[\s\S]*evidence_submitted: firstCloudBoolean\(\[task\.evidenceSubmitted, task\.evidence_submitted\]\),\s*deleted_at: null,\s*updated_at: firstCloudTimestamp\(\[task\.updatedAt, task\.updated_at\], now\)/);
    expect(syncSource).toMatch(/const reviews = uniqueBy[\s\S]*source_task_id: firstCloudKey\(\[item\.sourceTaskId, item\.source_task_id\]\),[\s\S]*due_date: firstCloudDate\(\[item\.dueDate, item\.due_date, item\.nextDueAt, item\.next_due_at\]\) \|\| now\.slice\(0, 10\),[\s\S]*topic_id: firstCloudKey\(\[item\.topicId, item\.topic_id\]\),\s*deleted_at: null,\s*updated_at: firstCloudTimestamp\(\[item\.updatedAt, item\.updated_at\], now\)/);
    expect(syncSource).toMatch(/const scores = uniqueBy[\s\S]*note: asString\(score\.note\),\s*deleted_at: null,\s*updated_at: firstCloudTimestamp\(\[score\.updatedAt, score\.updated_at\], now\)/);
  });

  it("uses original tombstone timestamps when pushing cloud deletes", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const helperSource = syncSource.slice(
      syncSource.indexOf("function asDate"),
      syncSource.indexOf("export async function getCurrentUser")
    );
    const deletedTombstoneBatches = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      ${helperSource}
      return deletedTombstoneBatches;
    `)();

    expect(deletedTombstoneBatches(
      ["s1", "s2", "s3"],
      "scores",
      { scores: { s1: "2026-06-17T00:00:00Z", s2: "2026-06-17T00:00:00.000Z", s3: "invalid" } },
      "2026-06-19T00:00:00.000Z"
    )).toEqual([
      { deletedAt: "2026-06-17T00:00:00.000Z", ids: ["s1", "s2"] },
      { deletedAt: "2026-06-19T00:00:00.000Z", ids: ["s3"] }
    ]);

    expect(syncSource).toContain('const deletedRecordBatches = deletedTombstoneBatches(deletedRecords, "records", deletedMeta, now)');
    expect(syncSource).toContain('const deletedScoreBatches = deletedTombstoneBatches(deletedScores, "scores", deletedMeta, now)');
    expect(syncSource).toContain('const deletedTaskBatches = deletedTombstoneBatches(deletedTasks, "tasks", deletedMeta, now)');
    expect(syncSource).toContain('const deletedReviewBatches = deletedTombstoneBatches(deletedReviews, "reviews", deletedMeta, now)');
    expect(syncSource).toMatch(/daily_records"\)\.delete\(\)\.eq\("user_id", user\.id\)\.in\("study_date", batch\.ids\)\.lte\("updated_at", batch\.deletedAt\)/);
    expect(syncSource).toMatch(/mock_scores"\)\.update\(\{ deleted_at: batch\.deletedAt, updated_at: batch\.deletedAt \}\)\.eq\("user_id", user\.id\)\.in\("id", batch\.ids\)\.lte\("updated_at", batch\.deletedAt\)/);
    expect(syncSource).toMatch(/study_tasks"\)\.update\(\{ deleted_at: batch\.deletedAt, updated_at: batch\.deletedAt \}\)\.eq\("user_id", user\.id\)\.in\("id", batch\.ids\)\.lte\("updated_at", batch\.deletedAt\)/);
    expect(syncSource).toMatch(/review_items"\)\.update\(\{ deleted_at: batch\.deletedAt, updated_at: batch\.deletedAt \}\)\.eq\("user_id", user\.id\)\.in\("id", batch\.ids\)\.lte\("updated_at", batch\.deletedAt\)/);
    expect(syncSource).not.toContain('mock_scores.delete", supabase.from("mock_scores").update({ deleted_at: now, updated_at: now })');
    expect(syncSource).not.toContain('study_tasks.delete", supabase.from("study_tasks").update({ deleted_at: now, updated_at: now })');
    expect(syncSource).not.toContain('review_items.delete", supabase.from("review_items").update({ deleted_at: now, updated_at: now })');
  });

  it("rejects object-coerced dates and timestamps at cloud sync boundaries", () => {
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const helperSource = syncSource.slice(
      syncSource.indexOf("function normalizeRatio"),
      syncSource.indexOf("export async function getCurrentUser")
    );
    const helpers = new Function(`
      const PLAN_START_DATE = "2026-06-15";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      ${helperSource}
      return { asBoolean, safeCloudLabel, firstCloudString, firstCloudLabel, firstCloudInteger, firstCloudRatio, firstCloudBoolean, cloudScoreTotal, firstCloudKey, firstCloudDate, firstCloudTimestamp, firstCloudStringArray, asDate, asTimestamp, datedIdStarted, timestampMs, mergeDeletedTombstoneMeta };
    `)();

    const objectDate = { toString: () => "2026-06-16" };
    const objectTimestamp = { toString: () => "2026-06-19T00:00:00.000Z" };

    expect(helpers.asDate(objectDate)).toBeNull();
    expect(helpers.asTimestamp(objectTimestamp, "fallback")).toBe("fallback");
    expect(helpers.timestampMs(objectTimestamp)).toBe(0);
    expect(helpers.asBoolean({ value: true })).toBe(false);
    expect(helpers.safeCloudLabel({ toString: () => "generated" }, "fallback")).toBe("fallback");
    expect(helpers.firstCloudString([{ toString: () => "bad" }, "safe-text"])).toBe("safe-text");
    expect(helpers.firstCloudLabel([{ toString: () => "practice" }, "safe-label"], "fallback")).toBe("safe-label");
    expect(helpers.firstCloudInteger([{ value: 3 }, "4"], 0, 5)).toBe(4);
    expect(helpers.firstCloudInteger(["99"], 0, 5)).toBe(5);
    expect(helpers.firstCloudRatio([{ value: 84 }, "84"])).toBe(0.84);
    expect(helpers.firstCloudBoolean([{ value: true }, "true"])).toBe(true);
    expect(helpers.firstCloudBoolean(["false", "true"], true)).toBe(false);
    expect(helpers.cloudScoreTotal({ total: { bad: true }, politics: 70, english: "60", math: 100, cs408: 90 })).toBe(320);
    expect(helpers.cloudScoreTotal({ total: 350, politics: { bad: true }, english: 60, math: 100, cs408: 90 })).toBe(350);
    expect(helpers.firstCloudKey([{ toString: () => "topic-object" }, "topic-safe"])).toBe("topic-safe");
    expect(helpers.firstCloudDate([objectDate, "2026-06-16"])).toBe("2026-06-16");
    expect(helpers.firstCloudTimestamp([objectTimestamp, "2026-06-19T00:00:00Z"], "fallback")).toBe("2026-06-19T00:00:00.000Z");
    expect(helpers.firstCloudStringArray([[{ bad: true }], ["错题照片"]])).toEqual(["错题照片"]);
    expect(helpers.datedIdStarted({ toString: () => "2026-06-07-task" })).toBe(true);
    expect(helpers.mergeDeletedTombstoneMeta(
      { scores: { s1: "2026-06-17T00:00:00Z" }, records: {}, tasks: {}, reviews: {} },
      { scores: { s1: objectTimestamp }, records: {}, tasks: {}, reviews: {} },
      { records: [], scores: ["s1"], tasks: [], reviews: [] }
    )).toEqual({
      records: {},
      scores: { s1: "2026-06-17T00:00:00.000Z" },
      tasks: {},
      reviews: {}
    });
  });

  it("snapshots record and score deletes before tombstoning local data", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(appSource).toMatch(/if \(window\.confirm\(`确认删除 \$\{date\} 的记录？`\)\) \{\s*createLocalSnapshot\("before-delete-record"\);\s*ensureLearningContainers\(\);\s*delete state\.entries\[date\];\s*markDeleted\("records", date\);/);
    expect(appSource).toMatch(/markDeleted\("records", date\);\s*const saved = saveState\(\);\s*renderAll\(\);\s*renderSnapshotPanel\(\);\s*setLocalSaveResult\(saved, "记录已删除", "已保留删除前快照，可在账号面板恢复。", "记录删除未写入本机缓存"\);/);
    expect(appSource).toMatch(/if \(!window\.confirm\("确认删除这条模考记录？"\)\) return;\s*createLocalSnapshot\("before-delete-score"\);\s*markDeleted\("scores", button\.dataset\.deleteScore\);/);
    expect(appSource).toMatch(/state\.scores = scoreRows\(\)\.filter\(\(item\) => item\.id !== button\.dataset\.deleteScore\);\s*const saved = saveState\(\);\s*renderScores\(\);\s*renderDashboard\(\);\s*renderSnapshotPanel\(\);\s*setLocalSaveResult\(saved, "模考记录已删除", "已保留删除前快照，可在账号面板恢复。", "模考删除未写入本机缓存"\);/);
  });

  it("merges tombstones and clears matching tombstones when data is recreated", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const deletedMergeSource = appSource.match(/function mergeDeletedTombstones\(localDeleted = \{\}, cloudDeleted = \{\}\) \{[\s\S]*?\n\}/);
    const mergeDeletedTombstones = new Function(`const DELETED_TYPES = ["records", "scores", "tasks", "reviews"]; ${deletedMergeSource?.[0]}; return mergeDeletedTombstones;`)();

    expect(mergeDeletedTombstones(
      { records: ["2026-06-08"], scores: ["s1"], tasks: ["t-local"], reviews: [] },
      { records: ["2026-06-16", "2026-06-08"], scores: ["s2"], tasks: ["t-cloud"], reviews: ["r1"] }
    )).toEqual({
      records: ["2026-06-16", "2026-06-08"],
      scores: ["s2", "s1"],
      tasks: ["t-cloud", "t-local"],
      reviews: ["r1"]
    });

    expect(appSource).toContain("const mergedDeleted = mergeDeletedTombstones(localState.deleted, cloudState.deleted)");
    expect(appSource).toContain("const mergedDeletedMeta = mergeDeletedTombstoneMeta(localState.deletedMeta, cloudState.deletedMeta, mergedDeleted)");
    expect(appSource).toContain("deleted: mergedDeleted");
    expect(appSource).toContain("deletedMeta: mergedDeletedMeta");
    expect(appSource).toContain("function unmarkDeleted(type, id)");
    expect(appSource).not.toContain("state.deleted = { records: [], scores: [], tasks: [], reviews: [] };");
    expect(appSource).toMatch(/if \(!validateEntryForm\(entry\)\) return;\s*unmarkDeleted\("records", date\);\s*state\.entries\[date\] = \{/);
    expect(appSource).toMatch(/score\.updatedAt = new Date\(\)\.toISOString\(\);\s*unmarkDeleted\("scores", editingId\);\s*state\.scores = scores\.map/);
    expect(appSource).toMatch(/score\.updatedAt = new Date\(\)\.toISOString\(\);\s*unmarkDeleted\("scores", score\.id\);\s*scores\.push\(score\);/);
    expect(appSource).toMatch(/entry\.updatedAt = new Date\(\)\.toISOString\(\);\s*unmarkDeleted\("records", date\);\s*state\.entries\[date\] = entry;/);
    expect(appSource).toMatch(/state\.weekPlans\[date\]\.forEach\(\(task\) => \{\s*unmarkDeleted\("tasks", task\.id\);/);
  });

  it("keeps recreated rows that are newer than tombstone metadata", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const normalizeTimestampSource = appSource.match(/function normalizeTimestamp\(value, fallback = ""\) \{[\s\S]*?\n\}/);
    const timestampSource = appSource.match(/function timestampMs\(value\) \{[\s\S]*?\n\}/);
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function sanitizeDateKey")
    );
    const tombstoneBlock = appSource.slice(
      appSource.indexOf("function mergeDeletedTombstones"),
      appSource.indexOf("function queueCloudSync")
    );
    const helpers = new Function(`
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      ${normalizeTimestampSource?.[0]}
      ${timestampSource?.[0]}
      ${shapeHelperSource}
      ${tombstoneBlock}
      return { mergeDeletedTombstoneMeta, applyTombstones };
    `)();

    expect(helpers.mergeDeletedTombstoneMeta(
      { records: { "2026-06-08": "2026-06-16T00:00:00Z" }, scores: {}, tasks: {}, reviews: {} },
      { records: { "2026-06-08": "2026-06-17T00:00:00Z" }, scores: {}, tasks: {}, reviews: {} },
      { records: ["2026-06-08"], scores: [], tasks: [], reviews: [] }
    )).toEqual({
      records: { "2026-06-08": "2026-06-17T00:00:00.000Z" },
      scores: {},
      tasks: {},
      reviews: {}
    });

    const nextState = helpers.applyTombstones({
      entries: {
        "2026-06-08": { updatedAt: "2026-06-19T00:00:00.000Z" },
        "2026-06-16": { updatedAt: "2026-06-08T00:00:00.000Z" }
      },
      scores: [
        { id: "fresh-score", updatedAt: "2026-06-19T00:00:00.000Z" },
        { id: "old-score", updatedAt: "2026-06-08T00:00:00.000Z" }
      ],
      reviewItems: [
        { id: "fresh-review", updatedAt: "2026-06-19T00:00:00.000Z" },
        { id: "old-review", updatedAt: "2026-06-08T00:00:00.000Z" }
      ],
      tasks: { "fresh-task": true, "old-task": true },
      weekPlans: {
        "2026-06-08": [
          { id: "fresh-task", updatedAt: "2026-06-19T00:00:00.000Z" },
          { id: "old-task", updatedAt: "2026-06-08T00:00:00.000Z" }
        ]
      },
      deleted: {
        records: ["2026-06-08", "2026-06-16"],
        scores: ["fresh-score", "old-score"],
        tasks: ["fresh-task", "old-task"],
        reviews: ["fresh-review", "old-review"]
      },
      deletedMeta: {
        records: { "2026-06-08": "2026-06-17T00:00:00.000Z", "2026-06-16": "2026-06-17T00:00:00.000Z" },
        scores: { "fresh-score": "2026-06-17T00:00:00.000Z", "old-score": "2026-06-17T00:00:00.000Z" },
        tasks: { "fresh-task": "2026-06-17T00:00:00.000Z", "old-task": "2026-06-17T00:00:00.000Z" },
        reviews: { "fresh-review": "2026-06-17T00:00:00.000Z", "old-review": "2026-06-17T00:00:00.000Z" }
      }
    });

    expect(Object.keys(nextState.entries)).toEqual(["2026-06-08"]);
    expect(nextState.scores.map((score) => score.id)).toEqual(["fresh-score"]);
    expect(nextState.reviewItems.map((item) => item.id)).toEqual(["fresh-review"]);
    expect(nextState.weekPlans["2026-06-08"].map((task) => task.id)).toEqual(["fresh-task"]);
    expect(nextState.tasks).toEqual({ "fresh-task": true });
    expect(nextState.deleted).toEqual({
      records: ["2026-06-16"],
      scores: ["old-score"],
      tasks: ["old-task"],
      reviews: ["old-review"]
    });
    expect(nextState.deletedMeta.records).toEqual({ "2026-06-16": "2026-06-17T00:00:00.000Z" });

    expect(helpers.applyTombstones({
      entries: "bad-entries",
      scores: { 0: { id: "bad-score" } },
      reviewItems: "bad-reviews",
      weekPlans: { "2026-06-16": "bad-task-list" },
      tasks: "bad-task-state",
      deleted: { records: "bad-records", scores: {}, tasks: ["missing-task"], reviews: null },
      deletedMeta: "bad-meta"
    })).toMatchObject({
      entries: {},
      scores: [],
      reviewItems: [],
      weekPlans: { "2026-06-16": [] },
      tasks: {},
      deleted: { records: [], scores: [], tasks: ["missing-task"], reviews: [] },
      deletedMeta: { records: {}, scores: {}, tasks: {}, reviews: {} }
    });

    expect(appSource).toContain("function shouldApplyTombstone(deletedMeta = {}, type, id, activeUpdatedAt = \"\")");
    expect(appSource).toContain("function pruneTombstone(nextState, type, id)");
    expect(appSource).toMatch(/function saveState\(options = \{\}\) \{\s*state = applyTombstones\(state\);\s*state\.schemaVersion = SCHEMA_VERSION;/);
    expect(appSource).toMatch(/function applyTombstones\(nextState\) \{\s*if \(!isPlainStateObject\(nextState\)\) nextState = \{\};\s*nextState\.entries = stateObject\(nextState\.entries\);/);
  });

  it("validates manual week-task edits before mutating tasks", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const taskTextSource = appSource.match(/function isValidTaskEditText\(text\) \{[\s\S]*?\n\}/);
    const taskMinutesSource = appSource.match(/function isValidTaskEditMinutes\(minutes\) \{[\s\S]*?\n\}/);
    const isValidTaskEditText = new Function(`${taskTextSource?.[0]}; return isValidTaskEditText;`)();
    const isValidTaskEditMinutes = new Function(`${taskMinutesSource?.[0]}; return isValidTaskEditMinutes;`)();

    expect(isValidTaskEditText("基础题 20 道")).toBe(true);
    expect(isValidTaskEditText("   ")).toBe(false);
    expect(isValidTaskEditMinutes(10)).toBe(true);
    expect(isValidTaskEditMinutes(180)).toBe(true);
    expect(isValidTaskEditMinutes(9)).toBe(false);
    expect(isValidTaskEditMinutes(181)).toBe(false);
    expect(isValidTaskEditMinutes(33)).toBe(false);
    expect(isValidTaskEditMinutes(30.5)).toBe(false);

    expect(appSource).toContain("function isValidTaskEditText(text)");
    expect(appSource).toContain("function isValidTaskEditMinutes(minutes)");
    expect(appSource).toMatch(/const task = findTask\(taskId\);\s*if \(!task\) \{\s*setAuthResult\("error", "任务不可编辑", "这个任务已不存在，请刷新周计划后再试。"\);\s*return;\s*\}/);
    expect(appSource).toContain('setAuthResult("error", "任务内容无效", "任务内容不能为空，请写成可验收动作。")');
    expect(appSource).toContain('setAuthResult("error", "任务分钟无效", "任务分钟数请填写 10-180 的 5 分钟整数刻度。")');
    expect(appSource).toMatch(/const nextText = text\.trim\(\);\s*if \(!isValidTaskEditText\(nextText\)\)/);
    expect(appSource).toMatch(/const minutes = Number\(String\(minutesInput\)\.trim\(\)\);\s*if \(!isValidTaskEditMinutes\(minutes\)\)/);
    expect(appSource).toContain("task.minutes = minutes");
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "任务已修改", "已锁定为手动任务，后续重排会保留它。", "任务修改未写入本机缓存"\);/);
    expect(appSource).not.toMatch(/function editTask\(taskId\)[\s\S]*roundToFive\(minutes\)[\s\S]*setAuthResult\("success", "任务已修改"/);
  });

  it("tracks auto-applied task entry changes so untouched values can be reverted", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const sanitizeNumberSource = appSource.match(/function sanitizeNumber\(value, min = 0, max = Number\.POSITIVE_INFINITY\) \{[\s\S]*?\n\}/);
    const safeScalarTextSource = appSource.match(/function safeScalarText\(value, fallback = "", maxLength = 2000\) \{[\s\S]*?\n\}/);
    const sanitizeDateKeySource = appSource.match(/function sanitizeDateKey\(value\) \{[\s\S]*?\n\}/);
    const impactSource = appSource.match(/function normalizeTaskRecordImpact\(impact\) \{[\s\S]*?\n\}/);
    const normalizeTaskRecordImpact = new Function(`
      ${sanitizeNumberSource?.[0]}
      ${safeScalarTextSource?.[0]}
      ${sanitizeDateKeySource?.[0]}
      ${impactSource?.[0]}
      return normalizeTaskRecordImpact;
    `)();

    expect(normalizeTaskRecordImpact({
      date: "2026-06-08",
      changes: [
        { field: "math", before: 0, after: 45 },
        { field: "mathProblems", before: "abc", after: 15 },
        { field: { bad: true }, key: "cs408", before: 10, after: 30 },
        { field: "note", before: 0, after: 1 }
      ]
    })).toEqual({
      date: "2026-06-08",
      changes: [
        { field: "math", before: 0, after: 45 },
        { field: "mathProblems", before: 0, after: 15 },
        { field: "cs408", before: 10, after: 30 }
      ]
    });
    expect(normalizeTaskRecordImpact({ date: "2026-06-08", changes: [{ field: "note", before: 0, after: 1 }] })).toBeNull();

    expect(appSource).toContain("function normalizeTaskRecordImpact(impact)");
    expect(appSource).toContain("function firstTaskRecordImpact(values)");
    expect(appSource).toContain("recordImpact: firstTaskRecordImpact([row.recordImpact, row.record_impact])");
    expect(appSource).toContain("recordImpact: normalizeTaskRecordImpact(task.recordImpact)");
    expect(appSource).toMatch(/const impact = applyTaskToEntry\(task\);\s*task\.recordApplied = true;\s*task\.recordImpact = impact;/);
    expect(appSource).toMatch(/else if \(!checkbox\.checked && task\.recordApplied\) \{\s*revertTaskFromEntry\(task\);\s*task\.recordApplied = false;\s*task\.recordImpact = null;/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderDailyTaskProgress\(tasks\);\s*renderReviewQueue\(\);\s*renderDashboard\(\);\s*renderFocusBoard\(tasks\);\s*renderWeekPlanner\(\);\s*if \(!saved\) \{\s*setLocalSaveResult\(false, "任务状态已保存", "任务状态已写入本机缓存。", checkbox\.checked \? "任务完成状态未写入本机缓存" : "任务取消完成未写入本机缓存"\);/);
    expect(appSource).toContain("function revertTaskFromEntry(task)");
    expect(appSource).toContain("if (sanitizeNumber(entry[change.field]) !== change.after) return;");
  });

  it("prevents duplicate or completed week-task shifts", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(appSource).toMatch(/if \(!shiftTaskToTomorrow\(button\.dataset\.shiftTask\)\) \{[\s\S]*setAuthResult\("idle", "无需顺延任务", "任务已完成或已顺延，周计划未改变。"\);/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "任务已顺延", "已移动到下一天，并保留原任务的顺延标记。", "任务顺延未写入本机缓存"\);/);
    expect(appSource).toMatch(/function shiftTaskToTomorrow\(taskId\) \{[\s\S]*if \(!date\) return false;/);
    expect(appSource).toContain('if (!task || task.status === "shifted" || task.status === "done" || isTaskDone(task, state.tasks)) return false;');
    expect(appSource).toContain("const nextTasks = planTasksForDate(next)");
    expect(appSource).toContain("if (nextTasks.some((item) => item.id === shiftedId || item.sourceTaskId === task.id)) return false;");
    expect(appSource).toContain("priority: nextTasks.length + 1");
    expect(appSource).toContain("recordImpact: null");
    expect(appSource).toMatch(/state\.tasks\[shiftedId\] = false;\s*return true;/);
  });

  it("confirms and snapshots bulk clearing unlocked week tasks", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function safeStateKey")
    );
    const firstNumberValueSource = appSource.match(/function firstNumberValue\(values, min = 0, max = Number\.POSITIVE_INFINITY, fallback = min\) \{[\s\S]*?\n\}/);
    const firstIntegerValueSource = appSource.match(/function firstIntegerValue\(values, min = 0, max = Number\.POSITIVE_INFINITY, fallback = min\) \{[\s\S]*?\n\}/);
    const planHelpers = new Function(`
      let state = { weekPlans: "bad-week-plans", tasks: "bad-tasks" };
      ${shapeHelperSource}
      return { ensurePlanContainers, planTasksForDate, weekPlanEntries, getState: () => state, setState: (nextState) => { state = nextState; } };
    `)();

    planHelpers.ensurePlanContainers();
    expect(planHelpers.getState()).toEqual({ weekPlans: {}, tasks: {} });
    planHelpers.setState({
      weekPlans: { "2026-06-08": [{ id: "t1" }, "bad-task", null] },
      tasks: []
    });
    expect(planHelpers.planTasksForDate("2026-06-08")).toEqual([{ id: "t1" }]);
    expect(planHelpers.getState().tasks).toEqual({});
    planHelpers.setState({
      weekPlans: {
        "2026-06-08": [{ id: "t1" }, null],
        "2026-06-16": "bad-task-list",
        "2026-06-17": [{ id: "t2" }, "bad-task"]
      },
      tasks: {}
    });
    expect(planHelpers.weekPlanEntries()).toEqual([
      ["2026-06-08", [{ id: "t1" }]],
      ["2026-06-16", []],
      ["2026-06-17", [{ id: "t2" }]]
    ]);
    expect(planHelpers.getState().weekPlans["2026-06-16"]).toEqual([]);

    const learningHelpers = new Function(`
      let state = { entries: "bad-entries", scores: { 0: { id: "bad-score" } }, reviewItems: "bad-reviews" };
      ${shapeHelperSource}
      return { ensureLearningContainers, entryRow, scoreRows, reviewRows, getState: () => state, setState: (nextState) => { state = nextState; } };
    `)();
    learningHelpers.ensureLearningContainers();
    expect(learningHelpers.getState()).toEqual({ entries: {}, scores: [], reviewItems: [] });
    learningHelpers.setState({
      entries: { "2026-06-08": { math: 45 }, bad: "bad-entry" },
      scores: [{ id: "s1" }, "bad-score"],
      reviewItems: [null, { id: "r1" }]
    });
    expect(learningHelpers.entryRow("2026-06-08")).toEqual({ math: 45 });
    expect(learningHelpers.entryRow("bad")).toBeNull();
    expect(learningHelpers.scoreRows()).toEqual([{ id: "s1" }]);
    expect(learningHelpers.reviewRows()).toEqual([{ id: "r1" }]);

    const assetHelpers = new Function(`
      let state = { project: "bad-project", resources: "bad-resources", customTasks: { 0: { id: "bad-custom" } } };
      ${shapeHelperSource}
      return { ensureAssetContainers, customTaskRows, getState: () => state, setState: (nextState) => { state = nextState; } };
    `)();
    assetHelpers.ensureAssetContainers();
    expect(assetHelpers.getState()).toEqual({ project: {}, resources: {}, customTasks: [] });
    assetHelpers.setState({
      project: { README: true },
      resources: { math: 40 },
      customTasks: [{ id: "c1" }, "bad-custom"]
    });
    expect(assetHelpers.customTaskRows()).toEqual([{ id: "c1" }]);

    const knowledgeHelpers = new Function(`
      let state = { topics: "bad-topics", topicEvidence: { bad: "bad-evidence" } };
      ${shapeHelperSource}
      return { ensureKnowledgeContainers, topicStateValue, topicEvidenceRow, normalizeTopicStatus, getState: () => state, setState: (nextState) => { state = nextState; } };
    `)();
    knowledgeHelpers.ensureKnowledgeContainers();
    expect(knowledgeHelpers.getState()).toEqual({ topics: {}, topicEvidence: {} });
    knowledgeHelpers.setState({
      topics: { mastered: 2.4, review: 1, bad: "bad-status" },
      topicEvidence: { mastered: { evidence: "25 题" }, bad: "bad-evidence" }
    });
    expect(knowledgeHelpers.topicStateValue("mastered")).toBe(2);
    expect(knowledgeHelpers.topicStateValue("review")).toBe(1);
    expect(knowledgeHelpers.topicStateValue("bad")).toBe(0);
    expect(knowledgeHelpers.normalizeTopicStatus(-1)).toBe(0);
    expect(knowledgeHelpers.topicEvidenceRow("mastered")).toEqual({ evidence: "25 题" });
    expect(knowledgeHelpers.topicEvidenceRow("bad")).toEqual({});

    const runtimeHelpers = new Function(`
      let state = {
      settings: { weekdayMinutes: { bad: true }, weekday_minutes: "180", weekendMinutes: { bad: true }, weekend_minutes: "300", taskCount: { bad: true }, task_count: "4", coreRatio: { bad: true }, core_ratio: "70", density: "loud", targetExamDate: { bad: true }, reviewDays: "bad-days", planControls: "bad-controls" },
        sync: "bad-sync",
        deleted: { records: "bad-records", tasks: ["t1"] },
        deletedMeta: { tasks: { t1: "2026-06-17T00:00:00.000Z" }, scores: "bad-score-meta" }
      };
      const DEFAULT_EXAM_DATE = "2027-12-25";
      const DELETED_TYPES = ["records", "scores", "tasks", "reviews"];
      const defaultSettings = {
        weekdayMinutes: 120,
        weekendMinutes: 210,
        taskCount: 3,
        coreRatio: 65,
        density: "focus",
        lastExportDate: "",
        targetExamDate: DEFAULT_EXAM_DATE,
        reviewDays: [1, 3, 7, 14, 30],
        planControls: { planIntensity: "balanced" }
      };
      function sanitizeNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.min(max, Math.max(min, number));
      }
      function sanitizeInteger(value, min = 0, max = Number.POSITIVE_INFINITY) {
        return Math.round(sanitizeNumber(value, min, max));
      }
      function sanitizeBoolean(value) {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const normalized = value.trim().toLowerCase();
          if (["true", "1", "yes", "on"].includes(normalized)) return true;
          if (["false", "0", "no", "off", ""].includes(normalized)) return false;
        }
        return Boolean(value);
      }
      function normalizePlanControls(value = {}) {
        return { normalized: true, ...stateObject(value) };
      }
      ${shapeHelperSource}
      ${firstNumberValueSource?.[0]}
      ${firstIntegerValueSource?.[0]}
      return { ensureRuntimeContainers, ensureSettingsContainer, ensureSyncContainer, ensureTombstoneContainers, getState: () => state, setState: (nextState) => { state = nextState; } };
    `)();
    runtimeHelpers.ensureRuntimeContainers();
    expect(runtimeHelpers.getState()).toMatchObject({
      settings: {
        weekdayMinutes: 180,
        weekendMinutes: 300,
        taskCount: 4,
        coreRatio: 70,
        density: "focus",
        targetExamDate: "2027-12-25",
        reviewDays: [1, 3, 7, 14, 30],
        planControls: { normalized: true }
      },
      sync: {
        status: "local",
        lastSyncAt: "",
        lastError: "",
        pending: false,
        localImportPending: false,
        cloudPaused: false
      },
      deleted: { records: [], scores: [], tasks: ["t1"], reviews: [] },
      deletedMeta: { records: {}, scores: {}, tasks: { t1: "2026-06-17T00:00:00.000Z" }, reviews: {} }
    });
    runtimeHelpers.setState({
      settings: { targetExamDate: "2026-02-31", reviewDays: [14, "3", 3, 0], planControls: { planIntensity: "strong" } },
      sync: { status: "error", lastError: "runtime", pending: "false", localImportPending: "false", cloudPaused: "false" },
      deleted: "bad-deleted",
      deletedMeta: "bad-meta"
    });
    expect(runtimeHelpers.ensureSettingsContainer().targetExamDate).toBe("2027-12-25");
    expect(runtimeHelpers.ensureSettingsContainer().reviewDays).toEqual([1, 3, 14]);
    expect(runtimeHelpers.ensureSettingsContainer().planControls).toEqual({ normalized: true, planIntensity: "strong" });
    expect(runtimeHelpers.ensureSyncContainer()).toMatchObject({ status: "error", lastError: "runtime", localImportPending: false, cloudPaused: false, pending: false });
    expect(runtimeHelpers.ensureTombstoneContainers()).toEqual({
      deleted: { records: [], scores: [], tasks: [], reviews: [] },
      deletedMeta: { records: {}, scores: {}, tasks: {}, reviews: {} }
    });

    expect(appSource).toContain("function clearUnlockedWeekTasks(dates = nextSevenDates())");
    expect(appSource).toContain("function collectUnlockedWeekTasks(dates = nextSevenDates())");
    expect(appSource).toContain("function ensureSettingsContainer()");
    expect(appSource).toContain("function ensureSyncContainer()");
    expect(appSource).toContain("function ensureTombstoneContainers()");
    expect(appSource).toContain("function ensureRuntimeContainers()");
    expect(appSource).toContain("function ensurePlanContainers()");
    expect(appSource).toContain("function planTasksForDate(date)");
    expect(appSource).toContain("function weekPlanEntries()");
    expect(appSource).toContain("function ensureLearningContainers()");
    expect(appSource).toContain("function entryRow(date)");
    expect(appSource).toContain("function scoreRows()");
    expect(appSource).toContain("function reviewRows()");
    expect(appSource).toContain("function ensureAssetContainers()");
    expect(appSource).toContain("function customTaskRows()");
    expect(appSource).toContain("function ensureKnowledgeContainers()");
    expect(appSource).toContain("function topicStateValue(id)");
    expect(appSource).toContain("function topicEvidenceRow(id)");
    expect(appSource).toContain("nextSevenDates().forEach((date) => buildDailyTasks(true, date, { persist: false }));");
    expect(appSource).toContain("if (!Object.prototype.hasOwnProperty.call(weekPlans, date)) buildDailyTasks(false, date);");
    expect(appSource.match(/locked: sanitizeBoolean\(task\.locked\)/g)).toHaveLength(2);
    expect(appSource).toContain("recordApplied: sanitizeBoolean(task.recordApplied)");
    expect(appSource).not.toContain("locked: Boolean(task.locked)");
    expect(appSource).not.toContain("recordApplied: Boolean(task.recordApplied)");
    expect(appSource).toMatch(/const shouldPersist = options\.persist === true;\s*ensurePlanContainers\(\);\s*const hasPlannedDate = Object\.prototype\.hasOwnProperty\.call\(state\.weekPlans, date\);\s*const existing = planTasksForDate\(date\);\s*if \(hasPlannedDate && !existing\.length && !force\) return taskBuildResult\(\[\], true, options\);/);
    expect(appSource).toMatch(/function renderTasks\(force = false, date = planTodayISO\(\)\) \{[\s\S]*const result = buildDailyTasks\(force, date, \{ persist: force, withSaveResult: true \}\);\s*const tasks = result\.tasks;[\s\S]*return result;\s*\}/);
    expect(appSource).toMatch(/document\.getElementById\("generatePlanBtn"\)\?\.addEventListener\("click", \(\) => \{\s*const result = renderTasks\(true\);\s*setLocalSaveResult\(result\?\.saved !== false, "今日计划已重新生成", "今日任务已保存到本机。", "今日计划未写入本机缓存"\);/);
    expect(appSource).toContain("function taskBuildResult(tasks, saved = true, options = {})");
    expect(appSource).toContain("function previewDailyTasks(date = planTodayISO())");
    expect(appSource).toMatch(/function previewDailyTasks\(date = planTodayISO\(\)\) \{\s*ensurePlanContainers\(\);[\s\S]*weekPlans: clonePlainState\(state\.weekPlans\),[\s\S]*tasks: clonePlainState\(state\.tasks\),[\s\S]*deleted: clonePlainState\(stateObject\(state\.deleted\)\),[\s\S]*deletedMeta: clonePlainState\(stateObject\(state\.deletedMeta\)\)[\s\S]*return buildDailyTasks\(false, date\);[\s\S]*state\.weekPlans = previous\.weekPlans;[\s\S]*state\.tasks = previous\.tasks;[\s\S]*state\.deleted = previous\.deleted;[\s\S]*state\.deletedMeta = previous\.deletedMeta;/);
    expect(appSource).toContain("function clonePlainState(value)");
    expect(appSource).toMatch(/function clonePlainState\(value\) \{\s*return cloneJson\(value\);\s*\}/);
    expect(appSource).toContain("renderFocusBoard(previewDailyTasks())");
    expect(appSource).toMatch(/function renderWorkflowRail\(\) \{[\s\S]*const tasks = previewDailyTasks\(\);/);
    expect(appSource).toMatch(/function renderTargetLane[\s\S]*const tasks = previewDailyTasks\(\);/);
    expect(appSource).not.toContain("renderFocusBoard(buildDailyTasks())");
    expect(appSource).toMatch(/document\.getElementById\("generateWeekBtn"\)\?\.addEventListener\("click", \(\) => \{\s*const saved = generateWeekPlan\(\);\s*renderAll\(\);\s*setLocalSaveResult\(saved, "周计划已生成", "未来 7 天计划已保存；已锁定任务会继续保留。", "周计划未写入本机缓存"\);/);
    expect(appSource).toMatch(/function generateWeekPlan\(\) \{\s*nextSevenDates\(\)\.forEach\(\(date\) => buildDailyTasks\(true, date, \{ persist: false \}\)\);\s*return saveState\(\);\s*\}/);
    expect(appSource).toMatch(/function buildDailyTasks\(force = false, date = planTodayISO\(\), options = \{\}\) \{\s*const shouldPersist = options\.persist === true;\s*ensurePlanContainers\(\);/);
    expect(appSource).toMatch(/const saved = shouldPersist \? saveState\(\) : true;\s*return taskBuildResult/);
    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-regenerate-day\]"\)\.forEach\(\(button\) => \{[\s\S]*const result = buildDailyTasks\(true, button\.dataset\.regenerateDay, \{ persist: true, withSaveResult: true \}\);\s*renderAll\(\);\s*setLocalSaveResult\(result\.saved, "单日已重排", "该日未锁定任务已重排，已锁定任务会继续保留。", "单日重排未写入本机缓存"\);/);
    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-lock-task\]"\)\.forEach\(\(button\) => \{[\s\S]*if \(!task\) \{\s*setAuthResult\("error", "任务不可切换", "这个任务已不存在，请刷新周计划后再试。"\);\s*return;\s*\}[\s\S]*const saved = saveState\(\);\s*renderWeekPlanner\(\);\s*setLocalSaveResult\(saved, task\.locked \? "任务已锁定" : "任务已解锁"/);
    expect(appSource).toMatch(/document\.getElementById\("clearUnlockedWeekBtn"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*const cleared = clearUnlockedWeekTasks\(\);[\s\S]*if \(!cleared\) return;[\s\S]*const saved = saveState\(\);[\s\S]*renderAll\(\);[\s\S]*renderSnapshotPanel\(\);[\s\S]*setLocalSaveResult\(saved, "周任务已清理", `已清理 \$\{cleared\} 项未锁定任务，并保留恢复快照。`, "周任务清理未写入本机缓存"\);/);
    expect(appSource).toMatch(/const clearable = collectUnlockedWeekTasks\(dates\);[\s\S]*setAuthResult\("idle", "无需清理周任务", "未来 7 天没有可清理的未锁定任务。"\);[\s\S]*if \(!window\.confirm\(`确认清理未来 7 天的 \$\{clearable\.length\} 项未锁定任务？已锁定任务会保留。`\)\) \{\s*setAuthResult\("idle", "清理已取消", "周任务未改变。"\);\s*return 0;\s*\}/);
    expect(appSource).toMatch(/createLocalSnapshot\("before-clear-unlocked-week"\);[\s\S]*markDeleted\("tasks", id\);[\s\S]*delete state\.tasks\[id\];/);
    expect(appSource).toMatch(/state\.weekPlans\[date\] = planTasksForDate\(date\)\.filter\(\(task\) => task\.locked\);[\s\S]*return clearable\.length;/);
    expect(appSource).toMatch(/return dates\.flatMap\(\(date\) => planTasksForDate\(date\)\.filter\(\(task\) => !task\.locked\)\);/);
  });

  it("keeps failed reviews out of active queues and guards repeated review actions", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const safeScalarTextSource = appSource.match(/function safeScalarText\(value, fallback = "", maxLength = 2000\) \{[\s\S]*?\n\}/);
    const sanitizeDateKeySource = appSource.match(/function sanitizeDateKey\(value\) \{[\s\S]*?\n\}/);
    const activeReviewSource = appSource.match(/function isActiveReviewItem\(item\) \{[\s\S]*?\n\}/);
    const reviewDueSource = appSource.match(/function isReviewDue\(item, date = planTodayISO\(\)\) \{[\s\S]*?\n\}/);
    const reviewUpcomingSource = appSource.match(/function isReviewUpcoming\(item, date = planTodayISO\(\)\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      function planTodayISO() { return "2026-06-16"; }
      ${safeScalarTextSource?.[0]}
      ${sanitizeDateKeySource?.[0]}
      ${activeReviewSource?.[0]}
      ${reviewDueSource?.[0]}
      ${reviewUpcomingSource?.[0]}
      return { isActiveReviewItem, isReviewDue, isReviewUpcoming };
    `)();

    expect(helpers.isReviewDue({ dueDate: "2026-06-08", done: false, status: "due" }, "2026-06-08")).toBe(true);
    expect(helpers.isReviewDue({ dueDate: "2026-06-08", done: true, status: "failed" }, "2026-06-08")).toBe(false);
    expect(helpers.isReviewDue({ dueDate: "2026-06-08", done: false, status: "failed" }, "2026-06-08")).toBe(false);
    expect(helpers.isReviewUpcoming({ dueDate: "2026-06-16", done: false, status: "delayed" }, "2026-06-08")).toBe(true);
    expect(helpers.isReviewUpcoming({ dueDate: "2026-06-16", done: false, status: "failed" }, "2026-06-08")).toBe(false);
    expect(helpers.isReviewDue({ dueDate: { bad: true }, done: false, status: "due" }, "2026-06-08")).toBe(false);
    expect(helpers.isReviewDue({ dueDate: "2026-02-31", done: false, status: "due" }, "2026-03-10")).toBe(false);
    expect(helpers.isReviewUpcoming({ dueDate: "2026-02-31", done: false, status: "delayed" }, "2026-02-01")).toBe(false);

    expect(appSource).toContain("function stampReviewResult(item, result = \"\")");
    expect(appSource).toMatch(/function dueReviewItems\(date = planTodayISO\(\)\) \{[\s\S]*\.filter\(\(item\) => isReviewDue\(item, date\)\)/);
    expect(appSource).toMatch(/const reviews = reviewRows\(\);\s*const due = reviews\.filter\(\(item\) => isReviewDue\(item, planDate\)\);\s*const upcoming = reviews\.filter\(\(item\) => isReviewUpcoming\(item, planDate\)\)\.slice\(0, 8\);/);
    expect(appSource).toMatch(/if \(!completeReview\(button\.dataset\.reviewDone, 4\)\) \{[\s\S]*setAuthResult\("idle", "无需处理复盘", "这条复盘已处理或不在到期队列。"\);/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderReviewQueue\(\);\s*renderDashboard\(\);\s*setLocalSaveResult\(saved, "复盘已完成", "已从到期队列移除，并记录完成时间。", "复盘完成未写入本机缓存"\);/);
    expect(appSource).toMatch(/if \(!delayReview\(button\.dataset\.reviewDelay, Number\(button\.dataset\.days\) \|\| 1\)\) \{[\s\S]*setAuthResult\("idle", "无需顺延复盘", "这条复盘已处理或不在到期队列。"\);/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderReviewQueue\(\);\s*setLocalSaveResult\(saved, "复盘已顺延", "已更新到期日，后续会重新进入复盘队列。", "复盘顺延未写入本机缓存"\);/);
    expect(appSource).toMatch(/function completeReview\(id, quality = 4\) \{[\s\S]*if \(!isReviewDue\(item\)\) return false;[\s\S]*stampReviewResult\(item, "pass"\)/);
    expect(appSource).toMatch(/function delayReview\(id, days\) \{[\s\S]*if \(!isReviewDue\(item\)\) return false;[\s\S]*stampReviewResult\(item, "delay"\);[\s\S]*return true;/);
    expect(appSource).toMatch(/function renderReviewItem\(item\) \{[\s\S]*const due = isReviewDue\(item\) \? "due" : "";/);
  });

  it("does not mutate review failures when the failure reason is cancelled or blank", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const failureReasonSource = appSource.match(/function isValidReviewFailureReason\(reason\) \{[\s\S]*?\n\}/);
    const isValidReviewFailureReason = new Function(`${failureReasonSource?.[0]}; return isValidReviewFailureReason;`)();

    expect(isValidReviewFailureReason("概念不清")).toBe(true);
    expect(isValidReviewFailureReason("  公式不熟  ")).toBe(true);
    expect(isValidReviewFailureReason("")).toBe(false);
    expect(isValidReviewFailureReason("   ")).toBe(false);

    expect(appSource).toContain("function isValidReviewFailureReason(reason)");
    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-review-fail\]"\)[\s\S]*if \(!failReview\(button\.dataset\.reviewFail\)\) return;[\s\S]*setLocalSaveResult\(saved, "失败已记录", "已安排短复盘，并保留失败原因。", "复盘失败记录未写入本机缓存"\)/);
    expect(appSource).toMatch(/if \(reason === null\) return false;/);
    expect(appSource).toContain('setAuthResult("error", "失败原因无效", "请写明需要回炉的原因。")');
    expect(appSource).toMatch(/if \(!isReviewDue\(item\)\) return false;/);
    expect(appSource).toMatch(/const timestamp = stampReviewResult\(item, "fail"\);[\s\S]*item\.done = true;[\s\S]*item\.failureReason = nextReason;/);
    expect(appSource).toMatch(/item\.status = "failed";[\s\S]*item\.completedAt = timestamp;[\s\S]*item\.failStreak = \(item\.failStreak \|\| 0\) \+ 1;[\s\S]*cloneShortReview\(item, item\.failureReason\);[\s\S]*return true;/);
    expect(appSource).toMatch(/function cloneShortReview\(item, reason\) \{[\s\S]*updatedAt: now/);
  });

  it("normalizes topic mastery evidence before marking topics mastered", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const sanitizeNumberSource = appSource.match(/function sanitizeNumber\(value, min = 0, max = Number\.POSITIVE_INFINITY\) \{[\s\S]*?\n\}/);
    const sanitizeIntegerSource = appSource.match(/function sanitizeInteger\(value, min = 0, max = Number\.POSITIVE_INFINITY\) \{[\s\S]*?\n\}/);
    const evidenceTextSource = appSource.match(/function isValidTopicEvidenceText\(text\) \{[\s\S]*?\n\}/);
    const evidenceMetricsSource = appSource.match(/function parseTopicEvidenceMetrics\(text, existing = \{\}\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      ${sanitizeNumberSource?.[0]}
      ${sanitizeIntegerSource?.[0]}
      ${evidenceTextSource?.[0]}
      ${evidenceMetricsSource?.[0]}
      return { isValidTopicEvidenceText, parseTopicEvidenceMetrics };
    `)();

    expect(helpers.isValidTopicEvidenceText("基础题 25 道")).toBe(true);
    expect(helpers.isValidTopicEvidenceText("   ")).toBe(false);
    expect(helpers.parseTopicEvidenceMetrics("基础题 25 道，正确率 84%")).toEqual({ problems: 25, accuracy: 84 });
    expect(helpers.parseTopicEvidenceMetrics("正确率 120%")).toEqual({ problems: 0, accuracy: 100 });
    expect(helpers.parseTopicEvidenceMetrics("能默写定义", { problems: 8, accuracy: 76 })).toEqual({ problems: 8, accuracy: 76 });

    expect(appSource).toContain("function isValidTopicEvidenceText(text)");
    expect(appSource).toContain("function parseTopicEvidenceMetrics(text, existing = {})");
    expect(appSource).toContain('showToast("掌握证据不能为空，请补充题量、正确率或可交付结果。")');
    expect(appSource).toMatch(/let capturedEvidence = false;[\s\S]*capturedEvidence = captureTopicEvidence\(id\);[\s\S]*if \(next === 1 && capturedEvidence\) showToast/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderSyllabus\(selected\);\s*renderSyllabusMini\(\);\s*renderDashboard\(\);\s*if \(capturedEvidence\) \{\s*setLocalSaveResult\(saved, "掌握证据已记录", "考点已标为掌握，证据已保存。", "掌握证据未写入本机缓存"\);\s*\} else if \(!saved\) \{\s*setLocalSaveResult\(false, "考点状态已保存", "考点状态已写入本机缓存。", "考点状态未写入本机缓存"\);/);
    expect(appSource).toMatch(/if \(text === null\) return false;[\s\S]*const evidenceText = text\.trim\(\);[\s\S]*if \(!isValidTopicEvidenceText\(evidenceText\)\)/);
    expect(appSource).toMatch(/problems: metrics\.problems,[\s\S]*accuracy: metrics\.accuracy,[\s\S]*evidence: evidenceText/);
    expect(appSource).not.toContain('showToast("已记录掌握证据。")');
  });

  it("normalizes resource progress updates to safe slider steps", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const sanitizeNumberSource = appSource.match(/function sanitizeNumber\(value, min = 0, max = Number\.POSITIVE_INFINITY\) \{[\s\S]*?\n\}/);
    const resourceProgressSource = appSource.match(/function normalizeResourceProgressValue\(value\) \{[\s\S]*?\n\}/);
    const normalizeResourceProgressValue = new Function(`
      ${sanitizeNumberSource?.[0]}
      ${resourceProgressSource?.[0]}
      return normalizeResourceProgressValue;
    `)();

    expect(normalizeResourceProgressValue(0)).toBe(0);
    expect(normalizeResourceProgressValue(77)).toBe(75);
    expect(normalizeResourceProgressValue(78)).toBe(80);
    expect(normalizeResourceProgressValue(-10)).toBe(0);
    expect(normalizeResourceProgressValue(112)).toBe(100);
    expect(normalizeResourceProgressValue("abc")).toBe(0);

    expect(appSource).toContain("function normalizeResourceProgressValue(value)");
    expect(appSource).toContain("function updateResourceProgressInput(input)");
    expect(appSource).toMatch(/input\.addEventListener\("input", \(\) => \{\s*updateResourceProgressInput\(input\);\s*\}\);/);
    expect(appSource).toMatch(/input\.addEventListener\("change", \(\) => \{\s*const saved = updateResourceProgressInput\(input\);\s*setLocalSaveResult\(saved, "资料进度已更新", `当前进度：\$\{input\.value\}%。`, "资料进度未写入本机缓存"\);/);
    expect(appSource).toContain("const value = normalizeResourceProgressValue(input.value)");
    expect(appSource).toContain("input.value = String(value)");
    expect(appSource).toContain("ensureAssetContainers()");
    expect(appSource).toContain("state.resources[input.dataset.resourceProgress] = value");
    expect(appSource).toContain("state.settings.resourcesUpdatedAt = updatedAt");
    expect(appSource).toContain('if (label) label.textContent = `${value}%`');
    expect(appSource).toContain("return saveState()");
  });

  it("merges project and resource progress by version timestamps", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const timestampSource = appSource.match(/function timestampMs\(value\) \{[\s\S]*?\n\}/);
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function sanitizeDateKey")
    );
    const settingsMergeSource = appSource.match(/function mergeSettingsByVersionedAssets\(localState = \{\}, cloudState = \{\}\) \{[\s\S]*?\n\}/);
    const versionedObjectSource = appSource.match(/function mergeVersionedObject\(localObject = \{\}, cloudObject = \{\}, localUpdatedAt = "", cloudUpdatedAt = ""\) \{[\s\S]*?\n\}/);
    const helpers = new Function(`
      ${timestampSource?.[0]}
      ${shapeHelperSource}
      ${settingsMergeSource?.[0]}
      ${versionedObjectSource?.[0]}
      return { mergeSettingsByVersionedAssets, mergeVersionedObject };
    `)();

    expect(helpers.mergeVersionedObject(
      { math: 80 },
      { math: 20 },
      "2026-06-16T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z"
    )).toEqual({ math: 80 });
    expect(helpers.mergeVersionedObject(
      { updatedAt: "2026-06-08T00:00:00.000Z", projectA: true },
      { updatedAt: "2026-06-16T00:00:00.000Z", projectA: false }
    )).toEqual({ updatedAt: "2026-06-16T00:00:00.000Z", projectA: false });
    expect(helpers.mergeVersionedObject(
      { math: 20 },
      { updatedAt: "2026-06-16T00:00:00.000Z", math: 90 }
    )).toEqual({ updatedAt: "2026-06-16T00:00:00.000Z", math: 90 });
    expect(helpers.mergeVersionedObject("bad-local", { math: 90 })).toEqual({ math: 90 });
    expect(helpers.mergeSettingsByVersionedAssets("bad-local", { settings: { density: "focus" } })).toEqual({ density: "focus" });
    expect(helpers.mergeSettingsByVersionedAssets(
      { settings: { resourcesUpdatedAt: "2026-06-16T00:00:00.000Z", customTasksUpdatedAt: "2026-06-07T00:00:00.000Z" } },
      { settings: { resourcesUpdatedAt: "2026-06-08T00:00:00.000Z", customTasksUpdatedAt: "2026-06-17T00:00:00.000Z" } }
    )).toMatchObject({
      resourcesUpdatedAt: "2026-06-16T00:00:00.000Z",
      customTasksUpdatedAt: "2026-06-17T00:00:00.000Z"
    });

    expect(appSource).toContain("settings: mergeSettingsByVersionedAssets(localState, cloudState)");
    expect(appSource).toContain("project: mergeVersionedObject(localState.project, cloudState.project)");
    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-project\]"\)\.forEach\(\(checkbox\) => \{[\s\S]*state\.project\.updatedAt = new Date\(\)\.toISOString\(\);\s*const saved = saveState\(\);\s*setLocalSaveResult\(saved, "项目清单已更新", "项目任务状态已保存。", "项目清单未写入本机缓存"\);/);
    expect(appSource).toMatch(/resources: mergeVersionedObject\(\s*localState\.resources,[\s\S]*localState\.settings\?\.resourcesUpdatedAt,[\s\S]*cloudState\.settings\?\.resourcesUpdatedAt\s*\),/);
    expect(appSource).toMatch(/const updatedAt = new Date\(\)\.toISOString\(\);\s*input\.value = String\(value\);[\s\S]*state\.settings\.resourcesUpdatedAt = updatedAt;/);
  });

  it("keeps object values out of merge timestamps and composite ids", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function sanitizeDateKey")
    );
    const safeStateKeySource = appSource.match(/function safeStateKey\(key, maxLength = 160\) \{[\s\S]*?\n\}/);
    const mergeArraySource = appSource.slice(
      appSource.indexOf("function timestampMs"),
      appSource.indexOf("function mergeSettingsByVersionedAssets")
    );
    const helpers = new Function(`
      ${shapeHelperSource}
      ${safeStateKeySource?.[0]}
      ${mergeArraySource}
      return { timestampMs, mergeArrayById };
    `)();

    expect(helpers.timestampMs({ toString: () => "2026-06-18T00:00:00.000Z" })).toBe(0);
    expect(helpers.timestampMs("2026-06-18T00:00:00.000Z")).toBeGreaterThan(0);
    expect(helpers.mergeArrayById(
      [{ id: "same", updatedAt: "2026-06-17T00:00:00.000Z", source: "local" }],
      [{ id: "same", updatedAt: { toString: () => "2026-06-18T00:00:00.000Z" }, source: "cloud" }]
    )).toEqual([{ id: "same", updatedAt: "2026-06-17T00:00:00.000Z", source: "local" }]);
    expect(helpers.mergeArrayById(
      [{ date: { toString: () => "2026-06-16" }, name: { toString: () => "mock" }, updatedAt: "2026-06-19T00:00:00.000Z" }],
      [{ date: "2026-06-16", name: "mock", updatedAt: "2026-06-17T00:00:00.000Z" }]
    )).toEqual([{ date: "2026-06-16", name: "mock", updatedAt: "2026-06-17T00:00:00.000Z" }]);
  });

  it("merges syllabus topic progress by per-topic evidence timestamps", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const syncSource = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const timestampSource = appSource.match(/function timestampMs\(value\) \{[\s\S]*?\n\}/);
    const shapeHelperSource = appSource.slice(
      appSource.indexOf("function isPlainStateObject"),
      appSource.indexOf("function sanitizeDateKey")
    );
    const mergeTopicSource = appSource.slice(
      appSource.indexOf("function mergeTopicState"),
      appSource.indexOf("function mergeVersionedObject")
    );
    const mergeTopicState = new Function(`${timestampSource?.[0]}; ${shapeHelperSource}; ${mergeTopicSource}; return mergeTopicState;`)();

    const localState = {
      topics: { localFresh: 2, cloudFresh: 1, legacy: 1 },
      topicEvidence: {
        localFresh: { evidence: "local", updatedAt: "2026-06-18T00:00:00.000Z" },
        legacy: { evidence: "keep legacy local evidence" }
      }
    };
    const cloudState = {
      topics: { localFresh: 1, cloudFresh: 2, cloudOnly: 1, legacy: 2 },
      topicEvidence: {
        localFresh: { evidence: "old cloud", updatedAt: "2026-06-17T00:00:00.000Z" },
        cloudFresh: { evidence: "cloud", updatedAt: "2026-06-19T00:00:00.000Z" },
        cloudOnly: { evidence: "cloud only", updatedAt: "2026-06-19T00:00:00.000Z" }
      }
    };

    expect(mergeTopicState(localState, cloudState, true)).toEqual({
      topics: { localFresh: 2, cloudFresh: 2, cloudOnly: 1, legacy: 2 },
      topicEvidence: {
        localFresh: { evidence: "local", updatedAt: "2026-06-18T00:00:00.000Z" },
        cloudFresh: { evidence: "cloud", updatedAt: "2026-06-19T00:00:00.000Z" },
        cloudOnly: { evidence: "cloud only", updatedAt: "2026-06-19T00:00:00.000Z" },
        legacy: { evidence: "keep legacy local evidence" }
      }
    });
    expect(mergeTopicState(localState, cloudState, false)).toEqual({
      topics: localState.topics,
      topicEvidence: localState.topicEvidence
    });
    expect(mergeTopicState({ topics: "bad", topicEvidence: { keep: { updatedAt: "2026-06-16T00:00:00.000Z" }, bad: "row" } }, "bad-cloud", true)).toEqual({
      topics: {},
      topicEvidence: { keep: { updatedAt: "2026-06-16T00:00:00.000Z" } }
    });

    expect(appSource).toContain("const mergedTopics = mergeTopicState(localState, cloudState, cloudCleanStarted)");
    expect(appSource).toContain('updatedAt: firstTextValue([row.updatedAt, row.updated_at], "", 80)');
    expect(appSource).toContain("state.topicEvidence[id] = { ...topicEvidenceRow(id), updatedAt }");
    expect(appSource).toMatch(/state\.topicEvidence\[id\] = \{[\s\S]*lastReviewAt: updatedAt,[\s\S]*updatedAt/);
    expect(syncSource).toContain("updatedAt: asTimestamp(row.updated_at, \"\")");
  });
});

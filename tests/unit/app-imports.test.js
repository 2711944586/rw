/**
 * Source-text wiring contracts for `src/app.js`.
 *
 * ⚠️ Read this before adding to the file.
 *
 * Every assertion here reads `app.js` with `fs.readFileSync` and matches the
 * source with a regex or `toContain`. That makes this file a **change
 * detector**, not a regression detector: it fails on any edit to the matched
 * text — including harmless ones such as extracting a helper — while proving
 * nothing about what the page does at runtime.
 *
 * It is the wrong place for anything that can be asserted behaviourally. Before
 * adding a case here, put it in one of these instead:
 *
 *   - `tests/integration/app-integration.test.js` — mounts the real `index.html`, runs
 *     the real `bootstrapApp()` and drives the page. Use this for DOM wiring,
 *     form validation, routing, dialogs and export flows.
 *   - `tests/unit/state-rules.test.js`     — the exported pure state layer.
 *   - `tests/unit/state-merge.test.js`     — the cloud-merge layer.
 *
 * `docs/history/AUDIT_2026-09-22.md` §4 tracks the conversion of the remaining cases.
 * Backup import confirmation, logged-out sync feedback, and locked week-task
 * regeneration now have behavioural coverage in `app-integration.test.js`.
 * Keep converting these source contracts as the relevant flows are covered.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("app imports", () => {
  it("does not shadow the built-in Map constructor with the lucide icon", () => {
    const source = fs.readFileSync(new URL("../../src/ui/icon-registry.js", import.meta.url), "utf8");

    expect(source).toContain("Map as MapIcon");
    expect(source).not.toMatch(/\bMap,\s*\n\s*RefreshCw/);
  });

  it("clears persisted account state when auth no longer has a session", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const signOutBindings = source.match(/document\.getElementById\("signOutBtn"\)\?\.addEventListener\("click", signOutAction\)/g) || [];

    expect(source).toMatch(/function clearLocalSessionState\(lastError = "not-authenticated"\) \{\s*currentUser = null;\s*state\.user = null;\s*state\.sync = \{\s*status: "local",\s*lastSyncAt: "",\s*lastError,\s*pending: false,\s*localImportPending: false,\s*cloudPaused: false\s*\};\s*legacyImportPending = false;\s*const saved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return saved;\s*\}/);
    const signOutSource = source.match(/async function signOutAction\(\) \{[\s\S]*?\n\}/)?.[0] || "";
    expect(signOutSource).not.toBe("");
    expect(signOutSource).toContain("authRequestInFlight = true");
    expect(signOutSource).toContain("await signOut()");
    expect(signOutSource).toContain('clearLocalSessionState("")');
    expect(signOutSource).toContain("renderAll()");
    expect(signOutSource).toMatch(/setLocalSaveResult\(saved, "已退出账号", "当前数据已保留在本机。", "退出状态未写入本机缓存"\);/);
    expect(signOutSource).toMatch(/catch \(error\) \{\s*setAuthResult\("error", "退出失败", friendlyAuthError\(error\)\);/);
    expect(signOutSource).toMatch(/finally \{\s*authRequestInFlight = false;\s*setAuthBusy\(false\);\s*renderAuthPanel\(\);/);
    expect(source).toContain('if (mode === "signup" && result?.needsEmailConfirmation) {');
    expect(source).toContain('clearLocalSessionState("email-confirmation-required")');
    expect(source).toContain('clearLocalSessionState(result?.needsEmailConfirmation ? "email-confirmation-required" : "not-authenticated")');
    expect(signOutBindings.length).toBe(2);
  });

  it("clears stale account display when cloud session initialization fails", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toMatch(/async function initCloudSession\(\) \{[\s\S]*\} catch \(error\) \{\s*currentUser = null;\s*state\.user = null;\s*const message = friendlyAuthError\(error\);\s*lastAuthResult = \{\s*status: "error",\s*title: "云端会话不可用",\s*message\s*\};\s*state\.sync = \{ \.\.\.state\.sync, status: "error", lastError: safeErrorMessage\(error, "云端会话不可用"\), pending: false \};\s*const saved = saveState\(\{ skipCloud: true \}\);\s*if \(!saved\) \{\s*lastAuthResult = \{\s*status: "error",\s*title: "云端会话状态未写入本机缓存",\s*message: `\$\{message\} 浏览器阻止写入本机缓存；请立即导出备份，刷新前不要关闭页面。`\s*\};\s*\}\s*renderAuthPanel\(\);\s*\}\s*renderSyncStatus\(\);/);
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
    const configSource = fs.readFileSync(new URL("../../src/config/app-config.js", import.meta.url), "utf8");

    expect(configSource).toContain("export const STORAGE_FAILURE_NOTICE_INTERVAL_MS = 30_000");
    expect(source).toContain("let lastStorageFailureNoticeAt = 0");
    expect(source).toMatch(/function saveState\(options = \{\}\) \{[\s\S]*const payload = JSON\.stringify\(state\);\s*const saved = writeStorage\(STORAGE_KEY, payload\);\s*void persistRecoveryCopy\(payload\);\s*if \(!saved\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "local", lastError: "local-storage-unavailable", pending: false \};\s*notifyStorageWriteFailure\(\);\s*\}[\s\S]*return saved;\s*\}/);
    expect(source).toMatch(/function notifyStorageWriteFailure\(\) \{\s*const now = Date\.now\(\);\s*if \(now - lastStorageFailureNoticeAt < STORAGE_FAILURE_NOTICE_INTERVAL_MS\) return;\s*lastStorageFailureNoticeAt = now;\s*setAuthResult\("error", "本机缓存不可用", "浏览器阻止写入本机缓存，请先导出备份；刷新后本次更改可能不会保留。"\);\s*renderStorageStatus\(\);\s*renderAuthPanel\(\);\s*\}/);
    expect(source).toMatch(/function setLocalSaveResult\(saved, successTitle, successMessage, failureTitle\) \{\s*setAuthResult\(saved \? "success" : "error", saved \? successTitle : failureTitle, saved[\s\S]*浏览器阻止写入本机缓存；本次更改只保留在当前页面。请立即导出备份，刷新前不要关闭页面。/);
    expect(source).toContain("function renderStorageHealthText()");
    expect(source).toMatch(/function renderStorageStatus\(\) \{[\s\S]*renderStorageHealthText\(\);[\s\S]*const container = document\.getElementById\("storageStatus"\);/);
    expect(source).toMatch(/function renderStorageHealthText\(\) \{\s*setText\("storageHealthText", browserStorage\.available \? "本机缓存正常" : "本机缓存不可用，建议检查浏览器隐私\/存储权限"\);\s*\}/);
  });

  it("honors paused cloud sync before pulling or pushing remote state", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const displayStatusSource = appSource.match(/function syncDisplayStatus\(sync = state\.sync\) \{[\s\S]*?\n\}/)?.[0];
    const { syncDisplayStatus } = new Function(`${displayStatusSource}; return { syncDisplayStatus };`)();

    expect(html).toContain('id="migrationText"');
    expect(appSource).toMatch(/async function handleCloudAuthChange\(user\) \{\s*currentUser = user;\s*state\.user = user \? \{ id: user\.id, email: user\.email \|\| "" \} : null;\s*let localSaved;\s*if \(user\) \{\s*const pullResult = await pullCloudState\(\);\s*localSaved = pullResult\?\.localSaved !== false;\s*\} else \{\s*state\.sync = \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : "local",\s*pending: false,\s*lastError: "not-authenticated"[\s\S]*localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*renderSyncStatus\(\);\s*renderAll\(\);\s*renderAuthPanel\(\);\s*if \(!localSaved\) \{\s*setLocalSaveResult\(false, "账号会话状态已保存", "账号会话状态已写入本机缓存。", "账号会话状态未写入本机缓存"\);/);
    const bindListenerSource = appSource.match(/function bindCloudAuthListener\(\) \{[\s\S]*?\n\}/)?.[0] || "";
    expect(bindListenerSource).toContain("stopCloudAuthListener = onAuthChange(");
    expect(bindListenerSource).toContain("handleCloudAuthChange(user)");
    // Reentrancy guard: the subscription must not start a second merge while a
    // login/logout request is still settling, or the visible state can be
    // overwritten by an older response.
    expect(bindListenerSource).toContain("if (authRequestInFlight) return;");
    expect(appSource).toMatch(/async function pullCloudState\(\) \{[\s\S]*if \(state\.sync\?\.cloudPaused\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "cloud-paused", localSaved \};\s*\}[\s\S]*if \(state\.sync\?\.localImportPending\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "local-import-pending", localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{\s*if \(!currentUser \|\| !supabaseConfigured\) \{\s*const reason = currentUser && !supabaseConfigured \? "unconfigured" : "not-authenticated";\s*if \(!currentUser\) state\.user = null;\s*state\.sync = \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : \(currentUser \? "unconfigured" : "local"\),\s*pending: false,\s*lastError: reason[\s\S]*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason, localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{[\s\S]*const cloudState = await loadCloudState\(state\);\s*if \(!cloudState\) \{\s*currentUser = null;\s*state\.user = null;\s*state\.sync = \{ \.\.\.state\.sync, status: "local", pending: false, lastError: "not-authenticated" \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "not-authenticated", localSaved \};\s*\}\s*if \(cloudState\) \{\s*state = migrateState\(mergeStateByUpdatedAt\(state, cloudState\)\);\s*state\.sync = \{\s*status: "synced",\s*lastSyncAt: new Date\(\)\.toISOString\(\),\s*lastError: "",\s*pending: false,\s*localImportPending: false,\s*cloudPaused: false\s*\};\s*legacyImportPending = false;\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*return \{ ok: true, pulled: true, localSaved \};\s*\}\s*return \{ ok: true, pulled: true, localSaved: true \};/);
    expect(appSource).toMatch(/async function pullCloudState\(\) \{[\s\S]*\} catch \(error\) \{\s*const message = safeErrorMessage\(error, "拉取云端失败"\);\s*state\.sync = \{ \.\.\.state\.sync, status: conflictSyncStatus\(message\), lastError: message, pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "pull-failed", error: message, localSaved \};\s*\}/);
    expect(appSource).toMatch(/function queueCloudSync\(\) \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : \(currentUser \? "unconfigured" : "local"\),[\s\S]*if \(state\.sync\?\.localImportPending\)[\s\S]*if \(state\.sync\?\.cloudPaused\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};/);
    expect(appSource).toMatch(/function queueCloudSync\(\) \{[\s\S]*if \(!currentUser \|\| !supabaseConfigured\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*if \(state\.sync\?\.localImportPending\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*if \(state\.sync\?\.cloudPaused\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*if \(navigator && navigator\.onLine === false\) \{[\s\S]*saveState\(\{ skipCloud: true \}\);\s*return;[\s\S]*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*saveState\(\{ skipCloud: true \}\);\s*window\.clearTimeout\(syncTimer\);/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{\s*if \(!currentUser \|\| !supabaseConfigured\) \{\s*const reason = currentUser && !supabaseConfigured \? "unconfigured" : "not-authenticated";\s*if \(!currentUser\) state\.user = null;\s*state\.sync = \{[\s\S]*status: state\.sync\?\.cloudPaused \? "paused" : \(currentUser \? "unconfigured" : "local"\),\s*pending: false,\s*lastError: reason[\s\S]*const localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*renderAuthPanel\(\);[\s\S]*return \{ ok: false, reason, localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{[\s\S]*if \(state\.sync\?\.localImportPending && !options\.force\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "pending", pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*showToast\("检测到旧版本地数据。请在账号面板选择导入云端或保留本机。"\);\s*return \{ ok: false, reason: "local-import-pending", localSaved \};\s*\}/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{[\s\S]*if \(state\.sync\?\.cloudPaused && !options\.force\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "paused", pending: false \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*return \{ ok: false, reason: "cloud-paused", localSaved \};/);
    expect(appSource).toMatch(/async function syncNow\(options = \{\}\) \{[\s\S]*if \(navigator && navigator\.onLine === false\) \{\s*state\.sync = \{ \.\.\.state\.sync, status: "offline", pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderAuthPanel\(\);\s*return \{ ok: false, reason: "offline", localSaved \};\s*\}/);
    expect(appSource).toContain("const result = await saveCloudState(state, {");
    expect(appSource).toContain("expectedUserId: currentUser?.id || \"\"");
    expect(appSource).toMatch(/if \(result\?\.skipped\) \{\s*const reason = result\.reason \|\| "sync-skipped";[\s\S]*if \(reason === "not-authenticated"\) \{\s*currentUser = null;\s*state\.user = null;\s*\}[\s\S]*status: reason === "cloud-paused" \? "paused" : \(reason === "local-import-pending" \? "pending" : "local"\),\s*pending: reason === "local-import-pending",[\s\S]*const localSaved = saveState\(\{ skipCloud: true \}\);[\s\S]*return \{ ok: false, reason, localSaved \};\s*\}/);
    expect(appSource).toMatch(/state\.sync = \{\s*status: "synced",\s*lastSyncAt: result\?\.syncedAt \|\| new Date\(\)\.toISOString\(\),\s*lastError: "",\s*pending: false,\s*localImportPending: false,\s*cloudPaused: false\s*\};\s*legacyImportPending = false;\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*renderSyncStatus\(\);\s*renderAuthPanel\(\);\s*return \{ ok: true, syncedAt: state\.sync\.lastSyncAt, localSaved \};/);
    expect(appSource).toMatch(/\} catch \(error\) \{\s*const message = safeErrorMessage\(error, "同步失败"\);\s*state\.sync = \{ \.\.\.state\.sync, status: conflictSyncStatus\(message\), lastError: message, pending: true \};\s*const localSaved = saveState\(\{ skipCloud: true \}\);\s*const syncError = friendlySyncError\(message\);\s*setAuthResult\("error", localSaved \? "同步失败" : "同步状态未写入本机缓存", localSaved[\s\S]*return \{ ok: false, reason: "sync-error", error: message, localSaved \};\s*\}/);
    expect(syncSource).toMatch(/export function saveCloudState\(state, options = \{\}\) \{\s*const operation = cloudSaveQueue\.then\(\(\) => performCloudSave\(state, options\)\);\s*cloudSaveQueue = operation\.catch\(\(\) => undefined\);\s*return operation;\s*\}/);
    expect(syncSource).toMatch(/async function performCloudSave\(state, options = \{\}\) \{\s*if \(asBoolean\(state\?\.sync\?\.cloudPaused\) && !options\.force\) return \{ skipped: true, reason: "cloud-paused" \};\s*if \(asBoolean\(state\?\.sync\?\.localImportPending\) && !options\.force\) return \{ skipped: true, reason: "local-import-pending" \};\s*const user = await getCurrentUser\(\);\s*if \(!supabase \|\| !user\) return \{ skipped: true, reason: "not-authenticated" \};\s*if \(options\.expectedUserId && options\.expectedUserId !== user\.id\) \{\s*return \{ skipped: true, reason: "auth-changed" \};\s*\}/);
    expect(appSource).toContain('function conflictSyncStatus(message)');
    expect(syncDisplayStatus({ cloudPaused: true, status: "paused" })).toBe("paused");
    expect(syncDisplayStatus({ cloudPaused: true, status: "syncing" })).toBe("syncing");
    expect(syncDisplayStatus({ cloudPaused: true, status: "error" })).toBe("error");
    expect(appSource).toContain("const presented = presentSyncStatus(state.sync");
    expect(appSource).toContain('if (pill) pill.dataset.status = presented.key || status || "local"');
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

  it("gives explicit feedback for custom task and import form failures", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../src/styles/base.css", import.meta.url), "utf8");
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

  it("protects current account identity and sync consent when importing legacy backups", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const helperSource = appSource.slice(
      appSource.indexOf("function currentSessionUser"),
      appSource.indexOf("function isPlainImportRecord")
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

  it("keeps local and cloud snapshot payloads complete without recursive snapshots", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
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

  it("normalizes cloud snapshots into the local restore shape", () => {
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
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
    const css = fs.readFileSync(new URL("../../src/styles/base.css", import.meta.url), "utf8");
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

  it("validates settings numeric ranges before saving settings", () => {
    const appSource = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const css = fs.readFileSync(new URL("../../src/styles/base.css", import.meta.url), "utf8");
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
    const css = fs.readFileSync(new URL("../../src/styles/base.css", import.meta.url), "utf8");
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
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
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
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
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
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");

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

  it("uses original tombstone timestamps when pushing cloud deletes", () => {
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
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
    const syncSource = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
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
    expect(appSource).toMatch(/task\.recordApplied = true;\s*task\.recordImpact = applied\.impact;/);
    expect(appSource).toMatch(/if \(task\.recordApplied\) \{\s*revertTaskFromEntry\(task\);\s*task\.recordApplied = false;\s*task\.recordImpact = null;/);
    expect(appSource).toMatch(/setLocalSaveResult\(false, "任务状态已保存", "任务状态已写入本机缓存。", "任务完成状态未写入本机缓存"\);/);
    expect(appSource).toContain("function commitTaskCompletion(task, evidence)");
    expect(appSource).toContain("validateCompletionEvidence");
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
    expect(appSource).toMatch(/document\.getElementById\("generatePlanBtn"\)\?\.addEventListener\("click", \(\) => \{\s*const result = regenerateTodayPlan\(\);\s*if \(!result\) return;\s*setLocalSaveResult\(result\?\.saved !== false, "今日计划已重新生成", result\.message, "今日计划未写入本机缓存"\);/);
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
    expect(appSource).toMatch(/document\.querySelectorAll\("\[data-review-fail\]"\)[\s\S]*if \(!failReview\(button\.dataset\.reviewFail, reason\)\) return;[\s\S]*setLocalSaveResult\(saved, "失败已记录", "已安排短复盘，并保留失败原因。", "复盘失败记录未写入本机缓存"\)/);
    expect(appSource).toContain("function gradeReview(id, grade, reason = \"\")");
    expect(appSource).toContain('setAuthResult("error", "失败原因无效", "请写明需要回炉的原因。")');
    expect(appSource).toMatch(/if \(!isReviewDue\(item\)\) return false;/);
    expect(appSource).toMatch(/const timestamp = stampReviewResult\(item, effect\.passed \? "pass" : "fail"\);[\s\S]*item\.failureReason = String\(reason \|\| item\.failureReason \|\| "需要回炉"\)\.trim\(\);/);
    expect(appSource).toMatch(/item\.status = "failed";[\s\S]*item\.leech = effect\.leech;[\s\S]*cloneShortReview\(item, item\.failureReason\);[\s\S]*return true;/);
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
    expect(appSource).toMatch(/if \(next === 2 && !hasTopicEvidence\(id\)\) \{\s*openTopicEvidenceForm\(id\);\s*showToast\("补充题量、正确率或可交付结果后再标已掌握。"\);\s*return;\s*\}/);
    expect(appSource).toMatch(/const capturedEvidence = captureTopicEvidence\(id, new FormData\(form\)\.get\("evidence"\)\);[\s\S]*setLocalSaveResult\(saved, "掌握证据已记录", "考点已标为掌握，证据已保存。", "掌握证据未写入本机缓存"\);/);
    expect(appSource).toMatch(/const saved = saveState\(\);\s*renderSyllabus\(selected\);\s*renderSyllabusMini\(\);\s*renderDashboard\(\);\s*if \(!saved\) \{\s*setLocalSaveResult\(false, "考点状态已保存", "考点状态已写入本机缓存。", "考点状态未写入本机缓存"\);/);
    expect(appSource).toMatch(/if \(text === null \|\| text === undefined\) return false;[\s\S]*const evidenceText = String\(text\)\.trim\(\);[\s\S]*if \(!isValidTopicEvidenceText\(evidenceText\)\)/);
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

});

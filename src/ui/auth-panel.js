const BUSY_CONTROL_IDS = Object.freeze([
  "signInBtn",
  "signUpBtn",
  "signOutBtn",
  "syncDialogBtn",
  "syncNowBtn",
  "downloadBackupBtn",
  "pushLocalBtn",
  "keepLocalBtn"
]);

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

export function bindPasswordVisibility(hydrateIcons) {
  const toggle = document.getElementById("authPasswordToggle");
  if (!toggle || toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  toggle.addEventListener("click", () => {
    const input = document.getElementById("authPassword");
    if (!input) return;
    const wasVisible = input.type === "text";
    input.type = wasVisible ? "password" : "text";
    const label = wasVisible ? "显示密码" : "隐藏密码";
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
    toggle.innerHTML = `<i data-lucide="${wasVisible ? "eye" : "eye-off"}" aria-hidden="true"></i>`;
    hydrateIcons?.(toggle);
  });
}

export function renderAuthPanelState({
  user,
  configured,
  storageAvailable,
  syncLabel,
  build
}) {
  const accountLabel = user?.email || "未登录";
  const configuredLabel = configured ? "云端已配置" : "未配置 Supabase 环境变量";
  const storageLabel = storageAvailable ? "本机缓存正常" : "本机缓存不可用";
  const userLabel = user ? `当前账号：${accountLabel}` : "未登录时也可先在本机记录。";

  setText("authHint", `${configuredLabel} · ${storageLabel}。${userLabel}`);
  setText("authBuildText", `版本 ${build}`);
  setText("authAccountText", accountLabel);
  setText("authSyncText", syncLabel);
  setText("authHelp", user
    ? "当前账号已连接。手动同步会先拉取云端更新，再合并本机记录。"
    : "首次使用请注册账号。如果邮箱确认已开启，请先打开确认邮件，再回到这里登录。");

  const credentials = document.getElementById("authCredentials");
  const signedOutActions = document.getElementById("authSignedOutActions");
  const signedInActions = document.getElementById("authSignedInActions");
  if (credentials) credentials.hidden = Boolean(user);
  if (signedOutActions) signedOutActions.hidden = Boolean(user);
  if (signedInActions) signedInActions.hidden = !user;
}

export function focusAuthPanel(user) {
  document.getElementById(user ? "syncDialogBtn" : "authEmail")?.focus();
}

export function setAuthPanelBusy(isBusy) {
  BUSY_CONTROL_IDS.forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });
  document.getElementById("authForm")?.setAttribute("aria-busy", String(isBusy));
  document.getElementById("migrationBox")?.setAttribute("aria-busy", String(isBusy));
}

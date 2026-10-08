const BUSY_CONTROL_IDS = Object.freeze([
  "signInBtn",
  "signUpBtn",
  "resetPasswordBtn",
  "updatePasswordBtn",
  "cancelPasswordRecoveryBtn",
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
  passwordRecoveryPending = false,
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
    ? passwordRecoveryPending
      ? "为当前账号设置一个新密码。完成后此恢复链接即失效。"
      : "当前账号已连接。手动同步会先拉取云端更新，再合并本机记录。"
    : "首次使用请注册账号。如果邮箱确认已开启，请先打开确认邮件，再回到这里登录。");

  const credentials = document.getElementById("authCredentials");
  const signedOutActions = document.getElementById("authSignedOutActions");
  const signedInActions = document.getElementById("authSignedInActions");
  const recoveryActions = document.getElementById("authRecoveryActions");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  if (credentials) credentials.hidden = Boolean(user) && !passwordRecoveryPending;
  if (signedOutActions) signedOutActions.hidden = Boolean(user) || passwordRecoveryPending;
  if (signedInActions) signedInActions.hidden = !user || passwordRecoveryPending;
  if (recoveryActions) recoveryActions.hidden = !passwordRecoveryPending;
  if (emailInput) {
    emailInput.readOnly = passwordRecoveryPending;
    if (passwordRecoveryPending && user?.email) emailInput.value = user.email;
  }
  if (passwordInput) {
    passwordInput.autocomplete = passwordRecoveryPending ? "new-password" : "current-password";
    passwordInput.setAttribute("aria-label", passwordRecoveryPending ? "新密码" : "密码");
  }
  setText("authPasswordLabel", passwordRecoveryPending ? "新密码" : "密码");
}

export function focusAuthPanel(user, passwordRecoveryPending = false) {
  document.getElementById(passwordRecoveryPending ? "authPassword" : user ? "syncDialogBtn" : "authEmail")?.focus();
}

export function setAuthPanelBusy(isBusy) {
  BUSY_CONTROL_IDS.forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });
  document.getElementById("authForm")?.setAttribute("aria-busy", String(isBusy));
  document.getElementById("migrationBox")?.setAttribute("aria-busy", String(isBusy));
}

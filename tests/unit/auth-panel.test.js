/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAuthPanelState } from "../../src/ui/auth-panel.js";

function mountAuthPanel() {
  document.body.innerHTML = `
    <span id="authHint"></span>
    <span id="authBuildText"></span>
    <span id="authAccountText"></span>
    <span id="authSyncText"></span>
    <span id="authHelp"></span>
    <div id="authCredentials">
      <input id="authEmail">
      <span id="authPasswordLabel"></span>
      <input id="authPassword">
    </div>
    <div id="authSignedOutActions"></div>
    <div id="authSignedInActions"></div>
    <div id="authRecoveryActions"></div>
  `;
}

describe("auth panel state", () => {
  beforeEach(mountAuthPanel);
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows recovery fields for the authenticated account without exposing sync actions", () => {
    renderAuthPanelState({
      user: { email: "student@example.test" },
      passwordRecoveryPending: true,
      configured: true,
      storageAvailable: true,
      syncLabel: "已同步",
      build: "test"
    });

    expect(document.getElementById("authCredentials").hidden).toBe(false);
    expect(document.getElementById("authSignedOutActions").hidden).toBe(true);
    expect(document.getElementById("authSignedInActions").hidden).toBe(true);
    expect(document.getElementById("authRecoveryActions").hidden).toBe(false);
    expect(document.getElementById("authEmail")).toMatchObject({ value: "student@example.test", readOnly: true });
    expect(document.getElementById("authPassword")).toMatchObject({ autocomplete: "new-password" });
    expect(document.getElementById("authPasswordLabel").textContent).toBe("新密码");
  });

  it("returns to the normal signed-in panel after recovery ends", () => {
    renderAuthPanelState({
      user: { email: "student@example.test" },
      configured: true,
      storageAvailable: true,
      syncLabel: "已同步",
      build: "test"
    });

    expect(document.getElementById("authCredentials").hidden).toBe(true);
    expect(document.getElementById("authSignedInActions").hidden).toBe(false);
    expect(document.getElementById("authRecoveryActions").hidden).toBe(true);
    expect(document.getElementById("authEmail").readOnly).toBe(false);
  });
});

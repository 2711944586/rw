import { chromium } from "playwright";

const url = process.argv[2] || process.env.PRODUCTION_URL || process.env.DEPLOYMENT_URL;

if (!url) {
  console.error("Usage: node scripts/verify-production.mjs https://your-deployment.vercel.app");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const messages = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    messages.push({ type: message.type(), text: message.text() });
  }
});

page.on("pageerror", (error) => {
  messages.push({ type: "pageerror", text: error.message });
});

try {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const status = response?.status() || 0;
  if (status < 200 || status >= 400) {
    throw new Error(`Unexpected HTTP status ${status}`);
  }

  const result = await page.evaluate(() => {
    const title = document.title;
    const activeView = document.querySelector(".view.active")?.id || "";
    const heading = document.querySelector("main h2")?.textContent?.trim() || "";
    const authButton = Boolean(document.querySelector("#authOpenBtn"));
    const syncButton = Boolean(document.querySelector("#syncNowBtn"));
    const debug = window.__rwDebug?.health?.() || null;
    const overflow = document.documentElement.scrollWidth > window.innerWidth;
    const topbarHeight = Math.round(document.querySelector(".topbar")?.getBoundingClientRect().height || 0);
    const clippedCount = [...document.querySelectorAll("main *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width &&
        rect.height &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.scrollWidth > element.clientWidth + 2 &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
    }).length;
    return { title, activeView, heading, authButton, syncButton, debug, overflow, topbarHeight, clippedCount };
  });

  if (!result.title.includes("软微 420")) {
    throw new Error(`Unexpected page title: ${result.title}`);
  }
  if (result.activeView !== "dashboard") {
    throw new Error(`Dashboard is not active: ${result.activeView}`);
  }
  if (!result.authButton || !result.syncButton) {
    throw new Error("Top action buttons are missing.");
  }
  const views = ["today", "week", "foundation", "syllabus", "records", "review", "scores", "resources", "settings"];
  for (const view of views) {
    await page.locator(`.nav-item[data-view="${view}"]`).click({ timeout: 10000 });
    await page.waitForTimeout(60);
    const active = await page.evaluate(() => document.querySelector(".view.active")?.id || "");
    if (active !== view) {
      throw new Error(`Navigation failed for ${view}; active=${active}`);
    }
  }
  await page.locator("#authOpenBtn").click({ timeout: 10000 });
  await page.waitForTimeout(80);
  const authState = await page.evaluate(() => ({
    open: Boolean(document.getElementById("authDialog")?.open),
    signup: document.getElementById("signUpBtn")?.textContent?.trim() || "",
    hint: document.getElementById("authHint")?.textContent?.trim() || ""
  }));
  if (!authState.open || !authState.signup.includes("注册")) {
    throw new Error(`Auth dialog did not open correctly: ${JSON.stringify(authState)}`);
  }
  if (result.overflow) {
    throw new Error("Mobile viewport has horizontal overflow.");
  }
  if (result.clippedCount > 0) {
    throw new Error(`Mobile viewport has ${result.clippedCount} clipped text elements.`);
  }
  if (messages.length > 0) {
    throw new Error(`Console warnings/errors found: ${JSON.stringify(messages)}`);
  }

  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await fallbackContext.route("**/*.js", (route) => route.abort());
    const fallbackPage = await fallbackContext.newPage();
    await fallbackPage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await fallbackPage.locator('.nav-item[data-view="resources"]').click({ timeout: 10000 });
    await fallbackPage.waitForTimeout(80);
    const fallbackResult = await fallbackPage.evaluate(() => ({
      activeView: document.querySelector(".view.active")?.id || "",
      shell: window.__rwShell?.health?.() || null
    }));
    if (fallbackResult.activeView !== "resources" || fallbackResult.shell?.activeView !== "resources") {
      throw new Error(`Shell fallback navigation failed: ${JSON.stringify(fallbackResult)}`);
    }
    await fallbackPage.locator("#authOpenBtn").click({ timeout: 10000 });
    const fallbackAuthOpen = await fallbackPage.evaluate(() => Boolean(document.getElementById("authDialog")?.open));
    if (!fallbackAuthOpen) {
      throw new Error("Shell fallback auth dialog did not open.");
    }
  } finally {
    await fallbackContext.close();
  }

  console.log(JSON.stringify({ ok: true, url, status, result }, null, 2));
} finally {
  await browser.close();
}

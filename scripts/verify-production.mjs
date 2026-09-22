/**
 * Post-deploy verification against a real URL.
 *
 * Run after `npm run deploy:all` / `deploy:prod`:
 *   node scripts/verify-production.mjs https://your-deployment.vercel.app
 *
 * Beyond the page/route smoke checks this also asserts the two things that can
 * only break *after* deployment and are invisible to every local gate:
 *
 *   1. the security response headers declared in `vercel.json` actually arrive,
 *      with the values the repo expects, and
 *   2. the served page produces zero CSP violations — a strict `style-src`
 *      refuses inline `style` attributes, which silently flattens every
 *      progress bar and ring while the dev-server gates stay green.
 */
import fs from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || process.env.PRODUCTION_URL || process.env.DEPLOYMENT_URL;

if (!url) {
  console.error("Usage: node scripts/verify-production.mjs https://your-deployment.vercel.app");
  process.exit(1);
}

const vercelConfig = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const wildcardBlock = vercelConfig.headers.find((entry) => entry.source === "/(.*)");
const expectedHeaders = Object.fromEntries(
  (wildcardBlock?.headers || []).map((header) => [header.key.toLowerCase(), header.value])
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const messages = [];

await page.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__cspViolations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI });
  });
});

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

  const deliveredHeaders = response?.headers() || {};
  const missingHeaders = [];
  const mismatchedHeaders = [];
  for (const [key, expected] of Object.entries(expectedHeaders)) {
    const actual = deliveredHeaders[key];
    if (actual === undefined) missingHeaders.push(key);
    else if (actual !== expected) mismatchedHeaders.push(`${key}: expected "${expected}", got "${actual}"`);
  }
  if (missingHeaders.length > 0) {
    throw new Error(`Security headers missing from the deployment: ${missingHeaders.join(", ")}`);
  }
  if (mismatchedHeaders.length > 0) {
    throw new Error(`Security headers do not match vercel.json: ${mismatchedHeaders.join(" | ")}`);
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
    // A label collapsed to a sub-pixel box is deliberately hidden, not clipped:
    // the mobile toolbar collapses `#syncStatusText` this way while keeping the
    // text in the DOM for assistive tech. Require a visible box before judging
    // that content overflows it.
    const MIN_VISIBLE_BOX = 8;
    const clippedCount = [...document.querySelectorAll("main *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width >= MIN_VISIBLE_BOX &&
        rect.height >= MIN_VISIBLE_BOX &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.scrollWidth > element.clientWidth + 2 &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
    }).length;
    // Every deferred-style element must have had its value applied through
    // CSSOM. An unapplied one means the production CSP refused it.
    const unappliedStyles =
      [...document.querySelectorAll("[data-fill]")].filter((element) => !element.style.width).length +
      [...document.querySelectorAll("[data-height]")].filter((element) => !element.style.height).length +
      [...document.querySelectorAll("[data-var-value]")].filter((element) => !element.style.getPropertyValue("--value")).length;
    return {
      title,
      activeView,
      heading,
      authButton,
      syncButton,
      debug,
      overflow,
      topbarHeight,
      clippedCount,
      unappliedStyles,
      cspViolations: window.__cspViolations || [],
    };
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
  if (result.cspViolations.length > 0) {
    const summary = result.cspViolations.reduce((accumulator, violation) => {
      accumulator[violation.directive] = (accumulator[violation.directive] || 0) + 1;
      return accumulator;
    }, {});
    throw new Error(`CSP violations on the deployment: ${JSON.stringify(summary)}`);
  }
  if (result.unappliedStyles > 0) {
    throw new Error(`${result.unappliedStyles} data-fill/data-height/data-var-value element(s) shipped without their computed style applied.`);
  }
  if (result.overflow) {
    throw new Error("Mobile viewport has horizontal overflow.");
  }
  if (result.clippedCount > 0) {
    throw new Error(`Mobile viewport has ${result.clippedCount} clipped text elements.`);
  }

  // The mobile viewport only exposes five nav buttons (总览/今日/周计划/记录/更多),
  // so the full route sweep has to run at a desktop width where the sidebar is
  // visible. Checking mobile first keeps the mobile-specific assertions above.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(120);

  const views = ["today", "week", "foundation", "syllabus", "records", "review", "scores", "resources", "settings"];
  for (const view of views) {
    await page.locator(`.nav-item[data-view="${view}"]`).click({ timeout: 10000 });
    await page.waitForTimeout(60);
    const active = await page.evaluate(() => document.querySelector(".view.active")?.id || "");
    if (active !== view) {
      throw new Error(`Navigation failed for ${view}; active=${active}`);
    }
  }

  const desktopCspViolations = await page.evaluate(() => window.__cspViolations || []);
  if (desktopCspViolations.length > 0) {
    throw new Error(`CSP violations appeared while sweeping routes: ${JSON.stringify(desktopCspViolations)}`);
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
  if (messages.length > 0) {
    throw new Error(`Console warnings/errors found: ${JSON.stringify(messages)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    status,
    checkedHeaders: Object.keys(expectedHeaders),
    cspViolations: 0,
    result,
  }, null, 2));
} finally {
  await browser.close();
}

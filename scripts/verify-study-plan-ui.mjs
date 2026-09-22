import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const routes = ["dashboard", "today", "week", "foundation", "review", "resources"];
const modes = ["focus", "balanced", "detail"];
const outputDir = path.resolve("output/playwright/study-plan");
const consoleMessages = [];
let browser;
let server;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function selectMode(page, mode) {
  await page.locator(`.density-toggle [data-density="${mode}"]`).click();
  await page.waitForFunction((expected) => document.body.dataset.density === expected, mode);
}

async function openRoute(page, route) {
  await page.evaluate((nextRoute) => {
    window.location.hash = nextRoute;
  }, route);
  await page.waitForFunction((expected) => document.querySelector(".view.active")?.id === expected, route);
  await page.waitForTimeout(320);
}

async function routeState(page, route) {
  return page.evaluate((routeId) => {
    const active = document.getElementById(routeId);
    const visible = (selector) => {
      const element = active?.querySelector(selector);
      return Boolean(element && getComputedStyle(element).display !== "none" && element.getClientRects().length);
    };
    const visibleCount = (selector) => [...(active?.querySelectorAll(selector) || [])]
      .filter((element) => getComputedStyle(element).display !== "none" && element.getClientRects().length).length;
    const topLevelPanels = [...(active?.querySelectorAll(":scope > .content-grid > .panel, :scope > .today-workbench > .panel, :scope > .today-workbench > .detail-section") || [])]
      .filter((element) => getComputedStyle(element).display !== "none" && element.getClientRects().length);
    const topbar = document.querySelector(".topbar");
    const contentTrack = active?.querySelector(":scope > .today-workbench, :scope > .content-grid, :scope > .focus-board");
    const topbarRect = topbar?.getBoundingClientRect();
    const contentTrackRect = contentTrack?.getBoundingClientRect();
    const alignment = topbarRect && contentTrackRect ? {
      centerDelta: Math.abs((topbarRect.left + topbarRect.right) / 2 - (contentTrackRect.left + contentTrackRect.right) / 2),
      leftDelta: Math.abs(topbarRect.left - contentTrackRect.left),
      rightDelta: Math.abs(topbarRect.right - contentTrackRect.right)
    } : null;
    const isGreenColor = (value) => {
      const channels = String(value || "").match(/[\d.]+/g)?.map(Number) || [];
      if (channels.length < 3 || (channels[3] ?? 1) === 0) return false;
      const [r, g, b] = channels.map((channel, index) => index < 3 ? channel / 255 : channel);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      if (!delta) return false;
      let hue;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      const lightness = (max + min) / 2;
      const saturation = delta / (1 - Math.abs(2 * lightness - 1));
      return hue >= 75 && hue <= 190 && saturation >= 0.18;
    };
    const greenSurfaceDetails = [...(active?.querySelectorAll("*") || [])].flatMap((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.getClientRects().length && rect.width > 8 && rect.height > 8 && isGreenColor(style.backgroundColor)
        ? [{ tag: element.tagName, className: element.className, color: style.backgroundColor }]
        : [];
    }).slice(0, 8);
    const panelOverlaps = topLevelPanels.flatMap((panel, index) => {
      const a = panel.getBoundingClientRect();
      return topLevelPanels.slice(index + 1).flatMap((other) => {
        const b = other.getBoundingClientRect();
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return overlapWidth > 2 && overlapHeight > 2
          ? [{ first: panel.className, second: other.className, overlapWidth: Math.round(overlapWidth), overlapHeight: Math.round(overlapHeight) }]
          : [];
      });
    });
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      visibleFocus: visibleCount(".density-focus-only"),
      visibleBalanced: visibleCount(".density-balanced-only"),
      visibleDetail: visibleCount(".density-detail-only"),
      weekDays: visibleCount(".week-day-card"),
      weekTasks: visibleCount(".week-task"),
      cadenceDays: visibleCount(".cadence-day"),
      auditSteps: visibleCount(".weekly-audit-matrix article"),
      phaseSubjects: visibleCount(".phase-subject-board article"),
      phaseFiles: visibleCount(".phase-file"),
      resourceOperations: visibleCount(".resource-operation-grid article"),
      resourceFiles: visibleCount(".resource-file"),
      scienceRules: visibleCount(".review-science-card"),
      adjustmentRules: visibleCount(".adjustment-table article"),
      operatingFocus: visibleCount(".operating-focus"),
      operatingSteps: visibleCount(".operating-rail article"),
      operatingDetailSteps: visibleCount(".operating-table article"),
      startupDays: visibleCount(".startup-day-row"),
      startupWeekTabs: visibleCount("[data-startup-week]"),
      weekProtocols: visibleCount(".week-day-protocol"),
      resourceProtocols: visibleCount(".resource-protocol-row"),
      resourceStageRows: visibleCount(".resource-stage-row"),
      resourceDossierTabs: visibleCount("[data-resource-dossier-subject]"),
      alignment,
      panelOverlaps,
      greenSurfaceDetails,
      brokenTextBlocks: [...(active?.querySelectorAll("p, dd, li") || [])].filter((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display !== "none"
          && element.getClientRects().length
          && (element.textContent?.trim().length || 0) > 20
          && rect.width < 80;
      }).length,
      brokenTextDetails: [...(active?.querySelectorAll("p, dd, li") || [])].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display !== "none"
          && element.getClientRects().length
          && (element.textContent?.trim().length || 0) > 20
          && rect.width < 80
          ? [{ tag: element.tagName, className: element.className, width: Math.round(rect.width), text: element.textContent.trim().slice(0, 80) }]
          : [];
      }).slice(0, 6),
      focusSurface: visible(".density-focus-only"),
      balancedSurface: visible(".density-balanced-only"),
      detailSurface: visible(".density-detail-only")
    };
  }, route);
}

try {
  await fs.mkdir(outputDir, { recursive: true });
  server = await createServer({
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  assert(url, "Vite did not expose a study-plan verification URL.");

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleMessages.push(`pageerror: ${error.message}`));

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  const results = [];
  for (const mode of modes) {
    await selectMode(page, mode);
    for (const route of routes) {
      await openRoute(page, route);
      const state = await routeState(page, route);
      assert(!state.overflow, `${mode}/${route} has horizontal overflow at 1440px.`);
      assert(state.panelOverlaps.length === 0, `${mode}/${route} has overlapping top-level panels: ${JSON.stringify(state.panelOverlaps)}.`);
      assert(state.brokenTextBlocks === 0, `${mode}/${route} contains long text in an implausibly narrow column: ${JSON.stringify(state.brokenTextDetails)}.`);
      assert(state.greenSurfaceDetails.length === 0, `${mode}/${route} still contains green or teal backgrounds: ${JSON.stringify(state.greenSurfaceDetails)}.`);
      assert(state.alignment && state.alignment.centerDelta <= 1, `${mode}/${route} topbar and content do not share a center line: ${JSON.stringify(state.alignment)}.`);
      assert(state.alignment.leftDelta <= 1 && state.alignment.rightDelta <= 1, `${mode}/${route} topbar and content track edges do not align: ${JSON.stringify(state.alignment)}.`);
      if (mode === "focus") {
        assert(state.visibleBalanced === 0 && state.visibleDetail === 0, `${route} leaks execution or diagnostic surfaces into focus mode.`);
      } else if (mode === "balanced") {
        assert(state.visibleFocus === 0 && state.visibleDetail === 0, `${route} leaks action or diagnostic surfaces into balanced mode.`);
      } else {
        assert(state.visibleFocus === 0 && state.visibleBalanced === 0, `${route} leaks action or execution surfaces into detail mode.`);
      }

      if (route === "week" && mode === "focus") assert(state.weekDays === 0 && state.weekTasks === 0, "Focus week must show only the dedicated next-action surface.");
      if (route === "week" && mode === "balanced") assert(state.weekDays === 7 && state.cadenceDays === 7, "Balanced week must show the seven-day plan and cadence.");
      if (route === "week" && mode === "detail") assert(state.weekDays === 7 && state.auditSteps === 9 && state.weekProtocols === 7, "Detail week must show seven days, operating rules, and the nine-step audit chain.");
      if (route === "today" && mode === "focus") assert(state.operatingFocus === 1, "Focus Today must show the current action and stop rule.");
      if (route === "today" && mode === "balanced") assert(state.operatingSteps === 7, "Balanced Today must show the seven-step operating rail.");
      if (route === "today" && mode === "detail") assert(state.operatingDetailSteps === 7 && state.startupWeekTabs === 4 && state.startupDays === 7, "Detail Today must show the full operating protocol and one readable week from the 28-day calendar.");
      if (route === "foundation" && mode === "balanced") assert(state.phaseSubjects >= 3, "Balanced path must show the current phase subject board.");
      if (route === "foundation" && mode === "detail") assert(state.phaseFiles === 8, "Detail path must expose all eight phase files.");
      if (route === "resources" && mode === "balanced") assert(state.resourceOperations >= 3 && state.resourceProtocols >= 5, "Balanced resources must expose current operations and the selected subject protocol.");
      if (route === "resources" && mode === "detail") assert(state.resourceFiles === 1 && state.resourceDossierTabs === 4 && state.resourceStageRows >= 5, "Detail resources must expose four subject selectors and one readable subject dossier.");
      if (route === "review" && mode === "detail") assert(state.scienceRules === 6 && state.adjustmentRules === 6, "Detail review must expose six science rules and six adjustment decisions.");

      await page.locator(`#${route}`).screenshot({ path: path.join(outputDir, `${mode}-${route}-1440.png`) });
      results.push({ mode, route, ...state });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileRoutes = ["dashboard", "today", "week", "resources"];
  for (const mode of modes) {
    await selectMode(page, mode);
    for (const route of mobileRoutes) {
      await openRoute(page, route);
      const state = await routeState(page, route);
      assert(!state.overflow, `${mode}/${route} has horizontal overflow at 390px.`);
      assert(state.panelOverlaps.length === 0, `${mode}/${route} has overlapping mobile panels: ${JSON.stringify(state.panelOverlaps)}.`);
      assert(state.brokenTextBlocks === 0, `${mode}/${route} contains long text in an implausibly narrow mobile column: ${JSON.stringify(state.brokenTextDetails)}.`);
      assert(state.greenSurfaceDetails.length === 0, `${mode}/${route} still contains green or teal mobile backgrounds: ${JSON.stringify(state.greenSurfaceDetails)}.`);
      await page.screenshot({ path: path.join(outputDir, `${mode}-${route}-390.png`), fullPage: false });
    }
  }

  assert(consoleMessages.length === 0, `Browser console reported: ${JSON.stringify(consoleMessages)}`);
  console.log(JSON.stringify({ ok: true, url, outputDir, checks: results }, null, 2));
} finally {
  await browser?.close();
  await server?.close();
}

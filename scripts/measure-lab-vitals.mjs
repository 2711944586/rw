/**
 * Lab-only LCP, CLS, and one interaction duration on the production build.
 * These numbers are a local Chromium preview. They are not field CrUX data.
 *
 * Run `npm run build` first, then: node scripts/measure-lab-vitals.mjs
 */
import { chromium } from "playwright";
import { preview } from "vite";

const WIDTH = 1440;
const HEIGHT = 900;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const observer = `
  window.__labVitals = { lcp: 0, cls: 0, interactions: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__labVitals.lcp = entry.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (error) {
    window.__labVitals.lcpError = String(error);
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__labVitals.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (error) {
    window.__labVitals.clsError = String(error);
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__labVitals.interactions.push({
          name: entry.name,
          duration: entry.duration
        });
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch (error) {
    window.__labVitals.eventError = String(error);
  }
`;

function classifyEvents(interactions) {
  const events = Array.isArray(interactions) ? interactions : [];
  const longest = events.reduce((best, event) => (!best || event.duration > best.duration ? event : best), null);
  const click = events
    .filter((event) => ["click", "pointerdown", "pointerup", "keydown"].includes(event.name))
    .sort((left, right) => right.duration - left.duration)[0] || null;
  return {
    clickEvent: click,
    longestEvent: longest,
    eventCount: events.length
  };
}

const readVitalsSource = `(() => ({
  lcp: window.__labVitals?.lcp ?? null,
  cls: window.__labVitals?.cls ?? null,
  interactions: window.__labVitals?.interactions ?? [],
  lcpError: window.__labVitals?.lcpError || "",
  clsError: window.__labVitals?.clsError || "",
  eventError: window.__labVitals?.eventError || ""
}))()`;

async function readVitals(page) {
  return page.evaluate(readVitalsSource);
}

async function openRoute(page, base, hash) {
  await page.addInitScript(observer);
  await page.goto(`${base}#${hash}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  if (hash !== "dashboard") {
    await page.goto(`${base}#${hash}`, { waitUntil: "networkidle", timeout: 60000 });
  }
}

const server = await preview({
  preview: { host: "127.0.0.1", port: 4179, strictPort: true }
});
const base = server.resolvedUrls?.local?.[0];
assert(base, "Vite preview did not expose a local URL.");

const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await openRoute(page, base, "dashboard");
  await page.waitForSelector("#daysLeft", { timeout: 15000 });
  await page.waitForTimeout(800);
  const beforeClick = await readVitals(page);
  await page.click("#startPrimaryTask");
  await page.waitForSelector("#today.active, #today:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(600);
  const afterClick = await readVitals(page);
  results.push({
    route: "#dashboard",
    viewport: `${WIDTH}x${HEIGHT}`,
    lcpMs: Math.round(beforeClick.lcp || 0),
    clsBeforeInteraction: Number((beforeClick.cls || 0).toFixed(4)),
    clsAfterInteraction: Number((afterClick.cls || 0).toFixed(4)),
    ...classifyEvents(afterClick.interactions),
    errors: [beforeClick.lcpError, beforeClick.clsError, afterClick.eventError].filter(Boolean)
  });

  await openRoute(page, base, "today");
  await page.waitForSelector("#dailyPlan, #todayTasks", { timeout: 15000 });
  await page.waitForTimeout(800);
  const todayBefore = await readVitals(page);
  const start = page.locator("#startNextTaskBtn");
  if (await start.count()) await start.click();
  await page.waitForTimeout(600);
  const todayAfter = await readVitals(page);
  results.push({
    route: "#today",
    viewport: `${WIDTH}x${HEIGHT}`,
    lcpMs: Math.round(todayBefore.lcp || 0),
    clsBeforeInteraction: Number((todayBefore.cls || 0).toFixed(4)),
    clsAfterInteraction: Number((todayAfter.cls || 0).toFixed(4)),
    ...classifyEvents(todayAfter.interactions),
    errors: [todayBefore.lcpError, todayBefore.clsError, todayAfter.eventError].filter(Boolean)
  });
  console.log(JSON.stringify({
    label: "lab-local-preview",
    notFieldData: true,
    eventTimingFloorMs: 16,
    note: "A null clickEvent means the lab click stayed under the 16 ms Event Timing floor. longestEvent can be a hover from the test runner and is not a field INP.",
    results
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}

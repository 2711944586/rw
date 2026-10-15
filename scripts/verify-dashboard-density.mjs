import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outDir = path.resolve("output/ui-pass");
await fs.mkdir(outDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto("http://127.0.0.1:5173/#dashboard", { waitUntil: "networkidle" });
await page.locator('.density-toggle [data-density="detail"]').click();
await page.waitForFunction(() => document.body.dataset.density === "detail");
await page.evaluate(() => {
  document.querySelectorAll("#dashboard details.detail-section").forEach((el) => {
    el.open = true;
  });
});
await page.waitForTimeout(400);

const layout = await page.evaluate(() => {
  const dash = document.getElementById("dashboard");
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      cols: cs.gridTemplateColumns,
      col: cs.gridColumn,
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height)
    };
  };
  const pulse = document.querySelector("#dashboard > .week-pulse");
  const target = document.querySelector("#dashboard > .target-lane");
  const coach = document.querySelector("#dashboard > .coach-strip");
  const strategy = document.querySelector("#dashboard > .strategy-board");
  const focus = document.querySelector("#dashboard > .focus-board .focus-primary");
  const monitor = document.querySelector(".monitor-board");
  const secondary = document.querySelector(".secondary-metrics");
  const quota = document.querySelector(".monitor-quota");
  const heat = document.querySelector(".monitor-heat");
  const scores = document.querySelector(".monitor-scores");
  const tasks = document.querySelector(".monitor-tasks");
  const syllabus = document.querySelector(".monitor-syllabus");
  const rules = document.querySelector(".monitor-rules");
  const workflow = document.querySelector(".workflow-rail");
  const strategyCs = getComputedStyle(document.querySelector("#dashboard > .strategy-board"));
  const quotaGrid = document.querySelector("#quotaGrid");
  const quotaCs = quotaGrid ? getComputedStyle(quotaGrid) : null;
  const quotaItems = [...document.querySelectorAll("#quotaGrid > *")].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      pad: cs.padding,
      border: cs.borderTopWidth,
      borderColor: cs.borderTopColor
    };
  });
  const strategyCards = [...document.querySelectorAll("#dashboard > .strategy-board > *")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      border: cs.borderTopWidth,
      borderColor: cs.borderTopColor
    };
  });
  const sideBySide = (a, b) => a && b && Math.abs(a.y - b.y) < 48 && a.x + a.w <= b.x + 6;
  const stacked = (a, b) => a && b && a.y + a.h <= b.y + 6;
  return {
    dash: box(dash),
    pulse: box(pulse),
    target: box(target),
    coach: box(coach),
    strategy: box(strategy),
    focus: box(focus),
    monitor: box(monitor),
    secondary: box(secondary),
    quota: box(quota),
    heat: box(heat),
    scores: box(scores),
    tasks: box(tasks),
    syllabus: box(syllabus),
    rules: box(rules),
    pulseBesideTarget: sideBySide(box(pulse), box(target)),
    coachFull: box(coach)?.w > 900,
    metricsBesideQuota: sideBySide(box(secondary), box(quota)),
    scoresBesideTasks: sideBySide(box(scores), box(tasks)),
    syllabusBesideHeat: sideBySide(box(syllabus), box(heat)),
    rulesFull: box(rules)?.w > 900,
    stackedCoachStrategy: stacked(box(coach), box(strategy)),
    pageHeight: Math.round(dash.getBoundingClientRect().height),
    workflowCols: workflow ? getComputedStyle(workflow).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
    strategyGap: Number.parseFloat(strategyCs.gap) || 0,
    quotaCols: quotaCs ? quotaCs.gridTemplateColumns.split(" ").filter(Boolean).length : 0,
    quotaItems,
    strategyCards
  };
});

const targetLane = await page.evaluate(() => {
  const lane = document.querySelector("#dashboard > .target-lane");
  const cs = getComputedStyle(lane);
  const articles = [...lane.children].map((el) => {
    const r = el.getBoundingClientRect();
    return { cls: el.className, w: Math.round(r.width), h: Math.round(r.height) };
  });
  const labels = [...lane.querySelectorAll(".target-head span, .target-subject span, .audit-item span, .audit-item strong")].map((el) => {
    const r = el.getBoundingClientRect();
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || Number.parseFloat(getComputedStyle(el).fontSize) * 1.4;
    return {
      text: (el.textContent || "").trim(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      wrapped: r.height > line * 1.55
    };
  });
  return {
    cols: cs.gridTemplateColumns.split(" ").filter(Boolean).length,
    w: Math.round(lane.getBoundingClientRect().width),
    articles,
    labels
  };
});
assert(targetLane.cols === 1, `detail target-lane should stack, got ${targetLane.cols} columns (${targetLane.w}px)`);
assert(
  targetLane.articles.every((card) => card.w >= 280),
  `target-lane cards still narrow: ${JSON.stringify(targetLane.articles)}`
);
assert(
  targetLane.labels.every((label) => !label.wrapped),
  `CJK labels still wrap in target-lane: ${JSON.stringify(targetLane.labels.filter((label) => label.wrapped))}`
);

assert(layout.pulseBesideTarget, `week-pulse should sit beside target-lane: ${JSON.stringify({ pulse: layout.pulse, target: layout.target })}`);
assert(layout.coachFull, `coach should be full width: ${layout.coach?.w}`);
assert(layout.stackedCoachStrategy, "coach should sit above strategy");
assert(layout.metricsBesideQuota, "累计/本月 should sit beside 本周配额");
assert(layout.scoresBesideTasks, "目标分 should sit beside 今日预览");
assert(layout.syllabusBesideHeat, "考纲 should sit beside 热力图");
assert(layout.rulesFull, `规则 should be full width: ${layout.rules?.w}`);
assert(layout.focus.h < 380, `focus-primary still tall: ${layout.focus.h}`);
assert(layout.pageHeight < 5200, `page still very tall: ${layout.pageHeight}`);
assert(layout.workflowCols === 4, `workflow should be 4 columns, got ${layout.workflowCols}`);
assert(layout.strategyGap >= 12, `strategy cards still glued: gap ${layout.strategyGap}`);
assert(layout.quotaCols === 3, `quota should wrap 3+2, got ${layout.quotaCols} columns`);
assert(layout.quotaItems.length === 5, `expected 5 quota items, got ${layout.quotaItems.length}`);
assert(
  layout.quotaItems.every((item) => item.w >= 160 && item.h >= 70 && item.pad !== "0px"),
  `quota items still cramped: ${JSON.stringify(layout.quotaItems)}`
);
assert(
  layout.quotaItems.every((item) => Number.parseFloat(item.border) >= 1),
  `quota items missing card borders: ${JSON.stringify(layout.quotaItems)}`
);
assert(
  layout.strategyCards.every((card) => Number.parseFloat(card.border) >= 1 && !card.borderColor.includes("0, 0, 0, 0")),
  `strategy cards still glued or transparent: ${JSON.stringify(layout.strategyCards)}`
);

await page.screenshot({ path: path.join(outDir, "dashboard-diag-1440.png"), fullPage: true });
await page.locator(".diag-board").screenshot({ path: path.join(outDir, "diag-board-1440.png") });
await page.locator(".monitor-board").screenshot({ path: path.join(outDir, "monitor-board-1440.png") });

await page.setViewportSize({ width: 900, height: 1100 });
await page.waitForTimeout(350);
const layout900 = await page.evaluate(() => {
  const dash = document.getElementById("dashboard");
  const cs = getComputedStyle(dash);
  const pulse = document.querySelector("#dashboard > .week-pulse").getBoundingClientRect();
  const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
  return {
    cols: cs.gridTemplateColumns.split(" ").filter(Boolean).length,
    pulseWidth: Math.round(pulse.width),
    dashWidth: Math.round(dash.getBoundingClientRect().width),
    overflowX
  };
});
assert(layout900.cols === 1, `900px dashboard should be 1 column, got ${layout900.cols}`);
assert(!layout900.overflowX, "horizontal overflow at 900");
await page.screenshot({ path: path.join(outDir, "dashboard-diag-900.png"), fullPage: true });

console.log(JSON.stringify({ layout, layout900 }, null, 2));
await browser.close();

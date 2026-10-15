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
page.on("pageerror", (error) => {
  console.error("PAGEERROR", error.message);
});

await page.goto("http://127.0.0.1:5173/#dashboard", { waitUntil: "networkidle" });
await page.locator('.density-toggle [data-density="detail"]').click();
await page.waitForFunction(() => document.body.dataset.density === "detail");
await page.waitForSelector(".diag-board .fact-check-card");
await page.waitForTimeout(400);

const dashboardText = await page.locator("#dashboard").innerText();
assert(!dashboardText.includes("用四周建立连续性"), "AI phase sentence still on dashboard");
assert(!dashboardText.includes("不追补"), "catch-up AI copy still on dashboard");
assert(!dashboardText.includes("负荷基线"), "baseline AI copy still on dashboard");
assert(!dashboardText.includes("本阶段重点是"), "coach AI copy still on dashboard");
assert(await page.locator("details.fact-detail-section").count() === 0, "old 资料核验 details still present");
assert(await page.locator("details.loop-details").count() === 0, "old 数据流 details still present");

const metrics = await page.evaluate(() => {
  const board = document.querySelector(".diag-board");
  const boardStyle = getComputedStyle(board);
  const boardRect = board.getBoundingClientRect();
  const facts = [...board.querySelectorAll(".fact-check-card")];
  const steps = [...board.querySelectorAll(".workflow-step")];
  const rows = [...board.querySelectorAll(".storage-row")];
  const factGrid = getComputedStyle(board.querySelector(".live-fact-grid"));
  const rail = getComputedStyle(board.querySelector(".workflow-rail"));
  const ops = getComputedStyle(board.querySelector(".diag-ops"));
  const boxes = [...facts, ...steps, ...rows].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
  });
  let overlap = null;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) {
        overlap = { i, j, ox, oy };
        break;
      }
    }
    if (overlap) break;
  }
  return {
    density: document.body.dataset.density,
    boardDisplay: boardStyle.display,
    boardVisible: boardStyle.display !== "none" && boardRect.height > 0,
    factCount: facts.length,
    stepCount: steps.length,
    storageCount: rows.length,
    factCols: factGrid.gridTemplateColumns.split(" ").filter(Boolean).length,
    railCols: rail.gridTemplateColumns.split(" ").filter(Boolean).length,
    opsCols: ops.gridTemplateColumns.split(" ").filter(Boolean).length,
    factHeights: facts.map((el) => Math.round(el.getBoundingClientRect().height)),
    factMinHeight: facts.map((el) => getComputedStyle(el).minHeight),
    stepGrid: steps[0] ? getComputedStyle(steps[0]).gridTemplateColumns : "",
    phase: document.getElementById("deskPhaseLine")?.textContent || "",
    coach: document.getElementById("coachText")?.textContent || "",
    overlap
  };
});

assert(metrics.boardVisible, "diag-board hidden in 诊断");
assert(metrics.factCount === 6, `expected 6 fact cards, got ${metrics.factCount}`);
assert(metrics.stepCount === 8, `expected 8 workflow steps, got ${metrics.stepCount}`);
assert(metrics.storageCount === 4, `expected 4 storage rows, got ${metrics.storageCount}`);
assert(metrics.factCols === 3, `expected 3 fact columns at 1440, got ${metrics.factCols}`);
assert(metrics.railCols === 8, `expected 8 workflow columns at 1440, got ${metrics.railCols}`);
assert(metrics.opsCols === 2, `expected workflow+storage side by side, got ${metrics.opsCols}`);
assert(metrics.factHeights.every((h) => h < 110), `fact cards still tall: ${metrics.factHeights.join(",")}`);
assert(!metrics.overlap, `diag-board children overlap: ${JSON.stringify(metrics.overlap)}`);
assert(metrics.phase.includes("新词 100"), `phase line missing 新词 100: ${metrics.phase}`);
assert(!metrics.phase.includes("用四周"), `phase line still AI: ${metrics.phase}`);
assert(!String(metrics.stepGrid).includes("24px"), `workflow step still 2-col: ${metrics.stepGrid}`);

await page.screenshot({ path: path.join(outDir, "dashboard-diag-1440.png"), fullPage: true });
await page.locator(".diag-board").screenshot({ path: path.join(outDir, "diag-board-1440.png") });

await page.setViewportSize({ width: 900, height: 1100 });
await page.waitForTimeout(350);
const metrics900 = await page.evaluate(() => {
  const board = document.querySelector(".diag-board");
  const factGrid = getComputedStyle(board.querySelector(".live-fact-grid"));
  const rail = getComputedStyle(board.querySelector(".workflow-rail"));
  const ops = getComputedStyle(board.querySelector(".diag-ops"));
  const boxes = [...board.querySelectorAll(".fact-check-card, .workflow-step, .storage-row")].map((el) => el.getBoundingClientRect());
  let overlap = false;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) overlap = true;
    }
  }
  return {
    factCols: factGrid.gridTemplateColumns.split(" ").filter(Boolean).length,
    railCols: rail.gridTemplateColumns.split(" ").filter(Boolean).length,
    opsCols: ops.gridTemplateColumns.split(" ").filter(Boolean).length,
    overlap,
    boardHeight: Math.round(board.getBoundingClientRect().height)
  };
});
assert(metrics900.factCols === 2, `expected 2 fact columns at 900, got ${metrics900.factCols}`);
assert(metrics900.opsCols === 1, `expected stacked ops at 900, got ${metrics900.opsCols}`);
assert(!metrics900.overlap, "diag-board overlaps at 900");
await page.screenshot({ path: path.join(outDir, "dashboard-diag-900.png"), fullPage: true });
await page.locator(".diag-board").screenshot({ path: path.join(outDir, "diag-board-900.png") });

await page.setViewportSize({ width: 1440, height: 1100 });
await page.evaluate(() => { window.location.hash = "settings"; });
await page.waitForFunction(() => document.querySelector(".view.active")?.id === "settings");
await page.waitForSelector("#settingEnglishNewWords");
const words = await page.locator("#settingEnglishNewWords").inputValue();
assert(words === "100", `englishNewWords default is ${words}`);
await page.screenshot({ path: path.join(outDir, "settings-vocab-1440.png"), fullPage: true });

await page.evaluate(() => { window.location.hash = "today"; });
await page.waitForFunction(() => document.querySelector(".view.active")?.id === "today");
await page.waitForTimeout(400);
const todayText = await page.locator("#today").innerText();
assert(!todayText.includes("用四周建立连续性"), "AI sentence still on today");
assert(todayText.includes("新词 100"), `today missing 新词 100\n${todayText.slice(0, 400)}`);
await page.screenshot({ path: path.join(outDir, "today-plan-1440.png"), fullPage: true });

await page.evaluate(() => { window.location.hash = "foundation"; });
await page.waitForFunction(() => document.querySelector(".view.active")?.id === "foundation");
await page.waitForTimeout(300);
const foundationText = await page.locator("#foundation").innerText();
assert(!foundationText.includes("用四周建立连续性"), "AI sentence still on foundation");
assert(!foundationText.includes("不追补已经过去的暑假"), "catch-up sentence still on foundation");
await page.screenshot({ path: path.join(outDir, "foundation-1440.png"), fullPage: true });

console.log(JSON.stringify({ metrics, metrics900, words, todayHasVocab: todayText.includes("新词 100") }, null, 2));
await browser.close();

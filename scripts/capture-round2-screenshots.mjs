import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const outDir = resolve('docs/audit/screenshots');
const views = ['dashboard', 'today', 'week', 'review', 'syllabus'];
const widths = [390, 1440];
let browser;
let server;

try {
  await mkdir(outDir, { recursive: true });
  server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('Vite did not expose a local URL.');

  browser = await chromium.launch();
  const page = await browser.newPage();
  const report = { url, overflow: {}, flow: {} };

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1100 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    for (const view of views) {
      await page.evaluate((nextView) => {
        window.location.hash = `#${nextView}`;
      }, view);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      report.overflow[`${width}-${view}`] = overflow;
      await page.screenshot({
        path: resolve(outDir, `${width}-${view}.png`),
        fullPage: false,
      });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => {
    window.location.hash = '#dashboard';
  });
  await page.waitForTimeout(200);
  await page.locator('#startPrimaryTask').click();
  await page.waitForTimeout(400);
  report.flow.afterStart = await page.evaluate(() => ({
    hash: window.location.hash,
    sessionVisible: document.getElementById('sessionBar')?.hidden === false,
    resultVisible: document.getElementById('sessionResultForm')?.hidden === false,
    clock: document.getElementById('sessionClock')?.textContent || '',
  }));
  await page.locator('#sessionFinishBtn').click();
  await page.waitForTimeout(200);
  await page.locator('#sessionResultForm [name="problems"]').fill('3');
  await page.locator('#sessionResultForm [name="mistake"]').fill('左右极限条件漏了');
  await page.locator('#sessionResultForm [name="nextTask"]').fill('闭卷重做两道变式');
  await page.locator('#sessionResultForm button[type="submit"]').click();
  await page.waitForTimeout(400);
  report.flow.afterSave = await page.evaluate(() => ({
    hash: window.location.hash,
    sessionVisible: document.getElementById('sessionBar')?.hidden === false,
    done: document.querySelector('#todayTasks .task-block.done') !== null,
    toast: document.querySelector('.toast, [role="status"]')?.textContent || '',
  }));
  await page.screenshot({ path: resolve(outDir, '1440-today-after-save.png'), fullPage: false });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => {
    window.location.hash = '#today';
  });
  await page.waitForTimeout(200);
  report.flow.overflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await page.screenshot({ path: resolve(outDir, '320-today.png'), fullPage: false });

  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server?.close();
}

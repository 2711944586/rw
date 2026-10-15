import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const outDir = resolve('output/predeploy-review');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const report = { overflow: {}, issues: [], auth: {} };

async function inspect(page, name) {
  const data = await page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
    const overflowY = document.documentElement.scrollHeight > window.innerHeight + 1;
    const nodes = [...document.querySelectorAll('body *')].slice(0, 2500);
    const clipped = [];
    const tiny = [];
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.right > window.innerWidth + 2 && rect.left < window.innerWidth) {
        clipped.push({ tag: el.tagName, id: el.id, cls: el.className?.toString?.().slice(0, 80), right: Math.round(rect.right) });
      }
      const fontSize = Number.parseFloat(style.fontSize);
      if (fontSize && fontSize < 11 && (el.textContent || '').trim().length > 0) {
        tiny.push({ tag: el.tagName, id: el.id, cls: el.className?.toString?.().slice(0, 80), fontSize, text: (el.textContent || '').trim().slice(0, 40) });
      }
    }
    return {
      overflowX,
      overflowY,
      title: document.title,
      heading: document.querySelector('main h2, .view.active h2, .page-title')?.textContent?.trim() || '',
      clipped: clipped.slice(0, 8),
      tiny: tiny.slice(0, 8),
    };
  });
  report.overflow[name] = data;
  if (data.overflowX) report.issues.push(`${name}: horizontal overflow`);
  if (data.clipped.length) report.issues.push(`${name}: clipped ${data.clipped.map((c) => c.cls || c.id).join(', ')}`);
  return data;
}

async function shot(page, name, { full = false } = {}) {
  await page.waitForTimeout(180);
  await inspect(page, name);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: full, type: 'png' });
}

const views = ['dashboard', 'today', 'week', 'review', 'scores', 'settings', 'syllabus', 'resources', 'records', 'foundation'];

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  for (const view of views) {
    await page.evaluate((next) => { window.location.hash = `#${next}`; }, view);
    await page.waitForTimeout(280);
    await shot(page, `1440-${view}`, { full: true });
  }
  await page.evaluate(() => { window.location.hash = '#dashboard'; });
  await page.waitForTimeout(200);
  await page.locator('#authOpenBtn').click();
  await page.waitForTimeout(250);
  report.auth.desktopOpen = await page.evaluate(() => document.getElementById('authDialog')?.open === true);
  await shot(page, '1440-auth');
  await page.locator('#authCloseBtn').click();
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  for (const view of ['dashboard', 'today', 'week', 'review', 'settings', 'scores']) {
    await page.evaluate((next) => { window.location.hash = `#${next}`; }, view);
    await page.waitForTimeout(280);
    await shot(page, `390-${view}`);
  }
  await page.evaluate(() => { window.location.hash = '#dashboard'; });
  await page.waitForTimeout(200);
  await page.locator('#authOpenBtn').click();
  await page.waitForTimeout(250);
  report.auth.mobileOpen = await page.evaluate(() => document.getElementById('authDialog')?.open === true);
  await shot(page, '390-auth');
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await page.goto('http://127.0.0.1:5173/#today', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(280);
  await shot(page, '320-today');
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
console.log('Wrote screenshots to', outDir);

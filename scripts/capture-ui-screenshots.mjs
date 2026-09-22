/**
 * Screenshot harness for the design review.
 *
 * Task/review subjects use the app's canonical Chinese labels (数学/408/英语/政治),
 * NOT the internal keys — `subjectToEntryKey` only accepts labels, so seeding keys
 * would render raw `math`/`cs408` and misrepresent the real UI.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve('dist');
const OUT = path.resolve('output/ui-review2');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const HEADERS = Object.fromEntries(vercel.headers.find((e) => e.source === '/(.*)').headers.map((h) => [h.key, h.value]));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, HEADERS).end('nf'); return; }
  res.writeHead(200, { ...HEADERS, 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const STATE_KEY = 'pku_swm_420_dashboard_v3';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const seeded = await page.evaluate((key) => {
  const base = JSON.parse(localStorage.getItem(key) || '{}');
  const iso = (d) => d.toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < 23; i += 1) { const d = new Date(Date.UTC(2026, 7, 31)); d.setUTCDate(d.getUTCDate() + i); days.push(iso(d)); }
  const entries = {};
  days.forEach((date, index) => {
    const light = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    const w = (index % 5) * 6;
    entries[date] = { math: light ? 60 : 120 + w, cs408: light ? 40 : 90 + w, english: light ? 20 : 40 + (index % 3) * 5, politics: light ? 0 : 25 + (index % 4) * 5, project: index % 3 === 0 ? 45 : 0, quality: light ? 3 : 4, mathProblems: 18 + w, csProblems: 12 + w, reading: 2, newMistakes: 3, fixedMistakes: 2, nextTask: '', note: '', updatedAt: `${date}T20:00:00.000Z` };
  });
  const last = days[days.length - 1];
  return {
    ...base,
    entries,
    scores: [1, 2, 3, 4, 5].map((n) => ({ id: `mock-${n}`, date: days[days.length - n * 4] || last, name: `第 ${n} 次模考`, math: 92 + n * 6, cs408: 74 + n * 5, english: 60 + n * 4, politics: 56 + n * 3, note: n === 3 ? '线代计算慢，计组 Cache 失分' : '', updatedAt: `${last}T20:00:00.000Z` })),
    weekPlans: {
      [last]: [
        { id: `${last}-a`, subject: '数学', text: '高数：极限与连续 20 题', minutes: 90, status: 'done', priority: 1, updatedAt: `${last}T09:00:00.000Z` },
        { id: `${last}-b`, subject: '408', text: '进程调度与死锁判定', minutes: 75, status: 'done', priority: 2, updatedAt: `${last}T09:00:00.000Z` },
        { id: `${last}-c`, subject: '英语', text: '真题阅读 2 篇精析', minutes: 45, status: 'todo', priority: 3, updatedAt: `${last}T09:00:00.000Z` },
        { id: `${last}-d`, subject: '政治', text: '马原核心考点 20 题', minutes: 30, status: 'todo', priority: 4, updatedAt: `${last}T09:00:00.000Z` },
      ],
    },
    reviewItems: [1, 2, 3, 4].map((n) => ({ id: `review-${n}`, subject: ['数学', '408', '英语', '政治'][n - 1], text: ['极限的等价无穷小替换', '银行家算法判定', '长难句拆分', '对立统一规律'][n - 1], round: `第 ${n} 轮`, dueDate: days[days.length - n] || last, status: n <= 2 ? 'due' : 'delayed', delayCount: n === 2 ? 2 : 0, done: false, updatedAt: `${last}T09:00:00.000Z` })),
    resources: { 'math-660': { title: '660 题（数学）', progress: 62, updatedAt: `${last}T09:00:00.000Z` }, 'cs-wangdao': { title: '王道 408 单科书', progress: 48, updatedAt: `${last}T09:00:00.000Z` }, 'eng-zhenti': { title: '英语真题（2010-2020）', progress: 35, updatedAt: `${last}T09:00:00.000Z` } },
    snapshots: [1, 2, 3].map((n) => ({ id: `snap-${n}`, reason: ['manual-backup', 'before-reset', 'before-import'][n - 1], createdAt: `${days[days.length - n * 3]}T10:00:00.000Z`, payload: {} })),
    settings: { ...base.settings, density: 'balanced' },
  };
}, STATE_KEY);
await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STATE_KEY, value: seeded });
await page.goto(`${base}?s=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const jobs = [
  { route: 'dashboard', vp: { width: 1440, height: 1100 }, name: 'desktop-dashboard', full: true },
  { route: 'scores', vp: { width: 1440, height: 1100 }, name: 'desktop-scores', full: true },
  { route: 'syllabus', vp: { width: 1440, height: 1100 }, name: 'desktop-syllabus', full: true },
  { route: 'review', vp: { width: 1440, height: 1100 }, name: 'desktop-review', full: true },
  { route: 'resources', vp: { width: 1440, height: 1100 }, name: 'desktop-resources', full: true },
  { route: 'settings', vp: { width: 1440, height: 1100 }, name: 'desktop-settings', full: true },
  { route: 'week', vp: { width: 1440, height: 1100 }, name: 'desktop-week', full: true },
  { route: 'dashboard', vp: { width: 390, height: 844 }, name: 'mobile-dashboard', full: false, scrollTop: 0 },
  { route: 'dashboard', vp: { width: 390, height: 844 }, name: 'mobile-dashboard-mid', full: false, scrollTop: 900 },
];

for (const job of jobs) {
  await page.setViewportSize(job.vp);
  await page.evaluate((id) => window.__rwDebug.route(id), job.route);
  await page.waitForTimeout(500);
  await page.evaluate((top) => { document.getElementById('main-content').scrollTop = top || 0; }, job.scrollTop);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${job.name}.png`), fullPage: job.full === true });
  console.log(`${job.name}.png`);
}

await browser.close();
server.close();

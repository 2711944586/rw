/**
 * Production CSP gate.
 *
 * `scripts/verify-local.mjs` runs against the Vite **dev** server, which never
 * applies the security headers declared in `vercel.json`. That means inline
 * styles and `data:` fonts can break in production while every existing gate
 * stays green. This script closes that hole: it serves the real `dist/` output
 * with the exact headers from `vercel.json` and fails on any CSP violation.
 *
 * It also asserts that every `data-fill` / `data-height` / `data-var-value`
 * element had its value applied through CSSOM, so a render path that bypasses
 * `applyDeferredStyles()` fails here instead of shipping flat bars.
 *
 * Run `npm run build` first (as `npm run quality` already does for
 * `test:budget`).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function fail(message) {
  console.error(`CSP gate FAILED: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(DIST) || !fs.statSync(DIST).isDirectory()) {
  fail(`${path.relative(process.cwd(), DIST)} does not exist. Run "npm run build" first.`);
}

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const wildcard = vercel.headers?.find((entry) => entry.source === '/(.*)');
if (!wildcard) fail('vercel.json no longer declares a /(.*) header block.');
const HEADERS = Object.fromEntries(wildcard.headers.map((h) => [h.key, h.value]));
const csp = HEADERS['Content-Security-Policy'];
if (!csp) fail('vercel.json no longer declares a Content-Security-Policy header.');

const { VIEW_IDS } = await import('../src/core/route-contract.js');

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(request.url.split('?')[0]);
  const filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(DIST) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, HEADERS).end('not found');
    return;
  }
  response.writeHead(200, {
    ...HEADERS,
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const unappliedProbe = () => ({
  unapplied:
    [...document.querySelectorAll('[data-fill]')].filter((element) => !element.style.width).length +
    [...document.querySelectorAll('[data-height]')].filter((element) => !element.style.height).length +
    [...document.querySelectorAll('[data-var-value]')].filter((element) => !element.style.getPropertyValue('--value')).length,
});

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI });
    });
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(400);

  const shell = await page.evaluate(() => ({
    title: document.title,
    activeView: document.querySelector('.view.active')?.id || '',
  }));
  if (shell.title && !shell.title.includes('软微 420')) fail(`Unexpected title: ${shell.title}`);

  const checkedViews = [];
  const deferredFindings = [];
  for (const viewId of VIEW_IDS) {
    const routed = await page.evaluate((id) => window.__rwDebug?.route(id), viewId);
    if (routed !== true) fail(`Route controller rejected ${viewId}.`);
    await page.waitForFunction((id) => document.querySelector('.view.active')?.id === id, viewId);
    await page.waitForTimeout(150);
    const probe = await page.evaluate(unappliedProbe);
    if (probe.unapplied > 0) deferredFindings.push(`${viewId}: ${probe.unapplied}`);
    checkedViews.push(viewId);
  }

  const violations = await page.evaluate(() => window.__cspViolations || []);
  const byDirective = violations.reduce((accumulator, violation) => {
    accumulator[violation.directive] = (accumulator[violation.directive] || 0) + 1;
    return accumulator;
  }, {});

  if (deferredFindings.length > 0) {
    fail(`data-fill/data-height/data-var-value left unapplied on: ${deferredFindings.join(', ')} — a render path is bypassing applyDeferredStyles().`);
  }
  if (violations.length > 0) {
    fail(`${violations.length} CSP violation(s) under the real production headers: ${JSON.stringify(byDirective)}`);
  }
  if (consoleErrors.length > 0) {
    fail(`Console errors under production headers: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    csp,
    shell,
    checkedViews,
    deferredStylesApplied: true,
    violations: 0,
  }, null, 2));
} finally {
  await browser?.close();
  server.close();
}

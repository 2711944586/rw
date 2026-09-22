/**
 * CSS cascade diagnostic.
 *
 * When a layout rule "should" apply but does not, the reason is almost always
 * another rule winning the cascade. This prints, in cascade order, every
 * declaration that actually applies to one element — which is how the two
 * mobile-layout defects in `docs/DESIGN_REVIEW_2026-09-22.md` were traced:
 *
 *   - `.focus-board` was reset to two columns by a `max-width: 620px` block in
 *     `workspace.css` that sits *after* the `max-width: 760px` block which
 *     collapses it to one column, so the narrower breakpoint won.
 *   - `.panel.wide` forced the 模考 trend panel onto its own row; the
 *     density-scoped overrides could not be beaten by a page-level rule because
 *     their `:not(#dashboard)` contributes id-level specificity.
 *
 * Usage:
 *   node scripts/diag-css-cascade.mjs <css-selector> [--route dashboard] [--width 1440]
 *                                      [--property grid-template-columns,grid-column]
 *
 * Requires `npm run build` first.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const selector = process.argv[2];
if (!selector || selector.startsWith('--')) {
  console.error('Usage: node scripts/diag-css-cascade.mjs <css-selector> [--route dashboard] [--width 1440] [--property grid-template-columns,grid-column]');
  process.exit(1);
}
const route = arg('route', 'dashboard');
const width = Number(arg('width', '1440'));
// Density is a major cascade axis in this codebase: most layout overrides are
// scoped by `body[data-density]`, so a rule can lose purely because of the
// active density. Default to the app's own default (focus) unless told otherwise.
const density = arg('density', '');
const properties = arg('property', 'grid-template-columns,grid-column,display,width,height').split(',').map((value) => value.trim());

if (!fs.existsSync(DIST)) {
  console.error('dist does not exist. Run "npm run build" first.');
  process.exit(1);
}

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const HEADERS = Object.fromEntries(vercel.headers.find((entry) => entry.source === '/(.*)').headers.map((header) => [header.key, header.value]));

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(request.url.split('?')[0]);
  const filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(DIST) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, HEADERS).end('not found');
    return;
  }
  response.writeHead(200, { ...HEADERS, 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 1000 } });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.evaluate((id) => window.__rwDebug?.route?.(id), route);
await page.waitForTimeout(300);
if (density) {
  await page.evaluate((value) => {
    document.body.dataset.density = value;
    document.documentElement.dataset.density = value;
  }, density);
  await page.waitForTimeout(200);
}

const result = await page.evaluate(({ selector, properties }) => {
  const target = document.querySelector(selector);
  if (!target) return { missing: true };

  const toCamel = (value) => value.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
  const rows = [];
  let order = 0;

  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const sheetName = (sheet.href || 'inline').split('/').pop();
    const walk = (list, media) => {
      for (const rule of list) {
        if (rule.cssRules && rule.conditionText !== undefined) { walk(rule.cssRules, rule.conditionText); continue; }
        if (!rule.selectorText) continue;
        if (media && !window.matchMedia(media).matches) continue;
        let applies;
        try { applies = target.matches(rule.selectorText); } catch { applies = false; }
        if (!applies) continue;
        const declared = [];
        for (const property of properties) {
          const value = rule.style[toCamel(property)];
          if (value) declared.push(`${property}: ${value}`);
        }
        if (declared.length === 0) continue;
        rows.push({ order: order++, sheet: sheetName, media: media || '(none)', selector: rule.selectorText.slice(0, 92), declared: declared.join('; ') });
      }
    };
    walk(rules, null);
  }

  const computed = {};
  for (const property of properties) computed[property] = getComputedStyle(target)[toCamel(property)];
  const rect = target.getBoundingClientRect();

  return {
    rows,
    computed,
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    density: document.body.dataset.density,
  };
}, { selector, properties });

if (result.missing) {
  console.error(`No element matches "${selector}" on route "${route}" at ${width}px.`);
  process.exit(1);
}

console.log(`element   ${selector}`);
console.log(`route     ${route}   width ${width}px   density ${result.density}`);
console.log(`rect      ${JSON.stringify(result.rect)}`);
console.log(`computed  ${JSON.stringify(result.computed)}`);
console.log('\napplying declarations, in cascade order (last one wins):');
for (const row of result.rows) {
  console.log(`  #${String(row.order).padStart(3)}  ${row.media.padEnd(24)} ${row.declared}`);
  console.log(`       ${row.sheet}  ${row.selector}`);
}
const winner = result.rows[result.rows.length - 1];
if (winner) console.log(`\nwinner    #${winner.order}  ${winner.media}  ${winner.selector}`);

await browser.close();
server.close();

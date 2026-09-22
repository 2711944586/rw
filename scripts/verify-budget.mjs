/**
 * Bundle size budget gate.
 *
 * Reads `dist/assets`, aggregates the **gzip** size of the chunks belonging to
 * each budget key, and fails when any of them exceeds its limit. Run
 * `npm run build` first — `npm run quality` chains them in that order.
 *
 * Sizes are printed as decimal KB (1 KB = 1000 bytes) to match the figures
 * quoted in README.md and docs/TECH_AUDIT_2026-09-15.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ASSET_DIR = path.resolve('dist', 'assets');

/**
 * One entry per chunk produced by the `manualChunks` map in vite.config.js.
 * `index` is the stylesheet specifically: the entry script of the same name is
 * tiny and is not the thing that grows.
 */
const BUDGETS = [
  { key: 'app', extension: '.js', limitKb: 125 },
  { key: 'index', extension: '.css', limitKb: 95 },
  { key: 'vendor-supabase', extension: '.js', limitKb: 60 },
  { key: 'infra', extension: '.js', limitKb: 12 },
  { key: 'domain', extension: '.js', limitKb: 9 },
  { key: 'vendor-icons', extension: '.js', limitKb: 4 },
];

function toKb(bytes) {
  return bytes / 1000;
}

function formatKb(bytes) {
  return `${toKb(bytes).toFixed(2)} KB`;
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function chunkPattern({ key, extension }) {
  return new RegExp(`^${escapeForRegExp(key)}-[^/]*\\${extension}$`);
}

function gzipSize(fileName) {
  const contents = fs.readFileSync(path.join(ASSET_DIR, fileName));
  return zlib.gzipSync(contents).length;
}

if (!fs.existsSync(ASSET_DIR) || !fs.statSync(ASSET_DIR).isDirectory()) {
  console.error(`Bundle budget check FAILED: ${ASSET_DIR} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

const assetFiles = fs.readdirSync(ASSET_DIR).filter((name) => fs.statSync(path.join(ASSET_DIR, name)).isFile());
const budgeted = new Set();
const failures = [];

console.log(`Bundle budget (gzip) — ${path.relative(process.cwd(), ASSET_DIR).replace(/\\/g, '/')}`);

for (const budget of BUDGETS) {
  const pattern = chunkPattern(budget);
  const matched = assetFiles.filter((name) => pattern.test(name));
  matched.forEach((name) => budgeted.add(name));

  if (matched.length === 0) {
    failures.push(`${budget.key}*${budget.extension}: no matching chunk found — the build no longer emits it, so this budget has stopped guarding anything.`);
    console.log(`  FAIL ${budget.key.padEnd(16)} no file matched ${pattern} (budget ${budget.limitKb} KB)`);
    continue;
  }

  const totalBytes = matched.reduce((sum, name) => sum + gzipSize(name), 0);
  const totalKb = toKb(totalBytes);
  const overBudget = totalKb > budget.limitKb;
  if (overBudget) {
    failures.push(`${budget.key}*${budget.extension}: ${totalKb.toFixed(2)} KB exceeds the ${budget.limitKb} KB budget (${matched.join(', ')}).`);
  }

  console.log(
    `  ${overBudget ? 'FAIL' : 'ok  '} ${budget.key.padEnd(16)} ${formatKb(totalBytes).padStart(10)} gzip  budget ${String(budget.limitKb).padStart(3)} KB  (${overBudget ? '+' : '-'}${Math.abs(budget.limitKb - totalKb).toFixed(2)} KB)  ${matched.join(', ')}`
  );
}

const unbudgeted = assetFiles.filter((name) => !budgeted.has(name));
const unbudgetedCode = unbudgeted.filter((name) => /\.(js|css)$/.test(name));
const unbudgetedOther = unbudgeted.filter((name) => !/\.(js|css)$/.test(name));
for (const name of unbudgetedCode) {
  console.log(`  note unbudgeted ${name} (${formatKb(gzipSize(name))} gzip)`);
}
if (unbudgetedOther.length > 0) {
  console.log(`  note ${unbudgetedOther.length} font/image asset(s) outside any budget (not size-gated)`);
}

if (failures.length > 0) {
  console.error('\nBundle budget check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nBundle budget check passed.');

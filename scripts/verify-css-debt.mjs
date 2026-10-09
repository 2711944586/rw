/**
 * CSS debt ratchet.
 *
 * `docs/history/AUDIT_2026-09-22.md` records 75 `!important` declarations across
 * `src/styles/`, most of them in the 5,978-line `workspace.css` override layer
 * that exists to re-establish cascade priority on top of `base.css`. Removing
 * them safely needs per-segment screenshot regression — it cannot be done in
 * one pass, and a blind removal changes rendering without failing any current
 * gate.
 *
 * So this gate does not demand a fix. It ratchets: the count may fall, never
 * rise. When a segment is cleaned up, lower the ceiling in the same commit —
 * that keeps the number monotonic and stops the debt from quietly regrowing.
 *
 * No build required.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const STYLE_ROOT = path.resolve('src/styles');

/**
 * Per-file ceilings, measured 2026-09-22. Lower a value when you remove
 * `!important` declarations; never raise one without a written reason.
 */
const CEILINGS = Object.freeze({
  'base.css': 12,
  'views/study-plan.css': 13,
  'workspace.css': 40,
  'components/auth.css': 1,
  'components/toolbar.css': 9,
  'views/execution.css': 0,
});

const TOTAL_CEILING = Object.values(CEILINGS).reduce((sum, value) => sum + value, 0);

async function styleFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return styleFiles(target, relative);
    return entry.name.endsWith('.css') ? [{ relative, target }] : [];
  }));
  return nested.flat();
}

const counts = {};
let total = 0;
for (const { relative, target } of await styleFiles(STYLE_ROOT)) {
  const source = await fs.readFile(target, 'utf8');
  const count = (source.match(/!important/g) || []).length;
  counts[relative] = count;
  total += count;
}

console.log(`CSS debt ratchet — !important declarations in src/styles/`);
for (const [file, count] of Object.entries(counts).sort()) {
  const ceiling = CEILINGS[file];
  const marker = ceiling === undefined ? 'NEW ' : (count > ceiling ? 'FAIL' : 'ok  ');
  const budget = ceiling === undefined ? 'undeclared' : `ceiling ${String(ceiling).padStart(3)}`;
  console.log(`  ${marker} ${file.padEnd(24)} ${String(count).padStart(3)}  (${budget})`);
}
console.log(`  total ${total} / ceiling ${TOTAL_CEILING}`);

const failures = [];
for (const [file, count] of Object.entries(counts)) {
  const ceiling = CEILINGS[file];
  if (ceiling === undefined) {
    failures.push(`${file} carries ${count} !important declaration(s) but has no ceiling. Add it to CEILINGS.`);
  } else if (count > ceiling) {
    failures.push(`${file} has ${count} !important declaration(s), above its ceiling of ${ceiling}.`);
  }
}
for (const file of Object.keys(CEILINGS)) {
  if (counts[file] === undefined) {
    failures.push(`${file} is listed in CEILINGS but no longer exists. Remove the stale entry.`);
  }
}
if (total > TOTAL_CEILING) {
  failures.push(`total is ${total}, above the ceiling of ${TOTAL_CEILING}.`);
}

if (failures.length > 0) {
  console.error('\nCSS debt ratchet FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nIf the increase is intentional, lower another file\'s ceiling or record why in docs/CHANGELOG.md.');
  process.exit(1);
}

if (total < TOTAL_CEILING) {
  console.log(`\nRatchet passed — and ${TOTAL_CEILING - total} below the ceiling. Lower TOTAL_CEILING/CEILINGS to lock the gain in.`);
} else {
  console.log('\nRatchet passed.');
}

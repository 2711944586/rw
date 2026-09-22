/**
 * Module boundary gate.
 *
 * `docs/PROJECT_AUDIT.md` documents which modules are "kept but not wired into
 * production" — the tested migration layer that is deliberately not shipped
 * yet. That claim has already drifted once: `ui/density-controller.js` imported
 * `core/state-manager.js`, which silently dragged a second state store (bound
 * to the same localStorage key as `app.js`) into the production bundle while
 * the document still said it was excluded.
 *
 * This gate makes the boundary mechanical. It walks the import graph from the
 * production entry (`src/main.js`) and asserts the set of unreachable modules
 * matches PENDING_MIGRATION exactly — in both directions:
 *
 *   - a module silently entering the bundle (the state-manager case), and
 *   - a module listed as excluded that is actually reachable now
 *
 * both fail. Wiring a migration module into production therefore requires
 * updating this list, which forces a conscious decision instead of a silent
 * drift.
 *
 * No build required: it is a static import-graph walk.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');
const ENTRY = path.join(SRC, 'main.js');

/**
 * Modules that are intentionally NOT reachable from the production entry.
 *
 * These are the tested-but-not-yet-wired migration layer. Removing a module
 * from this list means wiring it into production; adding one means retiring it
 * from the bundle. Either way the change must be deliberate.
 */
const PENDING_MIGRATION = [
  'core/event-bus.js',
  'core/router.js',
  'core/state-manager.js',
  'domain/calibration-engine.js',
  'domain/plan-generator.js',
  'domain/project-showcase.js',
  'domain/retrospective-engine.js',
  'domain/review-queue.js',
  'domain/source-registry.js',
  'domain/task-contract.js',
  'infrastructure/offline-cache.js',
  'infrastructure/supabase-client.js',
  'infrastructure/sync-service.js',
  'utils/number.js',
  'views/fact-index-view.js',
  'views/records-view.js',
  'views/retrospective-view.js',
  'views/reviews-view.js',
  'views/settings-view.js',
  'views/showcase-view.js',
  'views/today-view.js',
  'views/weekly-view.js',
];

const IMPORT_PATTERNS = [
  /(?:^|\n)\s*import\s+[\s\S]*?\s*from\s*["']([^"']+)["']/g,
  /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
];

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function collectModules(directory) {
  const found = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith('.js')) found.push(target);
    }
  })(directory);
  return found;
}

function reachableFrom(entry) {
  const reachable = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const resolved = resolveLocalImport(file, match[1]);
        if (resolved && !reachable.has(resolved)) queue.push(resolved);
      }
    }
  }
  return reachable;
}

if (!fs.existsSync(ENTRY)) {
  console.error(`Module boundary check FAILED: ${path.relative(process.cwd(), ENTRY)} does not exist.`);
  process.exit(1);
}

const relative = (absolute) => path.relative(SRC, absolute).split(path.sep).join('/');

const reachable = reachableFrom(ENTRY);
const allModules = collectModules(SRC).map(relative).sort();
const actualUnreachable = allModules.filter((module) => !reachable.has(path.join(SRC, module)));
const declared = [...PENDING_MIGRATION].sort();

const enteredBundle = declared.filter((module) => !actualUnreachable.includes(module));
const newlyExcluded = actualUnreachable.filter((module) => !declared.includes(module));

console.log(`Module boundaries — entry src/main.js`);
console.log(`  reachable        ${reachable.size} module(s)`);
console.log(`  not in bundle    ${actualUnreachable.length} module(s) (${declared.length} declared)`);

const failures = [];
if (enteredBundle.length > 0) {
  failures.push(
    `reached the production bundle but are still declared as excluded: ${enteredBundle.join(', ')}. ` +
    'Either stop importing them from a production module, or remove them from PENDING_MIGRATION to accept the new wiring.'
  );
}
if (newlyExcluded.length > 0) {
  failures.push(
    `are no longer reachable but are not declared: ${newlyExcluded.join(', ')}. ` +
    'Add them to PENDING_MIGRATION so the boundary stays documented.'
  );
}

if (failures.length > 0) {
  console.error('\nModule boundary check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nModule boundary check passed.');

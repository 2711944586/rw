/**
 * @vitest-environment jsdom
 *
 * Behavioural coverage for the pure state layer of `src/app.js`.
 *
 * Before this file existed, the production implementation had no behavioural
 * tests at all: `tests/unit/app-imports.test.js` only pattern-matched app.js as
 * source text. Everything asserted here is exercised by calling the real
 * functions, so a refactor that keeps behaviour intact stays green.
 *
 * app.js exports this surface at the bottom of the file. Under Vitest the page
 * bootstrap is skipped, which is what makes the import side-effect free.
 */
import { describe, expect, it } from 'vitest';
import {
  CLEAN_START_VERSION,
  DEFAULT_EXAM_DATE,
  DELETED_TYPES,
  PLAN_START_DATE,
  SCHEMA_VERSION,
} from '../../src/config/app-config.js';
import {
  applyTombstones,
  buildCleanStartArchive,
  filterDeletedFromStart,
  filterEntriesFromStart,
  filterReviewItemsFromStart,
  filterTaskStateFromStart,
  firstSafeStateKey,
  freshState,
  hasMalformedDatePrefix,
  isOnOrAfterPlanStart,
  mergeArrayById,
  mergeDeletedTombstoneMeta,
  mergeDeletedTombstones,
  migrateState,
  normalizeRatio,
  normalizeTimestamp,
  safeStateKey,
  sanitizeDeleted,
  sanitizeDeletedMeta,
  sanitizeSnapshotReason,
  sanitizeSnapshots,
  sanitizeTask,
  sanitizeUser,
  sanitizeUserText,
  shouldApplyTombstone,
  taskIdDate,
} from '../../src/app.js';

const REQUIRED_CONTAINERS = Object.freeze([
  'schemaVersion',
  'entries',
  'scores',
  'topics',
  'topicEvidence',
  'tasks',
  'weekPlans',
  'project',
  'resources',
  'settings',
  'customTasks',
  'reviewItems',
  'deleted',
  'deletedMeta',
  'snapshots',
  'sync',
  'user',
]);

/** Every migrated or freshly built state must expose the full container set. */
function assertStateShape(state) {
  expect(state).toBeTypeOf('object');
  expect(Array.isArray(state)).toBe(false);
  REQUIRED_CONTAINERS.forEach((key) => {
    expect(Object.prototype.hasOwnProperty.call(state, key)).toBe(true);
  });
  expect(state.schemaVersion).toBe(SCHEMA_VERSION);
  expect(Array.isArray(state.scores)).toBe(true);
  expect(Array.isArray(state.customTasks)).toBe(true);
  expect(Array.isArray(state.reviewItems)).toBe(true);
  expect(Array.isArray(state.snapshots)).toBe(true);
  expect(state.entries).toBeTypeOf('object');
  expect(state.weekPlans).toBeTypeOf('object');
  expect(state.settings).toBeTypeOf('object');
  expect(state.sync).toBeTypeOf('object');
}

describe('state rules: module seam', () => {
  it('imports without running the page bootstrap', () => {
    expect(document.documentElement.dataset.navBound).toBeUndefined();
    expect(document.documentElement.dataset.workspaceBound).toBeUndefined();
  });
});

describe('state rules: freshState', () => {
  it('returns the full container shape with no user and a local sync status', () => {
    const state = freshState();
    assertStateShape(state);
    expect(state.user).toBeNull();
    expect(state.sync.status).toBe('local');
    expect(state.sync.pending).toBe(false);
    expect(state.entries).toEqual({});
    expect(state.scores).toEqual([]);
    expect(state.deleted).toEqual({ records: [], scores: [], tasks: [], reviews: [] });
  });

  it('stamps the clean-start marker so a restart is not re-migrated', () => {
    const state = freshState();
    expect(state.settings.cleanStartVersion).toBe(CLEAN_START_VERSION);
    expect(typeof state.settings.cleanStartAppliedAt).toBe('string');
  });

  it('returns an independent object on every call', () => {
    const first = freshState();
    const second = freshState();
    first.scores.push({ id: 'x' });
    first.settings.weekdayMinutes = 1;
    expect(second.scores).toEqual([]);
    expect(second.settings.weekdayMinutes).not.toBe(1);
  });
});

describe('state rules: migrateState never yields a partial state', () => {
  const hostileInputs = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'not-a-state'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', [1, 2, 3]],
    ['a nested array of arrays', [[{ a: 1 }]]],
    ['an empty object', {}],
    ['containers of the wrong type', { entries: 'x', scores: 'x', tasks: 7, weekPlans: [], settings: [] }],
    ['object-like state keys', { entries: { __proto__: { minutes: 1 }, constructor: { minutes: 1 } } }],
    ['cyclic-looking deep nesting', { settings: { planControls: { enabledSubjects: { a: 1 } } } }],
  ];

  hostileInputs.forEach(([label, input]) => {
    it(`falls back to a complete state for ${label}`, () => {
      const state = migrateState(input);
      assertStateShape(state);
    });
  });

  it('accepts a state that was already migrated without dropping containers', () => {
    const once = migrateState({ entries: { [PLAN_START_DATE]: { minutes: 120 } } });
    const twice = migrateState(once);
    assertStateShape(twice);
    expect(twice.entries[PLAN_START_DATE]).toBeDefined();
  });
});

describe('state rules: migrateState settings migration', () => {
  it('promotes legacy snake_case settings onto their camelCase fields', () => {
    const state = migrateState({
      settings: {
        efficiencyModeApplied: true,
        weekday_minutes: 240,
        weekend_minutes: 400,
        task_count: 4,
        core_ratio: 70,
      },
    });
    expect(state.settings.weekdayMinutes).toBe(240);
    expect(state.settings.weekendMinutes).toBe(400);
    expect(state.settings.taskCount).toBe(4);
    expect(state.settings.coreRatio).toBe(70);
  });

  it('prefers an explicit camelCase value over the legacy snake_case one', () => {
    const state = migrateState({ settings: { weekdayMinutes: 300, weekday_minutes: 120 } });
    expect(state.settings.weekdayMinutes).toBe(300);
  });

  it('downgrades a four-task plan to three on the first efficiency migration', () => {
    const state = migrateState({ settings: { taskCount: 4, density: 'balanced' } });
    expect(state.settings.taskCount).toBe(3);
    expect(state.settings.density).toBe('balanced');
    expect(state.settings.efficiencyModeApplied).toBe(true);
  });

  it('clamps out-of-range numbers instead of trusting the stored value', () => {
    const low = migrateState({ settings: { weekdayMinutes: 5, coreRatio: 1 } });
    expect(low.settings.weekdayMinutes).toBe(60);
    expect(low.settings.coreRatio).toBe(55);
    const high = migrateState({ settings: { efficiencyModeApplied: true, weekdayMinutes: 9999, taskCount: 99, coreRatio: 100 } });
    expect(high.settings.weekdayMinutes).toBe(720);
    // taskCount is bounded to 3 or 4, so an absurd value cannot widen the day.
    expect(high.settings.taskCount).toBe(4);
    expect(high.settings.coreRatio).toBe(85);
  });

  it('falls back to a known density and a usable exam date', () => {
    const state = migrateState({ settings: { density: 'chaotic', targetExamDate: 'not-a-date' } });
    expect(state.settings.density).toBe('balanced');
    expect(state.settings.targetExamDate).toBe(DEFAULT_EXAM_DATE);
  });

  it('moves settings-scoped project, resources and custom tasks to the top level', () => {
    const state = migrateState({
      settings: {
        project: { stageOne: 1, updatedAt: '2026-09-01T00:00:00.000Z' },
        resources: { math: 40 },
        customTasks: [{ id: 'c1', subject: '复盘', text: '回看错题', minutes: 30 }],
      },
    });
    expect(state.project.stageOne).toBe(true);
    expect(state.project.updatedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(state.resources).toEqual({ math: 40 });
    expect(state.customTasks).toHaveLength(1);
    expect(state.customTasks[0].text).toBe('回看错题');
  });

  it('drops project keys that are not safe state keys and marks flags as booleans', () => {
    const state = migrateState({ project: { __proto__: 1, constructor: 1, keepMe: 'yes', dropMe: 0 } });
    expect(Object.keys(state.project).sort()).toEqual(['dropMe', 'keepMe']);
    expect(state.project.keepMe).toBe(true);
    expect(state.project.dropMe).toBe(false);
  });

  it('prefers an explicit top-level field over the settings-scoped legacy copy', () => {
    const state = migrateState({
      project: { fromTop: 'yes' },
      resources: { math: 10 },
      customTasks: [],
      settings: { project: { fromLegacy: 'yes' }, resources: { math: 90 } },
    });
    expect(state.project.fromTop).toBe(true);
    expect(state.project.fromLegacy).toBeUndefined();
    expect(state.resources).toEqual({ math: 10 });
    expect(state.customTasks).toEqual([]);
  });

  it('always stamps the current schema and clean-start version', () => {
    const state = migrateState({ settings: {}, schemaVersion: 1 });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.settings.cleanStartVersion).toBe(CLEAN_START_VERSION);
  });

  it('drops user identity that is not a usable id/email pair', () => {
    const state = migrateState({ user: { id: { nested: true }, email: { nested: true } } });
    expect(state.user).toBeNull();
  });
});

describe('state rules: clean-start boundary', () => {
  it('treats dates before the plan start as out of scope', () => {
    expect(isOnOrAfterPlanStart('2026-08-30')).toBe(false);
    expect(isOnOrAfterPlanStart(PLAN_START_DATE)).toBe(true);
    expect(isOnOrAfterPlanStart('2026-09-01')).toBe(true);
    expect(isOnOrAfterPlanStart('')).toBe(false);
    expect(isOnOrAfterPlanStart('nope')).toBe(false);
  });

  it('archives instead of dropping pre-start records', () => {
    const entries = { '2020-01-01': { minutes: 60 }, [PLAN_START_DATE]: { minutes: 120 } };
    const filtered = filterEntriesFromStart(entries);
    expect(Object.keys(filtered)).toEqual([PLAN_START_DATE]);

    const archive = buildCleanStartArchive({
      entries,
      scores: [],
      weekPlans: {},
      reviewItems: [],
      topics: {},
      topicEvidence: {},
      previousArchive: {},
    });
    expect(archive.version).toBe(CLEAN_START_VERSION);
    expect(archive.startDate).toBe(PLAN_START_DATE);
    expect(archive.counts.entriesBeforeStart).toBe(1);
    expect(archive.entryDates).toContain('2020-01-01');
  });

  it('reuses the original archive timestamp so history is not rewritten', () => {
    const previous = { version: CLEAN_START_VERSION, archivedAt: '2020-05-05T00:00:00.000Z' };
    const archive = buildCleanStartArchive({
      entries: {},
      scores: [],
      weekPlans: {},
      reviewItems: [],
      topics: {},
      topicEvidence: {},
      previousArchive: previous,
    });
    expect(archive.archivedAt).toBe('2020-05-05T00:00:00.000Z');
  });

  it('keeps pre-start totals parked in the archive counter, not in live state', () => {
    const state = migrateState({ entries: { '2019-12-31': { minutes: 90 } } });
    expect(state.entries).toEqual({});
    expect(state.cleanStartArchive.counts.entriesBeforeStart).toBe(1);
  });
});

describe('state rules: date-key parsing', () => {
  it('extracts a leading date from a task id', () => {
    expect(taskIdDate('2026-09-01-math-1')).toBe('2026-09-01');
    expect(taskIdDate('2026-09-01')).toBe('2026-09-01');
    expect(taskIdDate('custom-1')).toBe('');
    expect(taskIdDate({})).toBe('');
  });

  it('flags a date that looks like ISO but is not a real calendar day', () => {
    expect(hasMalformedDatePrefix('2026-02-30')).toBe(true);
    expect(hasMalformedDatePrefix('2026-13-01')).toBe(true);
    expect(hasMalformedDatePrefix('2026-09-01')).toBe(false);
    expect(hasMalformedDatePrefix('custom-1')).toBe(false);
  });

  it('rejects object-coerced values before they can become string dates', () => {
    expect(taskIdDate({ toString: () => '2026-09-01' })).toBe('');
    expect(hasMalformedDatePrefix({ toString: () => '2026-02-30' })).toBe(false);
  });
});

describe('state rules: clean-start task and review filtering', () => {
  it('drops tasks whose id carries a pre-start or impossible date', () => {
    const tasks = {
      '2026-01-01-math': { id: '2026-01-01-math' },
      '2026-09-01-math': { id: '2026-09-01-math' },
      '2026-02-30-math': { id: '2026-02-30-math' },
      'custom-1': { id: 'custom-1' },
    };
    const kept = filterTaskStateFromStart(tasks, {});
    expect(Object.keys(kept).sort()).toEqual(['2026-09-01-math', 'custom-1']);
  });

  it('resolves a task date from the week plan when the id carries none', () => {
    const tasks = { 'custom-1': { id: 'custom-1' } };
    const before = filterTaskStateFromStart(tasks, { '2026-01-01': [{ id: 'custom-1' }] });
    expect(Object.keys(before)).toEqual([]);
    const after = filterTaskStateFromStart(tasks, { [PLAN_START_DATE]: [{ id: 'custom-1' }] });
    expect(Object.keys(after)).toEqual(['custom-1']);
  });

  it('returns an empty map instead of throwing on a non-object task container', () => {
    expect(filterTaskStateFromStart(null, {})).toEqual({});
    expect(filterTaskStateFromStart('x', {})).toEqual({});
  });

  it('drops reviews that are out of scope or malformed but keeps the rest', () => {
    const items = [
      { id: 'r1', dueDate: '2026-01-01' },
      { id: 'r2', dueDate: PLAN_START_DATE },
      { id: 'r3', dueDate: '2026-02-30' },
      { id: 'r4', due_date: '2026-12-01' },
      'not-an-item',
    ];
    const kept = filterReviewItemsFromStart(items).map((item) => item.id);
    expect(kept).toEqual(['r2', 'r4']);
  });

  it('filters deleted ids by their own embedded date', () => {
    const filtered = filterDeletedFromStart({
      records: ['2026-01-01', PLAN_START_DATE],
      scores: ['any-score-is-kept'],
      tasks: ['2026-01-01-math', '2026-09-01-math', '2026-02-30-math', 'custom-1'],
      reviews: ['2026-01-01-r', '2026-09-01-r'],
    });
    expect(filtered.records).toEqual([PLAN_START_DATE]);
    expect(filtered.scores).toEqual(['any-score-is-kept']);
    expect(filtered.tasks).toEqual(['2026-09-01-math', 'custom-1']);
    expect(filtered.reviews).toEqual(['2026-09-01-r']);
  });
});

describe('state rules: tombstones', () => {
  it('unions local and cloud tombstones without duplicates', () => {
    const merged = mergeDeletedTombstones(
      { records: ['a'], scores: ['s1'], tasks: [], reviews: [] },
      { records: ['a', 'b'], scores: [], tasks: ['t1'], reviews: [] },
    );
    DELETED_TYPES.forEach((type) => expect(Array.isArray(merged[type])).toBe(true));
    expect(merged.records.sort()).toEqual(['a', 'b']);
    expect(merged.tasks).toEqual(['t1']);
  });

  it('keeps the tombstone timestamp only for ids that are still tombstoned', () => {
    const meta = mergeDeletedTombstoneMeta(
      { records: { a: '2026-09-01T00:00:00.000Z' }, scores: {}, tasks: {}, reviews: {} },
      { records: { b: '2026-09-02T00:00:00.000Z' }, scores: {}, tasks: {}, reviews: {} },
      { records: ['a', 'b'], scores: [], tasks: [], reviews: [] },
    );
    expect(meta.records.a).toBe('2026-09-01T00:00:00.000Z');
    expect(meta.records.b).toBe('2026-09-02T00:00:00.000Z');

    const dropped = mergeDeletedTombstoneMeta(
      { records: { a: '2026-09-01T00:00:00.000Z' }, scores: {}, tasks: {}, reviews: {} },
      {},
      { records: [], scores: [], tasks: [], reviews: [] },
    );
    expect(dropped.records).toEqual({});
  });

  it('lets a row recreated after its tombstone win, and drops an older one', () => {
    const meta = { records: { d1: '2026-09-10T00:00:00.000Z' } };
    expect(shouldApplyTombstone(meta, 'records', 'd1', '2026-09-09T00:00:00.000Z')).toBe(true);
    expect(shouldApplyTombstone(meta, 'records', 'd1', '2026-09-11T00:00:00.000Z')).toBe(false);
    expect(shouldApplyTombstone(meta, 'records', 'd1', '')).toBe(true);
  });

  it('removes tombstoned rows and clears the tombstone when the row came back newer', () => {
    const base = freshState();
    base.entries = {
      d1: { minutes: 60, updatedAt: '2026-09-01T00:00:00.000Z' },
      d2: { minutes: 60, updatedAt: '2026-09-20T00:00:00.000Z' },
    };
    base.deleted = { ...base.deleted, records: ['d1', 'd2'] };
    base.deletedMeta = {
      ...base.deletedMeta,
      records: {
        d1: '2026-09-10T00:00:00.000Z',
        d2: '2026-09-10T00:00:00.000Z',
      },
    };
    const result = applyTombstones(base);
    expect(result.entries.d1).toBeUndefined();
    expect(result.entries.d2).toBeDefined();
    expect(result.deleted.records).toEqual(['d1']);
    expect(result.deletedMeta.records.d2).toBeUndefined();
  });

  it('normalizes tombstone containers even when they arrive malformed', () => {
    const result = applyTombstones({ entries: 'x', deleted: 'x', deletedMeta: 7 });
    DELETED_TYPES.forEach((type) => {
      expect(Array.isArray(result.deleted[type])).toBe(true);
      expect(result.deletedMeta[type]).toBeTypeOf('object');
    });
  });

  it('rejects state keys that could poison the prototype chain', () => {
    expect(safeStateKey('__proto__')).toBe('');
    expect(safeStateKey('constructor')).toBe('');
    expect(safeStateKey('prototype')).toBe('');
    expect(safeStateKey('  ok-key  ')).toBe('ok-key');
    expect(firstSafeStateKey(['__proto__', 'real'])).toBe('real');
  });

  it('only keeps deleted ids that pass key sanitising', () => {
    const deleted = sanitizeDeleted({
      records: ['2026-09-01', 'not-a-date'],
      scores: ['s1', '__proto__', ''],
      tasks: ['2026-09-01-math'],
      reviews: null,
    });
    expect(deleted.records).toEqual(['2026-09-01']);
    expect(deleted.scores).toEqual(['s1']);
    expect(deleted.tasks).toEqual(['2026-09-01-math']);
    expect(deleted.reviews).toEqual([]);
    const meta = sanitizeDeletedMeta({ scores: { s1: '2026-09-01T00:00:00.000Z', s2: 'nope' } }, deleted);
    expect(Object.keys(meta.scores)).toEqual(['s1']);
  });
});

describe('state rules: merge layer', () => {
  it('lets the newer row win when both sides carry the same id', () => {
    const merged = mergeArrayById(
      [{ id: 'a', date: '2026-09-01', value: 'local', updatedAt: '2026-09-01T00:00:00.000Z' }],
      [{ id: 'a', date: '2026-09-01', value: 'cloud', updatedAt: '2026-09-05T00:00:00.000Z' }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('cloud');
  });

  it('skips rows without a usable identity instead of merging them under one key', () => {
    const merged = mergeArrayById([{ value: 'no id' }, { id: '  ', value: 'blank' }], []);
    expect(merged).toEqual([]);
  });
});

describe('state rules: scalar hardening', () => {
  it('caps identity text and refuses object-coerced values', () => {
    expect(sanitizeUserText('a@b.com', 254)).toBe('a@b.com');
    expect(sanitizeUserText({ toString: () => 'a@b.com' }, 254)).toBe('');
    // Over-length identity is rejected outright rather than silently truncated,
    // so a malformed email can never be stored as a valid-looking prefix.
    expect(sanitizeUserText('x'.repeat(300), 254)).toBe('');
    expect(sanitizeUserText('x'.repeat(254), 254)).toHaveLength(254);
  });

  it('only builds a user record from usable fields', () => {
    expect(sanitizeUser({ id: 'u1', email: 'a@b.com' })).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(sanitizeUser({ id: '', email: '' })).toBeNull();
    expect(sanitizeUser(null)).toBeNull();
    expect(sanitizeUser({ id: { a: 1 } })).toBeNull();
  });

  it('normalizes ratios from both 0-1 and 0-100 inputs', () => {
    expect(normalizeRatio(0.5)).toBe(0.5);
    expect(normalizeRatio(50)).toBe(0.5);
    expect(normalizeRatio('nonsense')).toBe(0);
  });

  it('only accepts a real timestamp', () => {
    expect(normalizeTimestamp('2026-09-01T00:00:00.000Z')).toBe('2026-09-01T00:00:00.000Z');
    expect(normalizeTimestamp('nope', 'fallback')).toBe('fallback');
    expect(normalizeTimestamp({}, 'fallback')).toBe('fallback');
  });

  it('caps snapshots and always gives them a usable reason', () => {
    const rows = Array.from({ length: 12 }, (unused, index) => ({ reason: 'manual', createdAt: `2026-09-0${Math.min(index + 1, 9)}T00:00:00.000Z` }));
    expect(sanitizeSnapshots(rows)).toHaveLength(5);
    expect(sanitizeSnapshots('x')).toEqual([]);
    // Any safe label survives; only unusable or prototype-poisoning values fall back.
    expect(sanitizeSnapshotReason('who-knows')).toBe('who-knows');
    expect(sanitizeSnapshotReason('')).toBe('manual');
    expect(sanitizeSnapshotReason({})).toBe('manual');
    expect(sanitizeSnapshotReason('__proto__')).toBe('manual');
  });

  it('sanitizes a task into its stored shape', () => {
    const task = sanitizeTask(
      {
        id: '2026-09-01-math-1',
        subject: '数学一',
        text: '极限专项',
        minutes: '90',
        status: 'done',
        locked: 'yes',
        priority: 2,
      },
      '2026-09-01',
      0,
    );
    expect(task.id).toBe('2026-09-01-math-1');
    expect(task.date).toBe('2026-09-01');
    expect(task.minutes).toBe(90);
    expect(task.status).toBe('done');
    expect(task.locked).toBe(true);
    expect(task.priority).toBe(2);
  });

  it('falls back to a status the UI knows and clamps task minutes', () => {
    const task = sanitizeTask({ status: 'invented', minutes: 9999 }, '2026-09-01', 3);
    expect(task.status).toBe('todo');
    expect(task.minutes).toBe(240);
    expect(task.id).toBe('2026-09-01-3');
  });
});

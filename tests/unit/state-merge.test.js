/**
 * @vitest-environment jsdom
 *
 * Behavioural coverage for the cloud-merge layer of `src/app.js`.
 *
 * These are the rules that decide which side wins when a local browser state
 * meets a cloud copy: they are the correctness core of sync, and before this
 * file they had no direct coverage at all (the merge helpers were only reached
 * indirectly, or asserted as source text).
 *
 * `markDeleted` / `unmarkDeleted` are intentionally absent: they mutate the
 * module-private `state` singleton and never persist on their own, so nothing
 * on the exported surface can observe them. They are exercised through the DOM
 * flows that call them (record save, task delete, score delete) instead.
 */
import { describe, expect, it } from 'vitest';
import {
  applyTombstones,
  mergeCustomTasks,
  mergeObjectsByUpdatedAt,
  mergeSettingsByVersionedAssets,
  mergeStateByUpdatedAt,
  mergeTopicState,
  mergeVersionedObject,
  mergeWeekPlans,
  pruneTombstone,
} from '../../src/app.js';

describe('merge: per-record newest wins', () => {
  it('takes the cloud row when it is strictly newer', () => {
    const merged = mergeObjectsByUpdatedAt(
      { '2026-09-01': { minutes: 10, updatedAt: '2026-09-01T00:00:00.000Z' } },
      { '2026-09-01': { minutes: 99, updatedAt: '2026-09-02T00:00:00.000Z' } }
    );

    expect(merged['2026-09-01'].minutes).toBe(99);
  });

  it('keeps the local row when it is newer', () => {
    const merged = mergeObjectsByUpdatedAt(
      { '2026-09-01': { minutes: 10, updatedAt: '2026-09-03T00:00:00.000Z' } },
      { '2026-09-01': { minutes: 99, updatedAt: '2026-09-02T00:00:00.000Z' } }
    );

    expect(merged['2026-09-01'].minutes).toBe(10);
  });

  it('lets the cloud row win a tie so a re-pull is idempotent', () => {
    const at = '2026-09-02T00:00:00.000Z';
    const merged = mergeObjectsByUpdatedAt(
      { key: { side: 'local', updatedAt: at } },
      { key: { side: 'cloud', updatedAt: at } }
    );

    expect(merged.key.side).toBe('cloud');
  });

  it('keeps dates that only one side knows about', () => {
    const merged = mergeObjectsByUpdatedAt(
      { localOnly: { updatedAt: '2026-09-01T00:00:00.000Z' } },
      { cloudOnly: { updatedAt: '2026-09-01T00:00:00.000Z' } }
    );

    expect(Object.keys(merged).sort()).toEqual(['cloudOnly', 'localOnly']);
  });

  it('refuses keys that could poison the prototype chain', () => {
    const merged = mergeObjectsByUpdatedAt({}, {
      __proto__: { polluted: true },
      constructor: { polluted: true },
      prototype: { polluted: true },
      safe: { value: 1 },
    });

    expect(Object.keys(merged)).toEqual(['safe']);
    expect({}.polluted).toBeUndefined();
  });

  it('ignores cloud entries that are not plain objects', () => {
    const merged = mergeObjectsByUpdatedAt({}, { list: [1, 2, 3], text: 'nope', ok: { value: 1 } });

    expect(Object.keys(merged)).toEqual(['ok']);
  });

  it('adopts a cloud row when the local slot holds a non-object', () => {
    const merged = mergeObjectsByUpdatedAt({ key: 'scalar' }, { key: { value: 1 } });

    expect(merged.key).toEqual({ value: 1 });
  });

  it('treats an unparseable timestamp as the oldest value', () => {
    const merged = mergeObjectsByUpdatedAt(
      { key: { side: 'local', updatedAt: 'not-a-date' } },
      { key: { side: 'cloud', updatedAt: '2026-09-02T00:00:00.000Z' } }
    );

    expect(merged.key.side).toBe('cloud');
  });
});

describe('merge: versioned object', () => {
  it('takes the newer whole object rather than merging field by field', () => {
    const merged = mergeVersionedObject(
      { a: 1, b: 2, updatedAt: '2026-09-01T00:00:00.000Z' },
      { a: 9, updatedAt: '2026-09-02T00:00:00.000Z' }
    );

    expect(merged).toEqual({ a: 9, updatedAt: '2026-09-02T00:00:00.000Z' });
    expect(merged.b).toBeUndefined();
  });

  it('prefers an explicit version stamp over the embedded updatedAt', () => {
    const merged = mergeVersionedObject(
      { side: 'local', updatedAt: '2026-09-09T00:00:00.000Z' },
      { side: 'cloud', updatedAt: '2026-09-09T00:00:00.000Z' },
      '2026-09-01T00:00:00.000Z',
      '2026-09-05T00:00:00.000Z'
    );

    expect(merged.side).toBe('cloud');
  });

  it('field-merges when neither side carries a version', () => {
    const merged = mergeVersionedObject({ a: 1 }, { b: 2 });

    expect(merged).toEqual({ a: 1, b: 2 });
  });
});

describe('merge: week plans', () => {
  it('unions the dates and merges each day by id', () => {
    const merged = mergeWeekPlans(
      { '2026-09-01': [{ id: 'a', title: 'local-a', updatedAt: '2026-09-01T00:00:00.000Z' }] },
      {
        '2026-09-01': [{ id: 'a', title: 'cloud-a', updatedAt: '2026-09-02T00:00:00.000Z' }],
        '2026-09-02': [{ id: 'b', title: 'cloud-b', updatedAt: '2026-09-02T00:00:00.000Z' }],
      }
    );

    expect(Object.keys(merged).sort()).toEqual(['2026-09-01', '2026-09-02']);
    expect(merged['2026-09-01']).toHaveLength(1);
    expect(merged['2026-09-01'][0].title).toBe('cloud-a');
    expect(merged['2026-09-02'][0].title).toBe('cloud-b');
  });

  it('always produces an array per date, even when one side is missing', () => {
    const merged = mergeWeekPlans({ '2026-09-01': undefined }, { '2026-09-01': [{ id: 'x' }] });

    expect(Array.isArray(merged['2026-09-01'])).toBe(true);
    expect(merged['2026-09-01']).toHaveLength(1);
  });
});

describe('merge: settings and versioned assets', () => {
  it('lets the newer side own the asset timestamp pair', () => {
    const merged = mergeSettingsByVersionedAssets(
      { settings: { density: 'focus', resourcesUpdatedAt: '2026-09-01T00:00:00.000Z' } },
      { settings: { density: 'detail', resourcesUpdatedAt: '2026-09-05T00:00:00.000Z' } }
    );

    expect(merged.resourcesUpdatedAt).toBe('2026-09-05T00:00:00.000Z');
    expect(merged.density).toBe('detail');
  });

  it('keeps the local asset timestamp when it is newer', () => {
    const merged = mergeSettingsByVersionedAssets(
      { settings: { resourcesUpdatedAt: '2026-09-09T00:00:00.000Z' } },
      { settings: { resourcesUpdatedAt: '2026-09-05T00:00:00.000Z' } }
    );

    expect(merged.resourcesUpdatedAt).toBe('2026-09-09T00:00:00.000Z');
  });

  it('takes the versioned side wholesale for custom tasks, not a per-id merge', () => {
    const merged = mergeCustomTasks(
      {
        settings: { customTasksUpdatedAt: '2026-09-01T00:00:00.000Z' },
        customTasks: [{ id: 'local-only', title: 'local' }],
      },
      {
        settings: { customTasksUpdatedAt: '2026-09-05T00:00:00.000Z' },
        customTasks: [{ id: 'cloud-only', title: 'cloud' }],
      }
    );

    expect(merged.map((task) => task.id)).toEqual(['cloud-only']);
  });

  it('falls back to an id merge when neither side is versioned', () => {
    const merged = mergeCustomTasks(
      { customTasks: [{ id: 'a', title: 'local-a' }] },
      { customTasks: [{ id: 'a', title: 'cloud-a', updatedAt: '2026-09-02T00:00:00.000Z' }, { id: 'b' }] }
    );

    expect(merged.map((task) => task.id).sort()).toEqual(['a', 'b']);
    expect(merged.find((task) => task.id === 'a').title).toBe('cloud-a');
  });
});

describe('merge: topic state', () => {
  it('ignores the cloud copy entirely when the cloud has not clean-started', () => {
    const merged = mergeTopicState(
      { topics: { t1: { status: 'mastered' } }, topicEvidence: { t1: { updatedAt: '2026-09-01T00:00:00.000Z' } } },
      { topics: { t1: { status: 'todo' }, t2: { status: 'mastered' } }, topicEvidence: {} },
      false
    );

    expect(Object.keys(merged.topics)).toEqual(['t1']);
    expect(merged.topics.t1.status).toBe('mastered');
    expect(merged.topics.t2).toBeUndefined();
  });

  it('picks the newer side per topic once the cloud has clean-started', () => {
    const merged = mergeTopicState(
      {
        topics: { t1: { status: 'local' }, t2: { status: 'local' } },
        topicEvidence: {
          t1: { updatedAt: '2026-09-01T00:00:00.000Z' },
          t2: { updatedAt: '2026-09-09T00:00:00.000Z' },
        },
      },
      {
        topics: { t1: { status: 'cloud' }, t2: { status: 'cloud' } },
        topicEvidence: {
          t1: { updatedAt: '2026-09-05T00:00:00.000Z' },
          t2: { updatedAt: '2026-09-02T00:00:00.000Z' },
        },
      },
      true
    );

    expect(merged.topics.t1.status).toBe('cloud');
    expect(merged.topics.t2.status).toBe('local');
  });

  it('prefers the cloud side for a topic only the cloud has seen', () => {
    const merged = mergeTopicState(
      { topics: {}, topicEvidence: {} },
      { topics: { fresh: { status: 'cloud' } }, topicEvidence: {} },
      true
    );

    expect(merged.topics.fresh.status).toBe('cloud');
  });

  it('keeps evidence and status from the same winning side', () => {
    const merged = mergeTopicState(
      {
        topics: { t: { status: 'local' } },
        topicEvidence: { t: { updatedAt: '2026-09-09T00:00:00.000Z', note: 'local-evidence' } },
      },
      {
        topics: { t: { status: 'cloud' } },
        topicEvidence: { t: { updatedAt: '2026-09-01T00:00:00.000Z', note: 'cloud-evidence' } },
      },
      true
    );

    expect(merged.topics.t.status).toBe('local');
    expect(merged.topicEvidence.t.note).toBe('local-evidence');
  });
});

describe('merge: whole-state entry point', () => {
  const localState = () => ({
    settings: { density: 'balanced' },
    entries: { '2026-09-01': { math: 10, updatedAt: '2026-09-01T00:00:00.000Z' } },
    scores: [{ id: 's1', total: 100, updatedAt: '2026-09-01T00:00:00.000Z' }],
    reviewItems: [],
    tasks: { '2026-09-01': { id: 't1' } },
    weekPlans: { '2026-09-01': [{ id: 't1', title: 'local', updatedAt: '2026-09-01T00:00:00.000Z' }] },
    customTasks: [],
    project: { name: 'local' },
    resources: { r1: { updatedAt: '2026-09-01T00:00:00.000Z', value: 'local' } },
    topics: {},
    topicEvidence: {},
    deleted: { records: [], scores: [], tasks: [], reviews: [] },
    deletedMeta: { records: {}, scores: {}, tasks: {}, reviews: {} },
    sync: { status: 'local' },
    user: null,
  });

  it('lets the newer record win and keeps the untouched containers', () => {
    const merged = mergeStateByUpdatedAt(localState(), {
      entries: { '2026-09-01': { math: 55, updatedAt: '2026-09-05T00:00:00.000Z' } },
    });

    expect(merged.entries['2026-09-01'].math).toBe(55);
    expect(merged.settings.density).toBe('balanced');
  });

  it('applies tombstones carried by the cloud copy so a deleted row does not come back', () => {
    const merged = mergeStateByUpdatedAt(localState(), {
      entries: {},
      deleted: { records: ['2026-09-01'], scores: [], tasks: [], reviews: [] },
      deletedMeta: { records: { '2026-09-01': '2026-09-06T00:00:00.000Z' }, scores: {}, tasks: {}, reviews: {} },
    });

    expect(merged.entries['2026-09-01']).toBeUndefined();
  });

  it('keeps a row that was recreated after its tombstone', () => {
    const merged = mergeStateByUpdatedAt(localState(), {
      deleted: { records: ['2026-09-01'], scores: [], tasks: [], reviews: [] },
      deletedMeta: { records: { '2026-09-01': '2026-08-31T00:00:00.000Z' }, scores: {}, tasks: {}, reviews: {} },
    });

    expect(merged.entries['2026-09-01']).toBeDefined();
  });

  it('is idempotent: merging the same cloud copy twice changes nothing', () => {
    const cloud = {
      entries: { '2026-09-01': { math: 55, updatedAt: '2026-09-05T00:00:00.000Z' } },
    };
    const once = mergeStateByUpdatedAt(localState(), cloud);
    const twice = mergeStateByUpdatedAt(once, cloud);

    expect(twice.entries).toEqual(once.entries);
  });
});

describe('tombstone pruning', () => {
  it('removes the id and its stamp so a recreated row is not deleted again', () => {
    const next = {
      deleted: { records: ['2026-09-01', '2026-09-02'], scores: [], tasks: [], reviews: [] },
      deletedMeta: { records: { '2026-09-01': 'x', '2026-09-02': 'y' }, scores: {}, tasks: {}, reviews: {} },
    };

    pruneTombstone(next, 'records', '2026-09-01');

    expect(next.deleted.records).toEqual(['2026-09-02']);
    expect(next.deletedMeta.records['2026-09-01']).toBeUndefined();
    expect(next.deletedMeta.records['2026-09-02']).toBe('y');
  });

  it('tolerates a missing or malformed deleted container', () => {
    expect(() => pruneTombstone({}, 'records', 'x')).not.toThrow();
    expect(() => pruneTombstone({ deleted: { records: 'not-an-array' } }, 'records', 'x')).not.toThrow();
  });

  it('leaves a pruned row in place when tombstones are applied afterwards', () => {
    const next = {
      entries: { '2026-09-01': { updatedAt: '2026-09-01T00:00:00.000Z' } },
      deleted: { records: ['2026-09-01'], scores: [], tasks: [], reviews: [] },
      deletedMeta: { records: { '2026-09-01': '2026-09-09T00:00:00.000Z' }, scores: {}, tasks: {}, reviews: {} },
    };

    pruneTombstone(next, 'records', '2026-09-01');
    applyTombstones(next);

    expect(next.entries['2026-09-01']).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  desensitizeData,
  validateShowcaseItem
} from '../../src/domain/project-showcase.js';
import { pushDirtyRecords, resolveConflict } from '../../src/infrastructure/sync-service.js';
import { OfflineCache } from '../../src/infrastructure/offline-cache.js';

// Sync properties below run against the real sync-service implementation.
// Earlier revisions of this file inlined local copies of resolveConflict and
// "sync error preserves dirty" helpers and asserted against those copies,
// which proved nothing about shipped code.

// ─── Property 26: Sync conflict resolution — last write wins ───

/**
 * Property 26: Sync conflict resolution — last write wins
 * **Validates: Requirements 8.3**
 *
 * For any two records with different updated_at, the one with the later
 * timestamp wins and the other is returned as the loser. Ties, and a local
 * record whose updated_at cannot be parsed, resolve in favour of remote
 * (server authority).
 */
describe('Property 26: Sync conflict resolution — last write wins', () => {
  // Use integer timestamps to avoid Invalid Date issues
  const minTs = new Date('2020-01-01').getTime();
  const maxTs = new Date('2035-12-31').getTime();
  const arbIsoString = fc
    .integer({ min: minTs, max: maxTs })
    .map((ts) => new Date(ts).toISOString());

  const arbRecord = fc.record({
    id: fc.string({ minLength: 1 }),
    data: fc.string(),
    updated_at: arbIsoString
  });

  test.prop([arbRecord, arbRecord])(
    'the record with later updated_at is always the winner',
    (local, remote) => {
      // Ensure they have different timestamps
      fc.pre(local.updated_at !== remote.updated_at);

      const { winner, loser } = resolveConflict(local, remote);

      const localTime = new Date(local.updated_at).getTime();
      const remoteTime = new Date(remote.updated_at).getTime();

      if (localTime > remoteTime) {
        expect(winner).toBe(local);
        expect(loser).toBe(remote);
      } else {
        expect(winner).toBe(remote);
        expect(loser).toBe(local);
      }
    }
  );

  const arbTimestampMs = fc.integer({ min: minTs, max: maxTs - 86400000 * 365 });

  test.prop([arbRecord, arbTimestampMs, fc.nat({ max: 86400000 * 365 })])(
    'winner always has a timestamp >= loser timestamp',
    (baseRecord, baseTimestampMs, offsetMs) => {
      fc.pre(offsetMs > 0);
      const baseDate = new Date(baseTimestampMs);
      const earlier = baseDate.toISOString();
      const later = new Date(baseDate.getTime() + offsetMs).toISOString();

      const local = { ...baseRecord, updated_at: earlier };
      const remote = { ...baseRecord, id: baseRecord.id + '_r', updated_at: later };

      const { winner, loser } = resolveConflict(local, remote);
      expect(winner).toBe(remote);
      expect(loser).toBe(local);
      expect(new Date(winner.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(loser.updated_at).getTime()
      );
    }
  );

  test.prop([arbRecord])(
    'identical timestamps are a tie and remote wins by server authority',
    (baseRecord) => {
      const local = { ...baseRecord };
      const remote = { ...baseRecord, id: `${baseRecord.id}_remote` };

      const { winner, loser } = resolveConflict(local, remote);

      expect(winner).toBe(remote);
      expect(loser).toBe(local);
    }
  );

  test.prop([
    arbRecord,
    fc.constantFrom(undefined, null, '', 'not-a-date', '2026-13-45T99:99:99Z')
  ])(
    'an unparseable local updated_at hands the win to remote',
    (remoteRecord, brokenTimestamp) => {
      const local = { ...remoteRecord, updated_at: brokenTimestamp };

      const { winner, loser } = resolveConflict(local, remoteRecord);

      expect(winner).toBe(remoteRecord);
      expect(loser).toBe(local);
    }
  );
});

// ─── Property 27: Sync error preserves dirty state ───

/**
 * Property 27: Sync error preserves dirty state
 * **Validates: Requirements 8.8**
 *
 * When a push fails, dirty records remain marked. These properties drive the
 * real pushDirtyRecords(): a failure must report the affected records as
 * failed, must not report any of them as synced, and must not call
 * OfflineCache.clearDirty — the only place a dirty flag is cleared — so every
 * queued record survives for the next attempt.
 *
 * Scope: covers the failure paths reachable without a live Supabase session
 * (entries that fail normalization, and a non-array payload). The
 * not-configured / not-authenticated / upsert-error paths need a configured
 * client; extend this block once the sync service is wired into production.
 */
describe('Property 27: Sync error preserves dirty state', () => {
  let clearDirty;

  beforeEach(() => {
    OfflineCache.clear();
    clearDirty = vi.spyOn(OfflineCache, 'clearDirty');
  });

  afterEach(() => {
    clearDirty.mockRestore();
  });

  // Entries pushDirtyRecords can never normalize into a valid push: not a
  // plain object, unknown/blank table, blank id, or a record that fails the
  // JSON clone.
  const arbInvalidEntry = fc.oneof(
    fc.constantFrom(undefined, null, true, 42, 'not-an-object', []),
    fc.record({
      table: fc.constantFrom('', '   ', 'not_a_table'),
      id: fc.string({ minLength: 1 }),
      record: fc.constant({})
    }),
    fc.record({
      table: fc.constantFrom('daily_records', 'study_tasks'),
      id: fc.constantFrom('', '   '),
      record: fc.constant({})
    }),
    fc.record({
      table: fc.constantFrom('daily_records', 'study_tasks'),
      id: fc.string({ minLength: 1 }),
      record: fc.constantFrom(null, 'text', 42, [])
    })
  );

  test.prop([fc.array(arbInvalidEntry, { minLength: 1, maxLength: 20 })])(
    'dirty records stay queued after a failed push',
    async (entries) => {
      // Seed a real dirty record. setDirty() reports false when localStorage is
      // unavailable (as in this Node test env), so assert on the queue itself.
      OfflineCache.setDirty('study_tasks', 'task-dirty-1', {
        id: 'task-dirty-1',
        note: 'unsynced local edit'
      });
      const queuedBefore = OfflineCache.getDirtyRecords();
      expect(queuedBefore).toHaveLength(1);

      const result = await pushDirtyRecords(entries);

      expect(result.success).toBe(false);
      expect(result.synced).toEqual([]);
      expect(result.failed).toHaveLength(entries.length);
      expect(result.error).toBeTruthy();
      expect(result.localSaved).toBe(true);
      expect(clearDirty).not.toHaveBeenCalled();
      expect(OfflineCache.getDirtyRecords()).toEqual(queuedBefore);
    }
  );

  test.prop([fc.constantFrom(null, undefined, 42, 'records', { table: 'study_tasks' })])(
    'a non-array payload fails as one invalid key and clears nothing',
    async (payload) => {
      OfflineCache.setDirty('review_items', 'item-dirty-1', { id: 'item-dirty-1' });
      const queuedBefore = OfflineCache.getDirtyRecords();

      const result = await pushDirtyRecords(payload);

      expect(result.success).toBe(false);
      expect(result.synced).toEqual([]);
      expect(result.failed).toEqual(['invalid_table:invalid_id']);
      expect(clearDirty).not.toHaveBeenCalled();
      expect(OfflineCache.getDirtyRecords()).toEqual(queuedBefore);
    }
  );

  test('a push with nothing to send clears no dirty flags', async () => {
    OfflineCache.setDirty('mock_scores', 'score-dirty-1', { id: 'score-dirty-1' });
    const queuedBefore = OfflineCache.getDirtyRecords();

    const result = await pushDirtyRecords([]);

    expect(result).toEqual({ success: true, synced: [], failed: [], localSaved: true });
    expect(clearDirty).not.toHaveBeenCalled();
    expect(OfflineCache.getDirtyRecords()).toEqual(queuedBefore);
  });
});

// ─── Property 28: Showcase data desensitization ───

/**
 * Property 28: Showcase data desensitization
 * **Validates: Requirements 10.1, 10.2, 10.6**
 *
 * For any userData object containing email, phone, real_name, conflicts,
 * retro_text fields, desensitizeData output does NOT contain those fields.
 */
describe('Property 28: Showcase data desensitization', () => {
  const arbUserData = fc.record({
    email: fc.emailAddress(),
    phone: fc.string({ minLength: 5, maxLength: 15 }),
    real_name: fc.string({ minLength: 1, maxLength: 30 }),
    conflicts: fc.array(fc.record({ id: fc.string(), data: fc.string() })),
    retro_text: fc.string({ minLength: 1, maxLength: 200 }),
    // Non-sensitive fields that should be preserved
    user_id: fc.string({ minLength: 1 }),
    display_name: fc.string({ minLength: 1 })
  });

  test.prop([arbUserData])(
    'output does not contain email, phone, or real_name fields',
    (userData) => {
      const result = desensitizeData(userData);
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
      expect(result).not.toHaveProperty('real_name');
    }
  );

  test.prop([arbUserData])(
    'output does not contain conflicts or retro_text fields',
    (userData) => {
      const result = desensitizeData(userData);
      expect(result).not.toHaveProperty('conflicts');
      expect(result).not.toHaveProperty('retro_text');
    }
  );

  test.prop([arbUserData])(
    'non-sensitive fields are preserved',
    (userData) => {
      const result = desensitizeData(userData);
      expect(result.user_id).toBe(userData.user_id);
      expect(result.display_name).toBe(userData.display_name);
    }
  );

  // Test with retrospectives array containing personal text
  const arbUserDataWithRetros = fc.record({
    email: fc.emailAddress(),
    phone: fc.string({ minLength: 5 }),
    real_name: fc.string({ minLength: 1 }),
    retrospectives: fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        text: fc.string({ minLength: 1 }),
        reflection: fc.string(),
        personal_notes: fc.string()
      }),
      { minLength: 1, maxLength: 5 }
    )
  });

  test.prop([arbUserDataWithRetros])(
    'retrospective personal text is redacted',
    (userData) => {
      const result = desensitizeData(userData);
      if (result.retrospectives) {
        for (const retro of result.retrospectives) {
          expect(retro).not.toHaveProperty('text');
          expect(retro).not.toHaveProperty('reflection');
          expect(retro).not.toHaveProperty('personal_notes');
        }
      }
    }
  );
});

// ─── Property 29: Showcase item submission validation ───

/**
 * Property 29: Showcase item submission validation
 * **Validates: Requirements 10.5, 10.6**
 *
 * For any item with < 2 filled fields in {artifact_type, item_date, output_link},
 * validateShowcaseItem returns valid=false. With >= 2, returns valid=true
 * when output_link is a safe absolute http(s) URL if present.
 */
describe('Property 29: Showcase item submission validation', () => {
  const arbNonEmpty = fc.string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);
  const arbEmpty = fc.constantFrom('', null, undefined);
  const arbValidDate = fc
    .integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 11, 31) })
    .map((ts) => new Date(ts).toISOString().slice(0, 10));
  const arbHostLabel = fc.string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(s));
  const arbUrlPath = fc.string({ maxLength: 24 })
    .filter((s) => /^[A-Za-z0-9._~/-]*$/.test(s));
  const arbSafeOutputLink = fc
    .tuple(fc.constantFrom('http', 'https'), arbHostLabel, arbUrlPath)
    .map(([protocol, hostLabel, path]) => `${protocol}://${hostLabel}.example.com/${path}`);
  const arbUnsafeOutputLink = fc.oneof(
    fc.constantFrom('javascript:alert(1)', '/relative/path', '//example.com/path', 'data:text/html,<script>alert(1)</script>', 'ftp://example.com/file'),
    fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0 && !/^https?:\/\//i.test(s))
  );

  // Items with 0 filled fields → invalid
  test.prop([arbEmpty, arbEmpty, arbEmpty])(
    'returns valid=false when 0 fields are filled',
    (artifactType, itemDate, outputLink) => {
      const item = {
        artifact_type: artifactType,
        item_date: itemDate,
        output_link: outputLink
      };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(false);
    }
  );

  // Items with exactly 1 filled field → invalid
  test.prop([arbNonEmpty])(
    'returns valid=false when only artifact_type is filled',
    (artifactType) => {
      const item = { artifact_type: artifactType, item_date: '', output_link: '' };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(false);
    }
  );

  test.prop([arbNonEmpty])(
    'returns valid=false when only item_date is filled',
    (itemDate) => {
      const item = { artifact_type: '', item_date: itemDate, output_link: '' };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(false);
    }
  );

  test.prop([arbSafeOutputLink])(
    'returns valid=false when only output_link is filled',
    (outputLink) => {
      const item = { artifact_type: '', item_date: '', output_link: outputLink };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(false);
    }
  );

  // Items with exactly 2 filled fields → valid
  test.prop([arbNonEmpty, arbValidDate])(
    'returns valid=true when artifact_type and item_date are filled',
    (artifactType, itemDate) => {
      const item = { artifact_type: artifactType, item_date: itemDate, output_link: '' };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  test.prop([arbNonEmpty, arbSafeOutputLink])(
    'returns valid=true when artifact_type and output_link are filled',
    (artifactType, outputLink) => {
      const item = { artifact_type: artifactType, item_date: '', output_link: outputLink };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  test.prop([arbValidDate, arbSafeOutputLink])(
    'returns valid=true when item_date and output_link are filled',
    (itemDate, outputLink) => {
      const item = { artifact_type: '', item_date: itemDate, output_link: outputLink };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  // Items with all 3 filled fields → valid
  test.prop([arbNonEmpty, arbValidDate, arbSafeOutputLink])(
    'returns valid=true when all 3 fields are filled',
    (artifactType, itemDate, outputLink) => {
      const item = {
        artifact_type: artifactType,
        item_date: itemDate,
        output_link: outputLink
      };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  test.prop([arbNonEmpty, arbValidDate, arbUnsafeOutputLink])(
    'returns valid=false when an unsafe output_link is supplied',
    (artifactType, itemDate, outputLink) => {
      const item = {
        artifact_type: artifactType,
        item_date: itemDate,
        output_link: outputLink
      };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(false);
    }
  );
});

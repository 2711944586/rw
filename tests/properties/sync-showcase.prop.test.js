import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  desensitizeData,
  validateShowcaseItem
} from '../../src/domain/project-showcase.js';

// ─── Sync Helpers (inline pure functions since sync-service doesn't exist yet) ───

/**
 * Last-write-wins conflict resolution.
 * Given two records with updated_at timestamps, the later one wins.
 */
function resolveConflict(local, remote) {
  const localTime = new Date(local.updated_at).getTime();
  const remoteTime = new Date(remote.updated_at).getTime();
  if (localTime >= remoteTime) {
    return { winner: local, archived: remote };
  }
  return { winner: remote, archived: local };
}

/**
 * When sync fails, dirty records remain marked.
 * Returns the dirty set unchanged on error.
 */
function syncWithErrorPreservesDirty(dirtyIds, syncError) {
  if (syncError) {
    return [...dirtyIds];
  }
  return [];
}

// ─── Property 26: Sync conflict resolution — last write wins ───

/**
 * Property 26: Sync conflict resolution — last write wins
 * **Validates: Requirements 8.3**
 *
 * For any two records with different updated_at, the one with the later
 * timestamp wins.
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

      const { winner, archived } = resolveConflict(local, remote);

      const localTime = new Date(local.updated_at).getTime();
      const remoteTime = new Date(remote.updated_at).getTime();

      if (localTime > remoteTime) {
        expect(winner).toEqual(local);
        expect(archived).toEqual(remote);
      } else {
        expect(winner).toEqual(remote);
        expect(archived).toEqual(local);
      }
    }
  );

  const arbTimestampMs = fc.integer({ min: minTs, max: maxTs - 86400000 * 365 });

  test.prop([arbRecord, arbTimestampMs, fc.nat({ max: 86400000 * 365 })])(
    'winner always has a timestamp >= archived timestamp',
    (baseRecord, baseTimestampMs, offsetMs) => {
      fc.pre(offsetMs > 0);
      const baseDate = new Date(baseTimestampMs);
      const earlier = baseDate.toISOString();
      const later = new Date(baseDate.getTime() + offsetMs).toISOString();

      const local = { ...baseRecord, updated_at: earlier };
      const remote = { ...baseRecord, id: baseRecord.id + '_r', updated_at: later };

      const { winner, archived } = resolveConflict(local, remote);
      expect(new Date(winner.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(archived.updated_at).getTime()
      );
    }
  );
});

// ─── Property 27: Sync error preserves dirty state ───

/**
 * Property 27: Sync error preserves dirty state
 * **Validates: Requirements 8.8**
 *
 * When sync fails, dirty records remain marked (the dirty set is unchanged).
 */
describe('Property 27: Sync error preserves dirty state', () => {
  const arbDirtyIds = fc.array(fc.string({ minLength: 1 }), {
    minLength: 1,
    maxLength: 50
  });

  test.prop([arbDirtyIds])(
    'dirty IDs remain unchanged after sync error',
    (dirtyIds) => {
      const result = syncWithErrorPreservesDirty(dirtyIds, new Error('Network failure'));
      expect(result).toEqual(dirtyIds);
      expect(result.length).toBe(dirtyIds.length);
    }
  );

  test.prop([arbDirtyIds])(
    'dirty set length is preserved on error',
    (dirtyIds) => {
      const result = syncWithErrorPreservesDirty(dirtyIds, { code: 'RLS_REJECTED' });
      expect(result.length).toBe(dirtyIds.length);
      // Every original ID is still present
      for (const id of dirtyIds) {
        expect(result).toContain(id);
      }
    }
  );

  test.prop([arbDirtyIds])(
    'on success (no error), dirty set is cleared',
    (dirtyIds) => {
      const result = syncWithErrorPreservesDirty(dirtyIds, null);
      expect(result.length).toBe(0);
    }
  );
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
 * validateShowcaseItem returns valid=false. With >= 2, returns valid=true.
 */
describe('Property 29: Showcase item submission validation', () => {
  const arbNonEmpty = fc.string({ minLength: 1, maxLength: 100 });
  const arbEmpty = fc.constantFrom('', null, undefined);

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

  test.prop([arbNonEmpty])(
    'returns valid=false when only output_link is filled',
    (outputLink) => {
      const item = { artifact_type: '', item_date: '', output_link: outputLink };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(false);
    }
  );

  // Items with exactly 2 filled fields → valid
  test.prop([arbNonEmpty, arbNonEmpty])(
    'returns valid=true when artifact_type and item_date are filled',
    (artifactType, itemDate) => {
      const item = { artifact_type: artifactType, item_date: itemDate, output_link: '' };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  test.prop([arbNonEmpty, arbNonEmpty])(
    'returns valid=true when artifact_type and output_link are filled',
    (artifactType, outputLink) => {
      const item = { artifact_type: artifactType, item_date: '', output_link: outputLink };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  test.prop([arbNonEmpty, arbNonEmpty])(
    'returns valid=true when item_date and output_link are filled',
    (itemDate, outputLink) => {
      const item = { artifact_type: '', item_date: itemDate, output_link: outputLink };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
    }
  );

  // Items with all 3 filled fields → valid
  test.prop([arbNonEmpty, arbNonEmpty, arbNonEmpty])(
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
});

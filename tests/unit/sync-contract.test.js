import { describe, expect, it } from 'vitest';
import {
  getSyncConflictKey,
  SYNCED_TABLES,
  SYNC_CONFLICT_KEYS,
} from '../../src/infrastructure/sync-contract.js';

describe('sync contract', () => {
  it('matches the user-scoped primary keys in the Supabase schema', () => {
    expect(SYNC_CONFLICT_KEYS).toMatchObject({
      profiles: 'user_id',
      daily_records: 'user_id,study_date',
      study_tasks: 'user_id,id',
      review_items: 'user_id,id',
      topic_progress: 'user_id,topic_id',
      mock_scores: 'user_id,id',
      resources: 'user_id,resource_key',
      source_registry: 'user_id,claim_id',
      project_showcase_items: 'user_id,id',
    });
  });

  it('defines a conflict key for every synced table', () => {
    expect(SYNCED_TABLES.every((table) => getSyncConflictKey(table))).toBe(true);
    expect(getSyncConflictKey('unknown')).toBe('');
  });
});

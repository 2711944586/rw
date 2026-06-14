/**
 * Unit tests for sync-service module — covers resolveConflict (pure function).
 * Network-dependent functions are tested in task 7.3.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { archiveConflict, exportAllData, resolveConflict } from '../../src/infrastructure/sync-service.js';

afterEach(() => {
  vi.doUnmock('../../src/infrastructure/supabase-client.js');
  vi.doUnmock('../../src/infrastructure/offline-cache.js');
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sync-service / resolveConflict', () => {
  it('should pick local as winner when local updated_at is later', () => {
    const local = { id: '1', data: 'local', updated_at: '2025-06-15T10:00:00Z' };
    const remote = { id: '1', data: 'remote', updated_at: '2025-06-15T09:00:00Z' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(local);
    expect(result.loser).toBe(remote);
  });

  it('should pick remote as winner when remote updated_at is later', () => {
    const local = { id: '1', data: 'local', updated_at: '2025-06-15T08:00:00Z' };
    const remote = { id: '1', data: 'remote', updated_at: '2025-06-15T10:00:00Z' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(remote);
    expect(result.loser).toBe(local);
  });

  it('should prefer remote on tie (server authority)', () => {
    const local = { id: '1', data: 'local', updated_at: '2025-06-15T10:00:00Z' };
    const remote = { id: '1', data: 'remote', updated_at: '2025-06-15T10:00:00Z' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(remote);
    expect(result.loser).toBe(local);
  });

  it('should handle ISO date strings with different formats', () => {
    const local = { id: '1', updated_at: '2025-06-15T23:59:59.999Z' };
    const remote = { id: '1', updated_at: '2025-06-16T00:00:00.000Z' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(remote);
    expect(result.loser).toBe(local);
  });

  it('prefers the record with a valid timestamp when the other timestamp is invalid', () => {
    const local = { id: '1', updated_at: '2026-06-09T08:00:00.000Z' };
    const remote = { id: '1', updated_at: 'not-a-date' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(local);
    expect(result.loser).toBe(remote);
  });

  it('still prefers remote when both timestamps are invalid', () => {
    const local = { id: '1', updated_at: '' };
    const remote = { id: '1', updated_at: 'not-a-date' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(remote);
    expect(result.loser).toBe(local);
  });

  it('ignores object-coerced timestamps while resolving conflicts', () => {
    const local = {
      id: '1',
      updated_at: { toString: () => '2026-06-12T00:00:00.000Z' },
    };
    const remote = { id: '1', updated_at: '2026-06-10T00:00:00.000Z' };

    const result = resolveConflict(local, remote);

    expect(result.winner).toBe(remote);
    expect(result.loser).toBe(local);
  });
});

describe('sync-service / exportAllData', () => {
  it('fails fast when user id is missing', async () => {
    await expect(exportAllData()).resolves.toEqual({
      success: false,
      error: 'User ID is required',
    });
  });

  it('fails fast when user id is blank', async () => {
    await expect(exportAllData('   ')).resolves.toEqual({
      success: false,
      error: 'User ID is required',
    });
  });

  it('trims user id, includes profile data, and clears the timeout on success', async () => {
    vi.resetModules();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const tableEq = vi.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null });
    const profileMaybeSingle = vi.fn().mockResolvedValue({ data: { user_id: 'user-1' }, error: null });
    const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));
    const profileSelect = vi.fn(() => ({ eq: profileEq }));
    const tableSelect = vi.fn(() => ({ eq: tableEq }));
    const from = vi.fn((table) => (
      table === 'profiles'
        ? { select: profileSelect }
        : { select: tableSelect }
    ));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn(),
    }));

    const { exportAllData: mockedExportAllData } = await import('../../src/infrastructure/sync-service.js');
    const result = await mockedExportAllData(' user-1 ');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      user_id: 'user-1',
      profile: { user_id: 'user-1' },
      daily_records: [{ id: 'row-1' }],
    });
    expect(tableEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(profileEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('fails when the profile export query fails', async () => {
    vi.resetModules();
    const tableEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Profile unavailable' },
    });
    const from = vi.fn((table) => (
      table === 'profiles'
        ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profileMaybeSingle })) })) }
        : { select: vi.fn(() => ({ eq: tableEq })) }
    ));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn(),
    }));

    const { exportAllData: mockedExportAllData } = await import('../../src/infrastructure/sync-service.js');

    await expect(mockedExportAllData('user-1')).resolves.toEqual({
      success: false,
      error: 'Profile unavailable',
    });
  });

  it('uses a stable fallback when profile export errors are malformed objects', async () => {
    vi.resetModules();
    const tableEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: { bad: true }, code: { bad: true } },
    });
    const from = vi.fn((table) => (
      table === 'profiles'
        ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: profileMaybeSingle })) })) }
        : { select: vi.fn(() => ({ eq: tableEq })) }
    ));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn(),
    }));

    const { exportAllData: mockedExportAllData } = await import('../../src/infrastructure/sync-service.js');
    const result = await mockedExportAllData('user-1');

    expect(result).toEqual({
      success: false,
      error: 'Profile export failed',
    });
    expect(JSON.stringify(result)).not.toContain('[object Object]');
  });
});

describe('sync-service / archiveConflict', () => {
  it('rejects invalid conflict records before Supabase work starts', async () => {
    const circular = { id: '1' };
    circular.self = circular;

    await expect(archiveConflict('unknown_table', 'r1', { id: 'winner' }, { id: 'loser' })).resolves.toEqual({
      success: false,
      error: 'Invalid conflict record',
    });
    await expect(archiveConflict('daily_records', '', { id: 'winner' }, { id: 'loser' })).resolves.toEqual({
      success: false,
      error: 'Invalid conflict record',
    });
    await expect(archiveConflict('daily_records', 'r1', circular, { id: 'loser' })).resolves.toEqual({
      success: false,
      error: 'Invalid conflict record',
    });
  });

  it('normalizes conflict metadata and archives cloned payloads', async () => {
    vi.resetModules();
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { archiveConflict: mockedArchiveConflict } = await import('../../src/infrastructure/sync-service.js');
    const winner = { id: 'winner', nested: { ok: true } };
    const loser = { id: 'loser', nested: { ok: false } };

    const result = await mockedArchiveConflict(' daily_records ', ' rec:1 ', winner, loser);

    winner.nested.ok = false;
    loser.nested.ok = true;

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('conflicts');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      table_name: 'daily_records',
      record_id: 'rec:1',
      winner_payload: { id: 'winner', nested: { ok: true } },
      loser_payload: { id: 'loser', nested: { ok: false } },
    }));
    expect(insert.mock.calls[0][0].resolved_at).toEqual(expect.any(String));
  });

  it('returns a stable authentication error when current-user lookup throws', async () => {
    vi.resetModules();
    const insert = vi.fn();
    const from = vi.fn(() => ({ insert }));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockRejectedValue(new Error('auth unavailable')),
    }));

    const { archiveConflict: mockedArchiveConflict } = await import('../../src/infrastructure/sync-service.js');

    await expect(mockedArchiveConflict('daily_records', 'rec-1', { id: 'winner' }, { id: 'loser' }))
      .resolves.toEqual({
        success: false,
        error: 'Not authenticated',
      });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('sync-service / pullRemoteState', () => {
  it('emits sync:error with failed tables when Supabase is unavailable during pull', async () => {
    vi.resetModules();

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: false,
      supabase: null,
      getCurrentUser: vi.fn(),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pullRemoteState } = await import('../../src/infrastructure/sync-service.js');
      const result = await pullRemoteState();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Supabase not configured');
      expect(result.failed).toContain('daily_records');
      expect(result.failed).toContain('project_showcase_items');
      expect(errorEvents[0]).toMatchObject({
        error: 'Supabase not configured',
        code: 'SUPABASE_NOT_CONFIGURED',
        context: 'pull',
      });
      expect(errorEvents[0].failed).toEqual(result.failed);
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('emits sync:error with failed tables when pull has no authenticated user', async () => {
    vi.resetModules();
    const from = vi.fn();

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue(null),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pullRemoteState } = await import('../../src/infrastructure/sync-service.js');
      const result = await pullRemoteState();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
      expect(result.failed).toContain('daily_records');
      expect(from).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
        context: 'pull',
        failed: result.failed,
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('treats current-user lookup errors as pull authentication failures', async () => {
    vi.resetModules();
    const from = vi.fn();

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockRejectedValue(new Error('auth unavailable')),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pullRemoteState } = await import('../../src/infrastructure/sync-service.js');
      const result = await pullRemoteState();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
      expect(result.failed).toContain('daily_records');
      expect(from).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
        context: 'pull',
        failed: result.failed,
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('returns only serializable object rows from remote table data', async () => {
    vi.resetModules();
    const tableEq = vi.fn((column, userId) => Promise.resolve({
      data: userId === 'user-1'
        ? [{ id: 'row-1' }, null, ['bad'], 'bad-row']
        : [],
      error: null,
    }));
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: tableEq })),
    }));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { pullRemoteState } = await import('../../src/infrastructure/sync-service.js');
    const result = await pullRemoteState();

    expect(result.success).toBe(true);
    expect(result.data.daily_records).toEqual([{ id: 'row-1' }]);
    expect(result.data.study_tasks).toEqual([{ id: 'row-1' }]);
  });

  it('reports failed table names when a remote pull query throws', async () => {
    vi.resetModules();
    const from = vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          if (table === 'review_items') {
            throw new Error('review pull failed');
          }
          return Promise.resolve({ data: [], error: null });
        }),
      })),
    }));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pullRemoteState } = await import('../../src/infrastructure/sync-service.js');
      const result = await pullRemoteState();

      expect(result).toEqual({
        success: false,
        error: 'review pull failed',
        failed: ['review_items'],
      });
      expect(errorEvents[0]).toMatchObject({
        context: 'pull',
        failed: ['review_items'],
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('uses stable pull errors when a remote query throws a malformed object', async () => {
    vi.resetModules();
    const from = vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          if (table === 'review_items') {
            throw { message: { bad: true }, code: { bad: true } };
          }
          return Promise.resolve({ data: [], error: null });
        }),
      })),
    }));

    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pullRemoteState } = await import('../../src/infrastructure/sync-service.js');
      const result = await pullRemoteState();

      expect(result).toEqual({
        success: false,
        error: 'Sync failed',
        failed: ['review_items'],
      });
      expect(errorEvents[0]).toMatchObject({
        error: 'Sync failed',
        code: 'UNKNOWN',
        context: 'pull',
        failed: ['review_items'],
      });
      expect(JSON.stringify(errorEvents[0])).not.toContain('[object Object]');
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });
});

describe('sync-service / pushDirtyRecords', () => {
  it('reports localSaved=false when synced dirty queue cleanup cannot persist', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => false);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn((table) => (table === 'profiles' ? { update } : { upsert }));

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const successEvents = [];
    const handler = (payload) => successEvents.push(payload);
    EventBus.on(EVENTS.SYNC_SUCCESS, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
      ]);

      expect(result).toMatchObject({
        success: true,
        synced: ['daily_records:rec-1'],
        failed: [],
        localSaved: false,
      });
      expect(clearDirty).toHaveBeenCalledWith(['daily_records:rec-1']);
      expect(successEvents[0]).toMatchObject({
        synced: ['daily_records:rec-1'],
        localSaved: false,
      });
    } finally {
      EventBus.off(EVENTS.SYNC_SUCCESS, handler);
    }
  });

  it('reports pending records as failed when Supabase is unavailable', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: false,
      supabase: null,
      getCurrentUser: vi.fn(),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
        { table: 'unknown_table', id: 'rec-x', record: { unsafe: true } },
      ]);

      expect(result).toEqual({
        success: false,
        synced: [],
        failed: ['daily_records:rec-1', 'unknown_table:rec-x'],
        localSaved: true,
        error: 'Supabase not configured',
      });
      expect(clearDirty).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        code: 'SUPABASE_NOT_CONFIGURED',
        failed: ['daily_records:rec-1', 'unknown_table:rec-x'],
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('reports all pending records as failed when the user is not authenticated', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);
    const from = vi.fn();

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue(null),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
        { table: 'study_tasks', id: '', record: { title: 'missing id' } },
      ]);

      expect(result).toEqual({
        success: false,
        synced: [],
        failed: ['daily_records:rec-1', 'study_tasks:invalid_id'],
        localSaved: true,
        error: 'Not authenticated',
      });
      expect(from).not.toHaveBeenCalled();
      expect(clearDirty).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        code: 'NOT_AUTHENTICATED',
        failed: ['daily_records:rec-1', 'study_tasks:invalid_id'],
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('treats current-user lookup errors as push authentication failures', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);
    const from = vi.fn();

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockRejectedValue(new Error('auth unavailable')),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
      ]);

      expect(result).toEqual({
        success: false,
        synced: [],
        failed: ['daily_records:rec-1'],
        localSaved: true,
        error: 'Not authenticated',
      });
      expect(from).not.toHaveBeenCalled();
      expect(clearDirty).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        code: 'NOT_AUTHENTICATED',
        failed: ['daily_records:rec-1'],
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('skips invalid dirty records without touching unknown Supabase tables', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
        { table: 'unknown_table', id: 'rec-x', record: { unsafe: true } },
        { table: 'study_tasks', id: '', record: { title: 'missing id' } },
        { table: 'resources', id: 'bad-record', record: null },
        'not-an-entry',
      ]);

      expect(result).toMatchObject({
        success: false,
        synced: ['daily_records:rec-1'],
        failed: [
          'unknown_table:rec-x',
          'study_tasks:invalid_id',
          'resources:bad-record',
          'invalid_table:invalid_id',
        ],
        localSaved: true,
        error: 'Invalid dirty records skipped',
      });
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith('daily_records');
      expect(from).not.toHaveBeenCalledWith('unknown_table');
      expect(upsert).toHaveBeenCalledWith(
        [{ study_date: '2026-06-09', user_id: 'user-1' }],
        { onConflict: 'user_id,study_date' }
      );
      expect(clearDirty).toHaveBeenCalledWith(['daily_records:rec-1']);
      expect(errorEvents[0]).toMatchObject({
        code: 'INVALID_DIRTY_RECORDS',
        failed: result.failed,
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('normalizes dirty record keys and skips non-serializable records before upsert', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const circular = { study_date: '2026-06-10' };
    circular.self = circular;

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: ' daily_records ', id: ' rec:1 ', record: { study_date: '2026-06-09', minutes: 45 } },
        { table: 'daily_records', id: 'circular', record: circular },
        { table: 'daily_records', id: 'bigint', record: { study_date: '2026-06-11', minutes: BigInt(60) } },
      ]);

      expect(result).toMatchObject({
        success: false,
        synced: ['daily_records:rec:1'],
        failed: ['daily_records:circular', 'daily_records:bigint'],
        localSaved: true,
        error: 'Invalid dirty records skipped',
      });
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith('daily_records');
      expect(upsert).toHaveBeenCalledWith(
        [{ study_date: '2026-06-09', minutes: 45, user_id: 'user-1' }],
        { onConflict: 'user_id,study_date' }
      );
      expect(clearDirty).toHaveBeenCalledWith(['daily_records:rec:1']);
      expect(errorEvents[0]).toMatchObject({
        code: 'INVALID_DIRTY_RECORDS',
        failed: ['daily_records:circular', 'daily_records:bigint'],
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('uses stable push errors when Supabase returns a malformed object error', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);
    const upsert = vi.fn().mockResolvedValue({
      error: { message: { bad: true }, code: { bad: true } },
    });
    const from = vi.fn(() => ({ upsert }));

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
      ]);

      expect(result).toEqual({
        success: false,
        synced: [],
        failed: ['daily_records:rec-1'],
        localSaved: true,
        error: 'Sync failed',
      });
      expect(clearDirty).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        error: 'Sync failed',
        code: 'UNKNOWN',
        failed: ['daily_records:rec-1'],
      });
      expect(JSON.stringify(errorEvents[0])).not.toContain('[object Object]');
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });

  it('returns an error for invalid-only dirty records before Supabase work starts', async () => {
    vi.resetModules();
    const clearDirty = vi.fn(() => true);
    const from = vi.fn();
    const getCurrentUser = vi.fn().mockResolvedValue({ id: 'user-1' });

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty,
        getDirtyRecords: vi.fn(() => []),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: true,
      supabase: { from },
      getCurrentUser,
    }));

    const { EventBus, EVENTS } = await import('../../src/core/event-bus.js');
    const errorEvents = [];
    const handler = (payload) => errorEvents.push(payload);
    EventBus.on(EVENTS.SYNC_ERROR, handler);

    try {
      const { pushDirtyRecords } = await import('../../src/infrastructure/sync-service.js');
      const result = await pushDirtyRecords([
        { table: 'unknown_table', id: 'rec-x', record: { unsafe: true } },
      ]);

      expect(result).toEqual({
        success: false,
        synced: [],
        failed: ['unknown_table:rec-x'],
        localSaved: true,
        error: 'Invalid dirty records skipped',
      });
      expect(getCurrentUser).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
      expect(clearDirty).not.toHaveBeenCalled();
      expect(errorEvents[0]).toMatchObject({
        code: 'INVALID_DIRTY_RECORDS',
        failed: ['unknown_table:rec-x'],
      });
    } finally {
      EventBus.off(EVENTS.SYNC_ERROR, handler);
    }
  });
});

describe('sync-service / syncAll', () => {
  it('stops after a dirty push failure and preserves the push error', async () => {
    vi.resetModules();
    const select = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    const from = vi.fn(() => ({ select }));

    vi.doMock('../../src/infrastructure/offline-cache.js', () => ({
      OfflineCache: {
        clearDirty: vi.fn(() => true),
        getDirtyRecords: vi.fn(() => [
          { table: 'daily_records', id: 'rec-1', record: { study_date: '2026-06-09' } },
        ]),
      },
    }));
    vi.doMock('../../src/infrastructure/supabase-client.js', () => ({
      supabaseConfigured: false,
      supabase: { from },
      getCurrentUser: vi.fn(),
    }));

    const { syncAll } = await import('../../src/infrastructure/sync-service.js');
    const result = await syncAll();

    expect(result).toEqual({
      success: false,
      localSaved: true,
      error: 'Supabase not configured',
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('sync-service / lifecycle', () => {
  it('attaches the online listener only once until destroyed', async () => {
    vi.resetModules();
    const listeners = new Map();
    const fakeWindow = {
      addEventListener: vi.fn((event, handler) => {
        listeners.set(event, handler);
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (listeners.get(event) === handler) listeners.delete(event);
      }),
    };
    vi.stubGlobal('window', fakeWindow);

    const { initSyncService, destroySyncService } = await import('../../src/infrastructure/sync-service.js');

    expect(initSyncService()).toBe(true);
    expect(initSyncService()).toBe(false);
    expect(fakeWindow.addEventListener).toHaveBeenCalledTimes(1);
    expect(fakeWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));

    expect(destroySyncService()).toBe(true);
    expect(destroySyncService()).toBe(false);
    expect(fakeWindow.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listeners.has('online')).toBe(false);

    expect(initSyncService()).toBe(true);
    expect(fakeWindow.addEventListener).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no browser window is available', async () => {
    vi.resetModules();
    vi.unstubAllGlobals();

    const { initSyncService, destroySyncService } = await import('../../src/infrastructure/sync-service.js');

    expect(initSyncService()).toBe(false);
    expect(destroySyncService()).toBe(false);
  });
});

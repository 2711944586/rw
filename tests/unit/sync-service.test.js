/**
 * Unit tests for sync-service module — covers resolveConflict (pure function).
 * Network-dependent functions are tested in task 7.3.
 */

import { describe, it, expect } from 'vitest';
import { resolveConflict } from '../../src/infrastructure/sync-service.js';

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
});

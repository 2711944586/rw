/**
 * Unit tests for the offline-cache module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

import { OfflineCache } from '../../src/infrastructure/offline-cache.js';

describe('OfflineCache', () => {
  beforeEach(() => {
    localStorageMock.clear();
    OfflineCache.clear();
  });

  describe('setDirty', () => {
    it('stores a record in the dirty queue', () => {
      const record = { subject: 'math', minutes: 30 };
      OfflineCache.setDirty('daily_records', 'rec-1', record);

      const dirty = OfflineCache.getDirtyRecords();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].table).toBe('daily_records');
      expect(dirty[0].id).toBe('rec-1');
      expect(dirty[0].record).toEqual(record);
      expect(dirty[0].timestamp).toBeTruthy();
    });

    it('updates local table state', () => {
      const record = { subject: 'english', minutes: 45 };
      OfflineCache.setDirty('daily_records', 'rec-2', record);

      const local = OfflineCache.getLocalState('daily_records');
      expect(local['rec-2']).toEqual(record);
    });

    it('replaces existing dirty entry for same table+id', () => {
      OfflineCache.setDirty('study_tasks', 't1', { title: 'v1' });
      OfflineCache.setDirty('study_tasks', 't1', { title: 'v2' });

      const dirty = OfflineCache.getDirtyRecords();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].record.title).toBe('v2');
    });

    it('allows different ids in the same table', () => {
      OfflineCache.setDirty('review_items', 'r1', { topic: 'a' });
      OfflineCache.setDirty('review_items', 'r2', { topic: 'b' });

      const dirty = OfflineCache.getDirtyRecords();
      expect(dirty).toHaveLength(2);
    });

    it('ignores calls with empty table or id', () => {
      OfflineCache.setDirty('', 'id1', { x: 1 });
      OfflineCache.setDirty('table', '', { x: 1 });

      expect(OfflineCache.getDirtyRecords()).toHaveLength(0);
    });
  });

  describe('getDirtyRecords', () => {
    it('returns empty array when no records are dirty', () => {
      expect(OfflineCache.getDirtyRecords()).toEqual([]);
    });

    it('returns records across multiple tables', () => {
      OfflineCache.setDirty('daily_records', 'd1', { a: 1 });
      OfflineCache.setDirty('mock_scores', 'm1', { b: 2 });
      OfflineCache.setDirty('source_registry', 's1', { c: 3 });

      const dirty = OfflineCache.getDirtyRecords();
      expect(dirty).toHaveLength(3);
      const tables = dirty.map((d) => d.table);
      expect(tables).toContain('daily_records');
      expect(tables).toContain('mock_scores');
      expect(tables).toContain('source_registry');
    });
  });

  describe('clearDirty', () => {
    it('removes specified records from the dirty queue', () => {
      OfflineCache.setDirty('daily_records', 'r1', { x: 1 });
      OfflineCache.setDirty('study_tasks', 't1', { y: 2 });
      OfflineCache.setDirty('review_items', 'i1', { z: 3 });

      OfflineCache.clearDirty(['daily_records:r1', 'review_items:i1']);

      const dirty = OfflineCache.getDirtyRecords();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].table).toBe('study_tasks');
      expect(dirty[0].id).toBe('t1');
    });

    it('preserves records not in the clear list (error resilience)', () => {
      OfflineCache.setDirty('topic_progress', 'tp1', { status: 'learning' });
      OfflineCache.setDirty('topic_progress', 'tp2', { status: 'mastered' });

      // Only clear tp1, simulating tp2 sync failure
      OfflineCache.clearDirty(['topic_progress:tp1']);

      const dirty = OfflineCache.getDirtyRecords();
      expect(dirty).toHaveLength(1);
      expect(dirty[0].id).toBe('tp2');
    });

    it('does nothing with empty or null ids', () => {
      OfflineCache.setDirty('resources', 'res1', { url: 'http://x' });
      OfflineCache.clearDirty([]);
      expect(OfflineCache.getDirtyRecords()).toHaveLength(1);

      OfflineCache.clearDirty(null);
      expect(OfflineCache.getDirtyRecords()).toHaveLength(1);
    });
  });

  describe('getLocalState', () => {
    it('returns empty object for table with no data', () => {
      expect(OfflineCache.getLocalState('mock_scores')).toEqual({});
    });

    it('returns all records for a table', () => {
      OfflineCache.setDirty('study_tasks', 't1', { title: 'A' });
      OfflineCache.setDirty('study_tasks', 't2', { title: 'B' });

      const local = OfflineCache.getLocalState('study_tasks');
      expect(Object.keys(local)).toHaveLength(2);
      expect(local['t1'].title).toBe('A');
      expect(local['t2'].title).toBe('B');
    });

    it('local state persists after clearing dirty flags', () => {
      OfflineCache.setDirty('daily_records', 'd1', { mins: 60 });
      OfflineCache.clearDirty(['daily_records:d1']);

      // Local data should still be there even after sync
      const local = OfflineCache.getLocalState('daily_records');
      expect(local['d1']).toEqual({ mins: 60 });
    });
  });

  describe('hasPendingSync', () => {
    it('returns false when queue is empty', () => {
      expect(OfflineCache.hasPendingSync()).toBe(false);
    });

    it('returns true when there are dirty records', () => {
      OfflineCache.setDirty('resources', 'r1', { name: 'test' });
      expect(OfflineCache.hasPendingSync()).toBe(true);
    });
  });

  describe('getDirtyCounts', () => {
    it('returns counts grouped by table', () => {
      OfflineCache.setDirty('daily_records', 'd1', {});
      OfflineCache.setDirty('daily_records', 'd2', {});
      OfflineCache.setDirty('study_tasks', 't1', {});

      const counts = OfflineCache.getDirtyCounts();
      expect(counts.daily_records).toBe(2);
      expect(counts.study_tasks).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all cached data and dirty queue', () => {
      OfflineCache.setDirty('daily_records', 'd1', { x: 1 });
      OfflineCache.setDirty('study_tasks', 't1', { y: 2 });

      OfflineCache.clear();

      expect(OfflineCache.getDirtyRecords()).toEqual([]);
      expect(OfflineCache.getLocalState('daily_records')).toEqual({});
    });
  });

  describe('TRACKED_TABLES', () => {
    it('exposes all expected tables', () => {
      expect(OfflineCache.TRACKED_TABLES).toContain('daily_records');
      expect(OfflineCache.TRACKED_TABLES).toContain('study_tasks');
      expect(OfflineCache.TRACKED_TABLES).toContain('review_items');
      expect(OfflineCache.TRACKED_TABLES).toContain('topic_progress');
      expect(OfflineCache.TRACKED_TABLES).toContain('mock_scores');
      expect(OfflineCache.TRACKED_TABLES).toContain('resources');
      expect(OfflineCache.TRACKED_TABLES).toContain('source_registry');
      expect(OfflineCache.TRACKED_TABLES).toContain('calibration_snapshots');
      expect(OfflineCache.TRACKED_TABLES).toContain('project_showcase_items');
      expect(OfflineCache.TRACKED_TABLES).toHaveLength(9);
    });
  });
});

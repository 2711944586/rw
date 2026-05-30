import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../../src/core/state-manager.js';
import { EventBus, EVENTS } from '../../src/core/event-bus.js';

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

describe('StateManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    StateManager.clear();
  });

  describe('getState / setState', () => {
    it('returns empty object when no state exists', () => {
      expect(StateManager.getState()).toEqual({});
    });

    it('sets and gets a top-level value', () => {
      StateManager.setState('name', 'test');
      expect(StateManager.getState('name')).toBe('test');
    });

    it('sets and gets a nested value via dot-path', () => {
      StateManager.setState('tasks.today', [{ id: 1 }]);
      expect(StateManager.getState('tasks.today')).toEqual([{ id: 1 }]);
      expect(StateManager.getState('tasks')).toEqual({ today: [{ id: 1 }] });
    });

    it('creates intermediate objects for deep paths', () => {
      StateManager.setState('a.b.c', 42);
      expect(StateManager.getState('a.b.c')).toBe(42);
      expect(StateManager.getState('a.b')).toEqual({ c: 42 });
    });

    it('returns undefined for non-existent paths', () => {
      expect(StateManager.getState('nonexistent')).toBeUndefined();
      expect(StateManager.getState('a.b.c')).toBeUndefined();
    });

    it('returns full state when no path given', () => {
      StateManager.setState('x', 1);
      StateManager.setState('y', 2);
      expect(StateManager.getState()).toEqual({ x: 1, y: 2 });
    });
  });

  describe('localStorage persistence', () => {
    it('persists state to localStorage on setState', () => {
      StateManager.setState('key', 'value');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'pku_swm_420_dashboard_v3',
        JSON.stringify({ key: 'value' })
      );
    });

    it('loads state from localStorage on reload', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') return JSON.stringify({ loaded: true });
        return null;
      });
      StateManager.reload();
      expect(StateManager.getState('loaded')).toBe(true);
    });

    it('falls back to legacy StateManager storage key', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_state') return JSON.stringify({ legacyLoaded: true });
        return null;
      });
      StateManager.reload();
      expect(StateManager.getState('legacyLoaded')).toBe(true);
    });

    it('adapts dashboard entries to module daily_records', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') {
          return JSON.stringify({
            entries: {
              '2026-05-28': { math: 60, cs408: 50, english: 20, reading: 1 }
            }
          });
        }
        return null;
      });
      StateManager.reload();
      expect(StateManager.getState('daily_records')['2026-05-28']).toMatchObject({
        mathMin: 60,
        csMin: 50,
        engMin: 20,
        readingCount: 1
      });
    });
  });

  describe('dirty tracking', () => {
    it('marks a record as dirty', () => {
      StateManager.markDirty('study_tasks', 'task-1');
      const dirty = StateManager.getDirtyRecords();
      expect(dirty).toEqual([{ tableName: 'study_tasks', recordId: 'task-1' }]);
    });

    it('returns multiple dirty records', () => {
      StateManager.markDirty('study_tasks', 'task-1');
      StateManager.markDirty('review_items', 'review-2');
      const dirty = StateManager.getDirtyRecords();
      expect(dirty).toHaveLength(2);
      expect(dirty).toContainEqual({ tableName: 'study_tasks', recordId: 'task-1' });
      expect(dirty).toContainEqual({ tableName: 'review_items', recordId: 'review-2' });
    });

    it('clears dirty flags for specified records', () => {
      StateManager.markDirty('study_tasks', 'task-1');
      StateManager.markDirty('study_tasks', 'task-2');
      StateManager.clearDirty(['study_tasks:task-1']);
      const dirty = StateManager.getDirtyRecords();
      expect(dirty).toEqual([{ tableName: 'study_tasks', recordId: 'task-2' }]);
    });

    it('persists dirty map to localStorage', () => {
      StateManager.markDirty('table', 'rec');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'pku_swm_420_dirty',
        JSON.stringify({ 'table:rec': true })
      );
    });

    it('handles recordId with colon characters', () => {
      StateManager.markDirty('table', 'id:with:colons');
      const dirty = StateManager.getDirtyRecords();
      expect(dirty).toEqual([{ tableName: 'table', recordId: 'id:with:colons' }]);
    });
  });

  describe('event emission', () => {
    it('emits state:changed on setState', () => {
      const handler = vi.fn();
      EventBus.on(EVENTS.STATE_CHANGED, handler);
      StateManager.setState('foo', 'bar');
      expect(handler).toHaveBeenCalledWith({ path: 'foo', value: 'bar' });
      EventBus.off(EVENTS.STATE_CHANGED, handler);
    });

    it('emits with nested path info', () => {
      const handler = vi.fn();
      EventBus.on(EVENTS.STATE_CHANGED, handler);
      StateManager.setState('a.b', 123);
      expect(handler).toHaveBeenCalledWith({ path: 'a.b', value: 123 });
      EventBus.off(EVENTS.STATE_CHANGED, handler);
    });
  });

  describe('clear', () => {
    it('removes all state and dirty data', () => {
      StateManager.setState('x', 1);
      StateManager.markDirty('t', 'r');
      StateManager.clear();
      expect(StateManager.getState()).toEqual({});
      expect(StateManager.getDirtyRecords()).toEqual([]);
    });
  });
});

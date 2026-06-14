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

    it('returns undefined for invalid path input without throwing', () => {
      expect(StateManager.getState(null)).toBeUndefined();
      expect(StateManager.getState(123)).toBeUndefined();
      expect(StateManager.getState('')).toBeUndefined();
      expect(StateManager.getState('   ')).toBeUndefined();
      expect(StateManager.getState('a..b')).toBeUndefined();
    });

    it('returns full state when no path given', () => {
      StateManager.setState('x', 1);
      StateManager.setState('y', 2);
      expect(StateManager.getState()).toEqual({ x: 1, y: 2 });
    });

    it('returns a defensive copy of the full state', () => {
      StateManager.setState('profile', { name: 'initial', tags: ['math'] });

      const fullState = StateManager.getState();
      fullState.profile.name = 'mutated';
      fullState.profile.tags.push('cs');

      expect(StateManager.getState('profile')).toEqual({ name: 'initial', tags: ['math'] });
    });

    it('returns a defensive copy of nested state values', () => {
      StateManager.setState('tasks.today', [{ id: 1 }]);

      const tasks = StateManager.getState('tasks.today');
      tasks.push({ id: 2 });

      expect(StateManager.getState('tasks.today')).toEqual([{ id: 1 }]);
    });

    it('allows callers to modify a returned copy and persist it explicitly', () => {
      StateManager.setState('tasks.today', [{ id: 1 }]);

      const tasks = StateManager.getState('tasks.today');
      tasks.push({ id: 2 });

      expect(StateManager.setState('tasks.today', tasks)).toBe(true);
      expect(StateManager.getState('tasks.today')).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('trims dot-path segments before reading and writing', () => {
      expect(StateManager.setState(' tasks . today ', [{ id: 1 }])).toBe(true);

      expect(StateManager.getState('tasks.today')).toEqual([{ id: 1 }]);
      expect(StateManager.getState(' tasks . today ')).toEqual([{ id: 1 }]);
    });

    it('rejects invalid setState paths without persisting or emitting', () => {
      const handler = vi.fn();
      EventBus.on(EVENTS.STATE_CHANGED, handler);
      localStorageMock.setItem.mockClear();

      try {
        expect(StateManager.setState('', 'bad')).toBe(false);
        expect(StateManager.setState('   ', 'bad')).toBe(false);
        expect(StateManager.setState('a..b', 'bad')).toBe(false);
        expect(StateManager.setState(null, 'bad')).toBe(false);
      } finally {
        EventBus.off(EVENTS.STATE_CHANGED, handler);
      }

      expect(StateManager.getState()).toEqual({});
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects prototype-polluting path segments without mutating global objects', () => {
      const handler = vi.fn();
      EventBus.on(EVENTS.STATE_CHANGED, handler);
      localStorageMock.setItem.mockClear();

      try {
        expect(StateManager.setState('__proto__.polluted', true)).toBe(false);
        expect(StateManager.setState('safe.__proto__.polluted', true)).toBe(false);
        expect(StateManager.setState('constructor.prototype.polluted', true)).toBe(false);
        expect(StateManager.setState('safe.constructor.prototype', true)).toBe(false);

        expect(StateManager.getState('__proto__.polluted')).toBeUndefined();
        expect(StateManager.getState('constructor.prototype.polluted')).toBeUndefined();
        expect({}.polluted).toBeUndefined();
        expect(Object.prototype.polluted).toBeUndefined();
        expect(StateManager.getState()).toEqual({});
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
      } finally {
        delete Object.prototype.polluted;
        EventBus.off(EVENTS.STATE_CHANGED, handler);
      }
    });

    it('rejects values that cannot be represented in localStorage JSON', () => {
      const handler = vi.fn();
      const circular = { name: 'loop' };
      circular.self = circular;
      EventBus.on(EVENTS.STATE_CHANGED, handler);
      localStorageMock.setItem.mockClear();

      try {
        expect(StateManager.setState('bad.undefined', undefined)).toBe(false);
        expect(StateManager.setState('bad.function', () => true)).toBe(false);
        expect(StateManager.setState('bad.bigint', BigInt(1))).toBe(false);
        expect(StateManager.setState('bad.circular', circular)).toBe(false);

        expect(StateManager.getState()).toEqual({});
        expect(localStorageMock.setItem).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
      } finally {
        EventBus.off(EVENTS.STATE_CHANGED, handler);
      }
    });

    it('stores and emits the JSON-persisted shape of state values', () => {
      const handler = vi.fn();
      const value = {
        date: new Date('2026-06-09T00:00:00.000Z'),
        keep: 'yes',
        dropUndefined: undefined,
        dropFunction: () => 'no',
        list: [1, undefined, () => 'no'],
      };
      const persistedShape = {
        date: '2026-06-09T00:00:00.000Z',
        keep: 'yes',
        list: [1, null, null],
      };
      EventBus.on(EVENTS.STATE_CHANGED, handler);

      try {
        expect(StateManager.setState('jsonShape', value)).toBe(true);

        expect(StateManager.getState('jsonShape')).toEqual(persistedShape);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'pku_swm_420_dashboard_v3',
          JSON.stringify({ jsonShape: persistedShape })
        );
        expect(handler).toHaveBeenCalledWith({
          path: 'jsonShape',
          value: persistedShape,
          localSaved: true
        });
      } finally {
        EventBus.off(EVENTS.STATE_CHANGED, handler);
      }
    });
  });

  describe('localStorage persistence', () => {
    it('persists state to localStorage on setState', () => {
      expect(StateManager.setState('key', 'value')).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'pku_swm_420_dashboard_v3',
        JSON.stringify({ key: 'value' })
      );
    });

    it('keeps in-memory state when localStorage persistence fails', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('storage blocked');
      });

      expect(StateManager.setState('key', 'value')).toBe(false);
      expect(StateManager.getState('key')).toBe('value');
    });

    it('loads state from localStorage on reload', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') return JSON.stringify({ loaded: true });
        return null;
      });
      StateManager.reload();
      expect(StateManager.getState('loaded')).toBe(true);
    });

    it('recovers to empty state when stored state is not an object', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') return JSON.stringify(['not', 'state']);
        return null;
      });

      StateManager.reload();

      expect(StateManager.getState()).toEqual({});
      expect(() => StateManager.setState('afterRecovery.ok', true)).not.toThrow();
      expect(StateManager.getState('afterRecovery.ok')).toBe(true);
    });

    it('falls back to legacy StateManager storage key', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_state') return JSON.stringify({ legacyLoaded: true });
        return null;
      });
      StateManager.reload();
      expect(StateManager.getState('legacyLoaded')).toBe(true);
    });

    it('recovers to empty state when legacy stored state is not an object', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_state') return JSON.stringify('legacy-bad');
        return null;
      });

      StateManager.reload();

      expect(StateManager.getState()).toEqual({});
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

    it('normalizes dirty dashboard entries when adapting to module daily_records', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') {
          return JSON.stringify({
            entries: {
              '2026-05-28': {
                math: 0,
                mathMin: 60,
                cs408: 'Infinity',
                english: 'bad',
                politics: '-5',
                project: 20,
                reading: -1,
                readingCount: 3,
                newMistakes: -2,
                fixedMistakes: 2,
                nextTask: { bad: true },
                note: { bad: true },
                updatedAt: { bad: true },
                createdAt: '2026-05-28T00:00:00.000Z'
              }
            }
          });
        }
        return null;
      });

      StateManager.reload();

      expect(StateManager.getState('daily_records')['2026-05-28']).toMatchObject({
        mathMin: 0,
        csMin: 0,
        engMin: 0,
        polMin: 0,
        projectMin: 20,
        readingCount: 3,
        newMistakes: 0,
        fixedMistakes: 2,
        nextTask: '',
        note: '',
        updatedAt: '2026-05-28T00:00:00.000Z'
      });
    });

    it('adapts malformed nested dashboard fields to safe module shapes', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') {
          return JSON.stringify({
            entries: {
              '2026-05-29': null
            },
            reviewItems: { bad: true },
            scores: { bad: true },
            topics: ['bad-topic'],
            snapshots: { bad: true },
            showcaseItems: { bad: true },
            sourceRegistry: { bad: true }
          });
        }
        return null;
      });

      StateManager.reload();

      expect(StateManager.getState('daily_records')['2026-05-29']).toMatchObject({
        date: '2026-05-29',
        mathMin: 0,
        csMin: 0,
        engMin: 0
      });
      expect(StateManager.getState('review_items')).toEqual([]);
      expect(StateManager.getState('mock_scores')).toEqual([]);
      expect(StateManager.getState('topic_progress')).toEqual([]);
      expect(StateManager.getState('calibration_snapshots')).toEqual([]);
      expect(StateManager.getState('showcase_items')).toEqual([]);
      expect(StateManager.getState('source_registry')).toEqual([]);
    });

    it('stores malformed module daily_records input as an empty record map', () => {
      expect(StateManager.setState('daily_records', 'not-records')).toBe(true);

      expect(StateManager.getState('daily_records')).toEqual({});
    });

    it('normalizes module daily_records before storing dashboard entries', () => {
      expect(StateManager.setState('daily_records', {
        '2026-05-30': {
          mathMin: -45,
          math: 15,
          csMin: 'Infinity',
          cs408: 20,
          engMin: 'bad',
          polMin: -1,
          projectMin: 0,
          mathProblems: -3,
          csProblems: 4,
          readingCount: -1,
          reading: 2,
          newMistakes: '-5',
          fixedMistakes: 1,
          quality: 99,
          nextTask: { bad: true },
          note: { bad: true },
          updatedAt: { bad: true },
          createdAt: '2026-05-30T00:00:00.000Z'
        }
      })).toBe(true);

      expect(StateManager.getState('entries')['2026-05-30']).toMatchObject({
        math: 15,
        cs408: 20,
        english: 0,
        politics: 0,
        project: 0,
        mathProblems: 0,
        csProblems: 4,
        reading: 2,
        newMistakes: 0,
        fixedMistakes: 1,
        quality: 5,
        nextTask: '',
        note: '',
        updatedAt: '2026-05-30T00:00:00.000Z'
      });
    });

    it('normalizes module review item counters in both read and write adapters', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dashboard_v3') {
          return JSON.stringify({
            reviewItems: [{
              topicId: 'stored-review',
              dueDate: '2026-06-01',
              intervalIndex: -2,
              failStreak: 'Infinity'
            }, {
              id: { bad: true },
              topic: { bad: true },
              subject: { bad: true },
              text: { bad: true },
              title: { bad: true },
              round: { bad: true },
              topicId: { bad: true },
              sourceTaskId: '__proto__',
              dueDate: '2026-02-31',
              completedAt: { bad: true },
              status: { bad: true },
              lastResult: { bad: true }
            }]
          });
        }
        return null;
      });

      StateManager.reload();

      expect(StateManager.getState('review_items')[0]).toMatchObject({
        topicId: 'stored-review',
        nextDueAt: '2026-06-01',
        intervalIndex: 0,
        failStreak: 0
      });
      expect(StateManager.getState('review_items')[1]).toMatchObject({
        topicId: '',
        topic: '',
        subject: '',
        text: '',
        title: '',
        round: '',
        nextDueAt: '',
        intervalIndex: 0,
        failStreak: 0,
        lastResult: '',
        lastSubmittedDate: ''
      });

      expect(StateManager.setState('review_items', [{
        topicId: 'module-review',
        nextDueAt: '2026-06-02',
        intervalIndex: -1,
        failStreak: 'bad'
      }, {
        id: { bad: true },
        topic: { bad: true },
        subject: { bad: true },
        text: { bad: true },
        title: { bad: true },
        round: { bad: true },
        topicId: { bad: true },
        sourceTaskId: '__proto__',
        nextDueAt: '2026-02-31',
        status: { bad: true },
        lastResult: 'pass'
      }])).toBe(true);

      expect(StateManager.getState('reviewItems')[0]).toMatchObject({
        topicId: 'module-review',
        dueDate: '2026-06-02',
        intervalIndex: 0,
        failStreak: 0
      });
      expect(StateManager.getState('reviewItems')[1]).toMatchObject({
        id: '',
        topicId: '',
        topic: '',
        subject: '',
        text: '',
        title: '',
        round: '',
        dueDate: '',
        sourceTaskId: '',
        status: 'done',
        intervalIndex: 0,
        failStreak: 0
      });
      expect(StateManager.getState('review_items')[0]).toMatchObject({
        topicId: 'module-review',
        nextDueAt: '2026-06-02',
        intervalIndex: 0,
        failStreak: 0
      });
      expect(StateManager.getState('review_items')[1]).toMatchObject({
        topicId: '',
        topic: '',
        title: '',
        nextDueAt: '',
        status: 'done'
      });
    });

    it('falls back to safe alternate module fields when primary fields are objects', () => {
      expect(StateManager.setState('review_items', [{
        id: { bad: true },
        topicId: { bad: true },
        topic_id: 'topic-safe',
        sourceTaskId: { bad: true },
        source_task_id: 'source-safe',
        dueDate: { bad: true },
        nextDueAt: '2026-06-11',
        lastSubmittedDate: { bad: true },
        completedAt: '2026-06-12T08:00:00.000Z'
      }])).toBe(true);

      expect(StateManager.getState('reviewItems')[0]).toMatchObject({
        id: 'topic-safe',
        topicId: 'topic-safe',
        sourceTaskId: 'source-safe',
        dueDate: '2026-06-11'
      });
      expect(StateManager.getState('review_items')[0]).toMatchObject({
        topicId: 'topic-safe',
        nextDueAt: '2026-06-11',
        lastSubmittedDate: '2026-06-12'
      });

      expect(StateManager.setState('mock_scores', [{
        id: 'score-safe',
        score: 320,
        updatedAt: { bad: true },
        updated_at: '2026-06-13T00:00:00.000Z'
      }])).toBe(true);
      expect(StateManager.getState('scores')[0]).toMatchObject({
        id: 'score-safe',
        updatedAt: '2026-06-13T00:00:00.000Z'
      });

      expect(StateManager.setState('topic_progress', [{
        topicId: { bad: true },
        topic_id: 'topic-from-snake',
        status_value: 2
      }])).toBe(true);
      expect(StateManager.getState('topics')).toEqual({ 'topic-from-snake': 2 });

      expect(JSON.stringify(StateManager.getState())).not.toContain('[object Object]');
    });

    it('sets module array paths onto their dashboard state fields', () => {
      const scores = [{ id: 's1', date: '2026-06-09', score: 335 }];
      const snapshots = [{ id: 'snap-1', predicted: 352 }];
      const claims = [{ claim_id: 'claim-1', title: 'Fact check' }];
      const normalizedScores = [{
        id: 's1',
        date: '2026-06-09',
        name: '未命名模考',
        politics: 0,
        english: 0,
        math: 0,
        cs408: 0,
        total: 335,
        note: '',
        updatedAt: ''
      }];

      expect(StateManager.setState('mock_scores', scores)).toBe(true);
      expect(StateManager.setState('calibration_snapshots', snapshots)).toBe(true);
      expect(StateManager.setState('source_registry', claims)).toBe(true);

      expect(StateManager.getState('scores')).toEqual(normalizedScores);
      expect(StateManager.getState('snapshots')).toEqual(snapshots);
      expect(StateManager.getState('sourceRegistry')).toEqual(claims);
      expect(StateManager.getState('mock_scores')).toEqual(normalizedScores);
      expect(StateManager.getState('calibration_snapshots')).toEqual(snapshots);
      expect(StateManager.getState('source_registry')).toEqual(claims);
    });

    it('normalizes module mock_scores before storing dashboard scores', () => {
      expect(StateManager.setState('mock_scores', [
        {
          id: '__proto__',
          date: 'bad-date',
          name: { bad: true },
          politics: 120,
          english: -5,
          math: 160,
          cs408: 'Infinity',
          total: 999,
          note: { bad: true },
          updatedAt: { bad: true },
          updated_at: '2026-06-09T00:00:00.000Z'
        },
        {
          id: 'score-total',
          date: '2026-06-10',
          score: '335'
        },
        {
          id: 'score-invalid-calendar',
          date: '2026-02-31',
          score: '320'
        },
        null
      ])).toBe(true);

      expect(StateManager.getState('scores')).toEqual([
        {
          id: 'score_1',
          date: '',
          name: '未命名模考',
          politics: 100,
          english: 0,
          math: 150,
          cs408: 0,
          total: 250,
          note: '',
          updatedAt: '2026-06-09T00:00:00.000Z'
        },
        {
          id: 'score-total',
          date: '2026-06-10',
          name: '未命名模考',
          politics: 0,
          english: 0,
          math: 0,
          cs408: 0,
          total: 335,
          note: '',
          updatedAt: ''
        },
        {
          id: 'score-invalid-calendar',
          date: '',
          name: '未命名模考',
          politics: 0,
          english: 0,
          math: 0,
          cs408: 0,
          total: 320,
          note: '',
          updatedAt: ''
        }
      ]);
    });

    it('sets profile.last_synced_at onto sync.lastSyncAt', () => {
      const syncedAt = '2026-06-09T00:00:00.000Z';

      expect(StateManager.setState('profile.last_synced_at', syncedAt)).toBe(true);

      expect(StateManager.getState('sync.lastSyncAt')).toBe(syncedAt);
      expect(StateManager.getState('profile.last_synced_at')).toBe(syncedAt);
    });

    it('sets module topic_progress rows onto the dashboard topics map', () => {
      expect(StateManager.setState('topic_progress', [
        { topicId: 'math/a', status_value: 2 },
        { topic_id: 'cs/b', mastery_status: 'needs_review' },
        { topic_id: 'eng/c', statusValue: '1' },
        { topic_id: 'pol/d', status_value: 'bad', mastery_status: 'mastered' },
        { topic_id: '   ', status_value: 2 },
        { topicId: { bad: true }, status_value: 2 },
        { topic_id: '__proto__', status_value: 2 },
        { topic_id: 'constructor', status_value: 2 },
        null
      ])).toBe(true);

      expect(StateManager.getState('topics')).toEqual({
        'math/a': 2,
        'cs/b': 1,
        'eng/c': 1,
        'pol/d': 2
      });
      expect(StateManager.getState('topic_progress')).toEqual([
        { topic_id: 'math/a', topicId: 'math/a', status_value: 2, mastery_status: 'mastered' },
        { topic_id: 'cs/b', topicId: 'cs/b', status_value: 1, mastery_status: 'needs_review' },
        { topic_id: 'eng/c', topicId: 'eng/c', status_value: 1, mastery_status: 'needs_review' },
        { topic_id: 'pol/d', topicId: 'pol/d', status_value: 2, mastery_status: 'mastered' }
      ]);
    });

    it('normalizes module topic_progress values to the 0-2 mastery scale', () => {
      expect(StateManager.setState('topic_progress', [
        { topicId: 'math/high', status_value: 99 },
        { topicId: 'cs/negative', status_value: -5 },
        { topicId: 'eng/decimal', status_value: 1.6 },
        { topicId: 'pol/string', statusValue: '1.4' },
        { topicId: 'math/fallback', status_value: 'bad', mastery_status: 'needs_review' },
      ])).toBe(true);

      expect(StateManager.getState('topics')).toEqual({
        'math/high': 2,
        'cs/negative': 0,
        'eng/decimal': 2,
        'pol/string': 1,
        'math/fallback': 1
      });

      StateManager.setState('topics', {
        'math/raw-high': 9,
        'cs/raw-negative': -2,
        'eng/raw-decimal': 1.5,
        'pol/raw-bad': 'bad'
      });

      expect(StateManager.getState('topic_progress')).toEqual([
        { topic_id: 'math/raw-high', topicId: 'math/raw-high', status_value: 2, mastery_status: 'mastered' },
        { topic_id: 'cs/raw-negative', topicId: 'cs/raw-negative', status_value: 0, mastery_status: 'learning' },
        { topic_id: 'eng/raw-decimal', topicId: 'eng/raw-decimal', status_value: 2, mastery_status: 'mastered' },
        { topic_id: 'pol/raw-bad', topicId: 'pol/raw-bad', status_value: 0, mastery_status: 'learning' }
      ]);
    });
  });

  describe('dirty tracking', () => {
    it('marks a record as dirty', () => {
      expect(StateManager.markDirty('study_tasks', 'task-1')).toBe(true);
      const dirty = StateManager.getDirtyRecords();
      expect(dirty).toEqual([{ tableName: 'study_tasks', recordId: 'task-1' }]);
    });

    it('ignores dirty records with empty table or record id', () => {
      expect(StateManager.markDirty('', 'task-1')).toBe(false);
      expect(StateManager.markDirty('study_tasks', '')).toBe(false);
      expect(StateManager.markDirty('   ', 'task-1')).toBe(false);
      expect(StateManager.markDirty('study_tasks', '   ')).toBe(false);
      expect(StateManager.markDirty('bad:table', 'task-1')).toBe(false);

      expect(StateManager.getDirtyRecords()).toEqual([]);
    });

    it('trims dirty table and record ids before persisting', () => {
      expect(StateManager.markDirty(' study_tasks ', ' task-1 ')).toBe(true);

      expect(StateManager.getDirtyRecords()).toEqual([{ tableName: 'study_tasks', recordId: 'task-1' }]);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'pku_swm_420_dirty',
        JSON.stringify({ 'study_tasks:task-1': true })
      );
    });

    it('keeps dirty flags in memory when localStorage persistence fails', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('storage blocked');
      });

      expect(StateManager.markDirty('study_tasks', 'task-1')).toBe(false);
      expect(StateManager.getDirtyRecords()).toEqual([{ tableName: 'study_tasks', recordId: 'task-1' }]);
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
      expect(StateManager.clearDirty(['study_tasks:task-1'])).toBe(true);
      const dirty = StateManager.getDirtyRecords();
      expect(dirty).toEqual([{ tableName: 'study_tasks', recordId: 'task-2' }]);
    });

    it('normalizes dirty ids before clearing', () => {
      StateManager.markDirty('study_tasks', 'task-1');
      StateManager.markDirty('table', 'id:with:colons');

      expect(StateManager.clearDirty([' study_tasks : task-1 ', ' table : id:with:colons '])).toBe(true);

      expect(StateManager.getDirtyRecords()).toEqual([]);
    });

    it('does nothing when clearing dirty flags with empty or invalid input', () => {
      StateManager.markDirty('study_tasks', 'task-1');
      localStorageMock.setItem.mockClear();

      expect(StateManager.clearDirty([])).toBe(true);
      expect(StateManager.clearDirty(null)).toBe(true);
      expect(StateManager.clearDirty(['', 'missing-separator', ':missing-table', 'table:   '])).toBe(true);
      expect(StateManager.clearDirty(['study_tasks:missing-record'])).toBe(true);

      expect(StateManager.getDirtyRecords()).toEqual([{ tableName: 'study_tasks', recordId: 'task-1' }]);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('keeps dirty flags in memory when clearing cannot persist', () => {
      StateManager.markDirty('study_tasks', 'task-1');
      StateManager.markDirty('study_tasks', 'task-2');
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('storage blocked');
      });

      expect(StateManager.clearDirty(['study_tasks:task-1'])).toBe(false);

      expect(StateManager.getDirtyRecords()).toEqual([
        { tableName: 'study_tasks', recordId: 'task-1' },
        { tableName: 'study_tasks', recordId: 'task-2' },
      ]);
    });

    it('recovers to an empty dirty map when stored dirty state is not an object', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dirty') return JSON.stringify(['bad-dirty']);
        return null;
      });

      StateManager.reload();

      expect(StateManager.getDirtyRecords()).toEqual([]);
      expect(StateManager.markDirty('study_tasks', 'task-2')).toBe(true);
      expect(StateManager.getDirtyRecords()).toEqual([{ tableName: 'study_tasks', recordId: 'task-2' }]);
    });

    it('filters malformed stored dirty entries by key shape and true value', () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'pku_swm_420_dirty') {
          return JSON.stringify({
            'study_tasks:task-1': true,
            ' study_tasks : task-2 ': true,
            'review_items:': true,
            'mock_scores:   ': true,
            '   :bad': true,
            ':missing-table': true,
            'missing-separator': true,
            'daily_records:already-clean': false,
            'mock_scores:not-true': 'true'
          });
        }
        return null;
      });

      StateManager.reload();

      expect(StateManager.getDirtyRecords()).toEqual([
        { tableName: 'study_tasks', recordId: 'task-1' },
        { tableName: 'study_tasks', recordId: 'task-2' },
      ]);
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
      expect(handler).toHaveBeenCalledWith({ path: 'foo', value: 'bar', localSaved: true });
      EventBus.off(EVENTS.STATE_CHANGED, handler);
    });

    it('emits with nested path info', () => {
      const handler = vi.fn();
      EventBus.on(EVENTS.STATE_CHANGED, handler);
      StateManager.setState('a.b', 123);
      expect(handler).toHaveBeenCalledWith({ path: 'a.b', value: 123, localSaved: true });
      EventBus.off(EVENTS.STATE_CHANGED, handler);
    });

    it('emits a defensive copy of changed object values', () => {
      let seenPayload;
      const handler = vi.fn((payload) => {
        seenPayload = JSON.parse(JSON.stringify(payload));
        payload.value.items.push({ id: 2 });
      });
      EventBus.on(EVENTS.STATE_CHANGED, handler);

      try {
        StateManager.setState('box', { items: [{ id: 1 }] });
      } finally {
        EventBus.off(EVENTS.STATE_CHANGED, handler);
      }

      expect(StateManager.getState('box')).toEqual({ items: [{ id: 1 }] });
      expect(seenPayload).toEqual({
        path: 'box',
        value: { items: [{ id: 1 }] },
        localSaved: true,
      });
    });

    it('emits localSaved=false when state persistence fails', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('storage blocked');
      });
      const handler = vi.fn();
      EventBus.on(EVENTS.STATE_CHANGED, handler);

      try {
        expect(StateManager.setState('unstable', true)).toBe(false);
        expect(handler).toHaveBeenCalledWith({ path: 'unstable', value: true, localSaved: false });
      } finally {
        EventBus.off(EVENTS.STATE_CHANGED, handler);
      }
    });
  });

  describe('clear', () => {
    it('removes all state and dirty data', () => {
      StateManager.setState('x', 1);
      StateManager.markDirty('t', 'r');
      expect(StateManager.clear()).toBe(true);
      expect(StateManager.getState()).toEqual({});
      expect(StateManager.getDirtyRecords()).toEqual([]);
    });

    it('clears in-memory state and reports false when persisted removal fails', () => {
      StateManager.setState('x', 1);
      StateManager.markDirty('t', 'r');
      localStorageMock.removeItem.mockClear();
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('storage blocked');
      });

      expect(StateManager.clear()).toBe(false);
      expect(StateManager.getState()).toEqual({});
      expect(StateManager.getDirtyRecords()).toEqual([]);
    });
  });
});

/**
 * @vitest-environment jsdom
 *
 * Behavioural coverage for the import/sanitising boundary.
 *
 * These cases replace two blocks in `app-imports.test.js` that sliced `app.js`
 * as source text and re-evaluated the slice with `new Function(...)`. That
 * approach asserted the right behaviours through a mechanism that broke on any
 * refactor: adding one helper call inside `sanitizeTask` made both blocks throw
 * `ReferenceError`, because the extracted slice no longer contained everything
 * it referenced. Here the real exported functions are called directly.
 */
import { describe, expect, it } from 'vitest';
import {
  filterDeletedFromStart,
  sanitizeCustomTasks,
  sanitizeDeleted,
  sanitizeDeletedMeta,
  sanitizeEntries,
  sanitizeNumericObject,
  sanitizeReviewItems,
  sanitizeScores,
  sanitizeTask,
  sanitizeTaskState,
  sanitizeTopicEvidence,
  sanitizeUser,
  sanitizeWeekPlans,
} from '../../src/app.js';

describe('import boundary: malformed maps are filtered, not trusted', () => {
  it('keeps only well-formed entries and coerces the numeric fields', () => {
    const entries = sanitizeEntries({
      '2026-09-01': { math: '45', quality: '4', nextTask: '极限 20 题' },
      '2026-13-45': { math: 30 },
      'not-a-date': { math: 30 },
      __proto__: { polluted: true },
    });

    expect(Object.keys(entries)).toEqual(['2026-09-01']);
    expect(entries['2026-09-01']).toEqual(expect.objectContaining({ math: 45, quality: 4, nextTask: '极限 20 题' }));
    expect({}.polluted).toBeUndefined();
  });

  it('drops scores without a usable date but keeps a recoverable identity', () => {
    const scores = sanitizeScores([
      { id: 'score-safe', date: '2026-09-01', math: 110 },
      { date: '2026-13-01', math: 100 },
      { id: { bad: true }, date: '2026-09-01', english: 60 },
      'not-an-object',
    ]);

    // The impossible date is refused; a malformed id is replaced rather than
    // discarding the row.
    expect(scores.some((score) => score.date === '2026-13-01')).toBe(false);
    expect(scores.some((score) => score.id === 'score-safe')).toBe(true);
    for (const score of scores) {
      expect(score.id).toBeTruthy();
      expect(score.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('rejects prototype-poisoning keys in numeric maps', () => {
    const topics = sanitizeNumericObject({ 'math/limits': 2, __proto__: 2, constructor: 2 }, 0, 2, true);

    expect(Object.keys(topics)).toEqual(['math/limits']);
  });

  it('normalises topic evidence into its stored shape', () => {
    const evidence = sanitizeTopicEvidence({
      'math/limits': { problems: '20', accuracy: '84', prerequisites: ['极限'] },
    });

    expect(evidence['math/limits']).toEqual(expect.objectContaining({ problems: 20, accuracy: 84, prerequisites: ['极限'] }));
  });

  it('clamps numeric resource maps into their percentage range', () => {
    expect(sanitizeNumericObject({ 'math-book': 40, over: 900, under: -5 }, 0, 100)).toEqual({ 'math-book': 40, over: 100, under: 0 });
  });

  it('rebuilds review items and refuses malformed containers', () => {
    const reviews = sanitizeReviewItems([
      { id: 'r1', subject: '数学', dueDate: '2026-09-05', status: 'due' },
      { id: 'r2', dueDate: '2026-13-01' },
      null,
    ]);

    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toEqual(expect.objectContaining({ id: 'r1', subject: '数学', status: 'due' }));
  });

  it('returns empty containers instead of throwing on non-object input', () => {
    expect(sanitizeEntries(null)).toEqual({});
    expect(sanitizeScores('nope')).toEqual([]);
    expect(sanitizeReviewItems(42)).toEqual([]);
    expect(sanitizeCustomTasks(undefined)).toEqual([]);
  });

  it('filters tombstones whose embedded date is out of scope', () => {
    const sanitized = sanitizeDeleted({
      records: ['2026-09-01', '2020-01-01', 'bad'],
      scores: ['__proto__'],
    });
    // `sanitizeDeleted` only guards the keys; the plan-start window is applied
    // by `filterDeletedFromStart`, which is where the old date gets dropped.
    const deleted = filterDeletedFromStart(sanitized);
    const meta = sanitizeDeletedMeta({ records: { '2026-09-01': '2026-09-02T00:00:00.000Z' } }, deleted);

    expect(deleted.records).toEqual(['2026-09-01']);
    expect(deleted.scores).toEqual([]);
    expect(meta.records['2026-09-01']).toBe('2026-09-02T00:00:00.000Z');
  });

  it('builds a user record only from a usable id and email pair', () => {
    expect(sanitizeUser({ id: { bad: true }, email: { bad: true } })).toBeNull();
    expect(sanitizeUser({ id: 'u1', email: 'learner@example.com' })).toEqual(expect.objectContaining({ id: 'u1' }));
  });

  it('rebuilds task completion state from the week plans', () => {
    const weekPlans = sanitizeWeekPlans({
      '2026-09-01': [
        { id: 't1', subject: '数学', text: '极限', status: 'done' },
        { id: 't2', subject: '408', text: '调度', status: 'todo' },
      ],
    });
    const tasks = sanitizeTaskState({}, weekPlans);

    expect(tasks.t1).toBe(true);
    expect(tasks.t2).toBe(false);
  });
});

describe('import boundary: snake_case fallbacks', () => {
  it('reads the legacy snake_case field when the camelCase one is malformed', () => {
    const plans = sanitizeWeekPlans({
      '2026-09-01': [{
        id: 'task-fallback',
        subject: '数学',
        text: '任务',
        topicId: { bad: true },
        topic_id: 'topic-safe',
        sourceTaskId: { bad: true },
        source_task_id: 'source-safe',
        carriedFrom: { bad: true },
        carried_from: '2026-08-31',
        shiftedTo: { bad: true },
        shifted_to: '2026-09-02',
        completedAt: { bad: true },
        completed_at: '2026-09-01T07:00:00.000Z',
        updatedAt: { bad: true },
        updated_at: '2026-09-01T08:00:00.000Z',
      }],
    });

    const task = plans['2026-09-01'][0];
    expect(task.topicId).toBe('topic-safe');
    expect(task.sourceTaskId).toBe('source-safe');
    expect(task.carriedFrom).toBe('2026-08-31');
    expect(task.shiftedTo).toBe('2026-09-02');
    expect(task.completedAt).toBe('2026-09-01T07:00:00.000Z');
    expect(task.updatedAt).toBe('2026-09-01T08:00:00.000Z');
  });

  it('prefers a usable camelCase value over the legacy one', () => {
    const plans = sanitizeWeekPlans({
      '2026-09-01': [{ id: 't', subject: '数学', text: '任务', topicId: 'camel', topic_id: 'snake' }],
    });

    expect(plans['2026-09-01'][0].topicId).toBe('camel');
  });
});

describe('import boundary: subject labels', () => {
  it('translates a stored subject key into its display label', () => {
    const task = sanitizeTask({ id: 't1', subject: 'math', text: '极限' }, '2026-09-01', 0);

    expect(task.subject).toBe('数学');
  });

  it('normalises every known key, and leaves unknown values alone', () => {
    const cases = [
      ['math', '数学'],
      ['cs408', '408'],
      ['english', '英语'],
      ['politics', '政治'],
      ['project', '项目'],
      ['review', '复盘'],
      ['数学', '数学'],
      ['408', '408'],
      ['自选专题', '自选专题'],
    ];
    for (const [input, expected] of cases) {
      expect(sanitizeTask({ id: 't', subject: input, text: 'x' }, '2026-09-01', 0).subject).toBe(expected);
    }
  });

  it('applies the same normalisation to review items', () => {
    const reviews = sanitizeReviewItems([
      { id: 'r1', subject: 'cs408', dueDate: '2026-09-05' },
      { id: 'r2', subject: 'english', dueDate: '2026-09-05' },
    ]);

    expect(reviews.map((item) => item.subject)).toEqual(['408', '英语']);
  });

  it('falls back to a known label when the subject is missing', () => {
    expect(sanitizeTask({ id: 't', text: 'x' }, '2026-09-01', 0).subject).toBe('复盘');
    expect(sanitizeReviewItems([{ id: 'r', dueDate: '2026-09-05' }])[0].subject).toBe('复盘');
  });
});

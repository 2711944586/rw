import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@supabase/supabase-js');
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function importSupabaseSync({
  url = 'https://example.supabase.co',
  key = 'publishable-key',
  getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
  onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  from = vi.fn(() => createQueryResult([])),
} = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key);

  const createClient = vi.fn(() => ({ auth: { getUser, onAuthStateChange }, from }));
  vi.doMock('@supabase/supabase-js', () => ({ createClient }));

  const syncModule = await import('../../src/infrastructure/supabase-sync.js');
  return { ...syncModule, createClient, getUser, onAuthStateChange, from };
}

function createQueryResult(data = [], error = null) {
  const result = { data, error };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    lte: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    delete: vi.fn(() => query),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    insert: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('supabaseSync auth', () => {
  it('does not create a client when Supabase env is missing', async () => {
    const { createClient, getCurrentUser, supabase, supabaseConfigured } = await importSupabaseSync({
      url: '',
      key: '',
    });

    expect(supabaseConfigured).toBe(false);
    expect(supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns the authenticated user from the configured client', async () => {
    const { createClient, getCurrentUser, supabaseConfigured } = await importSupabaseSync();

    expect(supabaseConfigured).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
    await expect(getCurrentUser()).resolves.toEqual({ id: 'user-1' });
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'publishable-key');
  });

  it('detects only this project persisted auth session', async () => {
    const { hasPersistedCloudSession } = await importSupabaseSync();
    const storage = {
      getItem: vi.fn((key) => key === 'sb-example-auth-token' ? '{"access_token":"token"}' : null),
    };

    expect(hasPersistedCloudSession(storage)).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith('sb-example-auth-token');
    expect(hasPersistedCloudSession({ getItem: () => null })).toBe(false);
    expect(hasPersistedCloudSession({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });

  it('returns null when Supabase reports an auth error', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: { message: 'bad token' } });
    const { getCurrentUser } = await importSupabaseSync({ getUser });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns null when auth lookup throws or returns malformed data', async () => {
    const throwingGetUser = vi.fn().mockRejectedValue(new Error('network down'));
    const throwingClient = await importSupabaseSync({ getUser: throwingGetUser });
    await expect(throwingClient.getCurrentUser()).resolves.toBeNull();

    const malformedGetUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const malformedClient = await importSupabaseSync({ getUser: malformedGetUser });
    await expect(malformedClient.getCurrentUser()).resolves.toBeNull();
  });

  it('returns a no-op auth listener when Supabase is missing or callback is invalid', async () => {
    const missingClient = await importSupabaseSync({ url: '', key: '' });
    expect(() => missingClient.onAuthChange(() => {})()).not.toThrow();

    const { onAuthChange, onAuthStateChange } = await importSupabaseSync();
    expect(() => onAuthChange(null)()).not.toThrow();
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });

  it('subscribes to auth changes and unsubscribes safely', async () => {
    const unsubscribe = vi.fn();
    let authHandler;
    const onAuthStateChange = vi.fn((handler) => {
      authHandler = handler;
      return { data: { subscription: { unsubscribe } } };
    });
    const callback = vi.fn();
    const { onAuthChange } = await importSupabaseSync({ onAuthStateChange });

    const cleanup = onAuthChange(callback);
    await vi.waitFor(() => expect(onAuthStateChange).toHaveBeenCalledTimes(1));
    authHandler('SIGNED_IN', { user: { id: 'user-1' } });
    authHandler('SIGNED_OUT', null);
    cleanup();

    expect(callback).toHaveBeenCalledWith({ id: 'user-1' });
    expect(callback).toHaveBeenCalledWith(null);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('isolates auth listener and unsubscribe failures', async () => {
    let authHandler;
    const unsubscribe = vi.fn(() => {
      throw new Error('unsubscribe failed');
    });
    const onAuthStateChange = vi.fn((handler) => {
      authHandler = handler;
      return { data: { subscription: { unsubscribe } } };
    });
    const callback = vi.fn(() => {
      throw new Error('callback failed');
    });
    const { onAuthChange } = await importSupabaseSync({ onAuthStateChange });

    const cleanup = onAuthChange(callback);
    await vi.waitFor(() => expect(onAuthStateChange).toHaveBeenCalledTimes(1));

    expect(() => authHandler('SIGNED_IN', { user: { id: 'user-1' } })).not.toThrow();
    expect(() => cleanup()).not.toThrow();
  });

  it('returns a no-op cleanup when auth subscription setup fails', async () => {
    const onAuthStateChange = vi.fn(() => {
      throw new Error('subscribe failed');
    });
    const { onAuthChange } = await importSupabaseSync({ onAuthStateChange });

    expect(() => onAuthChange(vi.fn())()).not.toThrow();
  });

  it('loads cloud state when structuredClone cannot clone the local state object', async () => {
    const from = vi.fn((table) => {
      if (table === 'profiles') {
        return createQueryResult({
          settings: { cleanStartVersion: '2026-08-31-from-zero-v2' },
          density_mode: 'focus',
        });
      }
      return createQueryResult([]);
    });
    const { loadCloudState } = await importSupabaseSync({ from });

    const state = await loadCloudState({
      schemaVersion: 3,
      settings: { density: 'balanced' },
      deleted: {},
      deletedMeta: {},
      transient: () => true,
    });

    expect(state).toMatchObject({
      schemaVersion: 3,
      settings: { density: 'focus' },
      user: { id: 'user-1' },
      sync: { status: 'synced', pending: false },
    });
    expect(state.transient).toBeUndefined();
  });

  it('normalizes profile columns while loading cloud state', async () => {
    const invalidFrom = vi.fn((table) => {
      if (table === 'profiles') {
        return createQueryResult({
          settings: {
            cleanStartVersion: '2026-06-15-from-zero-v1',
            cleanStartAppliedAt: 'bad-time',
            customTasksUpdatedAt: '2026-06-16T00:00:00Z',
            resourcesUpdatedAt: 'bad-time',
            constructor: 'bad',
            planControls: {
              planIntensity: 'evil',
              focusSubject: '408',
              enabledSubjects: ['english', 'bad-subject'],
              reviewLoad: 99,
            },
          },
          target_exam_date: 'bad-date',
          weekday_minutes: 'bad-weekday',
          weekend_minutes: 'bad-weekend',
          task_count: 'bad-count',
          core_ratio: 'bad-ratio',
          density_mode: 'compact',
          review_days: 'bad-days',
          retro_time: '25:99',
          plan_version: '',
        });
      }
      return createQueryResult([]);
    });
    const invalidClient = await importSupabaseSync({ from: invalidFrom });

    const invalidState = await invalidClient.loadCloudState({
      schemaVersion: 3,
      settings: {
        targetExamDate: '2027-12-25',
        weekdayMinutes: 180,
        weekendMinutes: 300,
        taskCount: 4,
        coreRatio: 70,
        density: 'detail',
        reviewDays: [14, '3', 3, 0, 400],
        retroTime: '21:30',
        planLogicVersion: 'local-plan',
      },
      deleted: {},
      deletedMeta: {},
    });

    expect(invalidState.settings).toMatchObject({
      targetExamDate: '2027-12-25',
      weekdayMinutes: 180,
      weekendMinutes: 300,
      taskCount: 4,
      coreRatio: 70,
      density: 'detail',
      reviewDays: [1, 3, 14, 365],
      retroTime: '21:30',
      planLogicVersion: 'local-plan',
      customTasksUpdatedAt: '2026-06-16T00:00:00.000Z',
      planControls: {
        planIntensity: 'normal',
        focusSubject: 'cs408',
        experienceTrack: 'balanced',
        reviewLoad: 60,
        maxNewTopics: 3,
        rollingWindowDays: 30,
        enabledSubjects: ['english', 'math', 'cs408', 'review'],
      },
    });
    expect(invalidState.settings).not.toHaveProperty('constructor');
    expect(invalidState.settings).not.toHaveProperty('resourcesUpdatedAt');

    const validFrom = vi.fn((table) => {
      if (table === 'profiles') {
        return createQueryResult({
          settings: { cleanStartVersion: '2026-06-15-from-zero-v1' },
          target_exam_date: '2027-12-26',
          weekday_minutes: 30,
          weekend_minutes: 999,
          task_count: 5,
          core_ratio: 10,
          density_mode: 'focus',
          review_days: [7, '7', 0, 400],
          retro_time: '06:05',
          plan_version: 'cloud-plan',
        });
      }
      return createQueryResult([]);
    });
    const validClient = await importSupabaseSync({ from: validFrom });

    const validState = await validClient.loadCloudState({
      schemaVersion: 3,
      settings: { density: 'balanced', reviewDays: [14] },
      deleted: {},
      deletedMeta: {},
    });

    expect(validState.settings).toMatchObject({
      targetExamDate: '2027-12-26',
      weekdayMinutes: 60,
      weekendMinutes: 840,
      taskCount: 4,
      coreRatio: 55,
      density: 'focus',
      reviewDays: [1, 7, 365],
      retroTime: '06:05',
      planLogicVersion: 'cloud-plan',
    });
  });

  it('filters malformed remote table rows while loading cloud state', async () => {
    const tableCalls = {};
    const from = vi.fn((table) => {
      tableCalls[table] = (tableCalls[table] || 0) + 1;
      if (table === 'profiles') {
        return createQueryResult({
          settings: { cleanStartVersion: '2026-08-31-from-zero-v2' },
        });
      }
      if (table === 'daily_records') {
        return createQueryResult([
          { study_date: '2026-09-01', math_minutes: 60, quality_score: { bad: true }, next_task: { bad: true }, note: { bad: true }, updated_at: '2026-09-01T08:00:00.000Z' },
          { math_minutes: 90 },
          { study_date: 'bad-date', math_minutes: 30 },
          { study_date: '2026-02-31', math_minutes: 45 },
          null,
          ['bad'],
          'bad-row',
        ]);
      }
      if (table === 'study_tasks') {
        return tableCalls[table] === 1
          ? createQueryResult([
            { id: 'task-remote', task_date: '2026-09-01', subject: { bad: true }, title: { bad: true }, topic_id: '__proto__', source_task_id: 'constructor', status: 'bad-status', source: { bad: true }, contract_type: '__proto__', required_artifacts: ['推导图', { bad: true }, '__proto__', ''], locked: 'false', record_applied: 'false', evidence_submitted: 'true' },
            { id: '', task_date: '2026-09-01', title: '无 ID 任务', status: 'done' },
          ])
          : createQueryResult([]);
      }
      if (table === 'review_items') {
        return tableCalls[table] === 1
          ? createQueryResult([
            { id: 'review-remote', due_date: '2026-09-01', subject: { bad: true }, title: { bad: true }, failure_reason: { bad: true }, topic_id: '__proto__', source_task_id: 'constructor', status: 'bad-status', last_result: 'bad-result' },
            { id: '', due_date: '2026-09-01', title: '无 ID 复盘', status: 'done' },
          ])
          : createQueryResult([]);
      }
      if (table === 'mock_scores') {
        return tableCalls[table] === 1
          ? createQueryResult([
            { id: 'score-remote', mock_date: '2026-09-01', name: { bad: true }, note: { bad: true }, politics: 70, english: 60, math: 100, cs408: 90, total: { bad: true } },
          ])
          : createQueryResult([]);
      }
      if (table === 'resources') {
        return createQueryResult([
          { resource_key: 'math-book', progress: 40 },
          { resource_key: '__proto__', progress: 100 },
          { progress: 20 },
          null,
        ]);
      }
      if (table === 'topic_progress') {
        return createQueryResult([
          { topic_id: 'math/topic', status_value: 2, evidence: { bad: true }, mastery_status: 'bad-status', prerequisites: ['极限', { bad: true }, 'constructor', ''], updated_at: '2026-09-01T09:00:00.000Z' },
          { topic_id: '__proto__', status_value: 2, evidence: 'bad', updated_at: '2026-09-01T09:00:00.000Z' },
          { status_value: 1, updated_at: '2026-09-01T09:00:00.000Z' },
        ]);
      }
      return createQueryResult([]);
    });
    const { loadCloudState } = await importSupabaseSync({ from });

    const state = await loadCloudState({
      schemaVersion: 3,
      settings: {},
      deleted: {},
      deletedMeta: {},
    });

    expect(state.entries).toEqual({
      '2026-09-01': expect.objectContaining({ math: 60, quality: 3, nextTask: '', note: '' }),
    });
    expect(state.weekPlans).toEqual({
      '2026-09-01': [expect.objectContaining({
        id: 'task-remote',
        subject: '复盘',
        text: '回炉错题，写明下次识别信号',
        topicId: '',
        sourceTaskId: '',
        source: 'generated',
        contractType: 'problems',
        requiredArtifacts: ['推导图'],
        locked: false,
        recordApplied: false,
        evidenceSubmitted: true,
        status: 'todo',
      })],
    });
    expect(state.reviewItems).toEqual([
      expect.objectContaining({
        id: 'review-remote',
        topicId: '',
        sourceTaskId: '',
        subject: '复盘',
        text: '复盘',
        status: 'due',
        failureReason: '',
        lastResult: '',
        done: false,
      }),
    ]);
    expect(state.topics).toEqual({ 'math/topic': 2 });
    expect(state.topicEvidence['math/topic']).toEqual(expect.objectContaining({
      evidence: '',
      masteryStatus: 'mastered',
      prerequisites: ['极限'],
      updatedAt: '2026-09-01T09:00:00.000Z',
    }));
    expect(state.scores).toEqual([expect.objectContaining({
      id: 'score-remote',
      name: '未命名模考',
      total: 320,
      note: '',
    })]);
    expect(Object.getPrototypeOf(state.topicEvidence)).toBe(Object.prototype);
    expect(state.resources).toEqual({ 'math-book': 40 });
  });

  it('loads cloud state when local settings is malformed', async () => {
    const from = vi.fn((table) => {
      if (table === 'profiles') {
        return createQueryResult({
          settings: { cleanStartVersion: '2026-06-15-from-zero-v1' },
          weekday_minutes: 180,
          density_mode: 'focus',
        });
      }
      return createQueryResult([]);
    });
    const { loadCloudState } = await importSupabaseSync({ from });

    const state = await loadCloudState({
      schemaVersion: 3,
      settings: null,
      deleted: null,
      deletedMeta: null,
    });

    expect(state.settings).toMatchObject({
      weekdayMinutes: 180,
      density: 'focus',
    });
    expect(state.deleted).toEqual({ records: [], scores: [], tasks: [], reviews: [] });
  });

  it('saves cloud snapshots with clone-safe payloads and normalized reasons', async () => {
    const queries = [];
    const from = vi.fn((table) => {
      const query = createQueryResult([]);
      query.table = table;
      queries.push(query);
      return query;
    });
    const { saveCloudSnapshot } = await importSupabaseSync({ from });
    const entry = { math: 45, large: 10n };
    entry.self = entry;

    await expect(saveCloudSnapshot({
      entries: { '2026-06-16': entry },
      sync: { cloudPaused: 'false', localImportPending: 'false' },
      user: { email: 'local@example.com' },
      snapshots: [{ reason: 'nested' }],
    }, 'x'.repeat(130))).resolves.toBeUndefined();

    const insertPayload = queries.find((query) => query.table === 'snapshots')?.insert.mock.calls[0]?.[0];
    expect(insertPayload).toMatchObject({
      user_id: 'user-1',
      reason: 'x'.repeat(120),
      payload: {
        reason: 'x'.repeat(120),
        entries: { '2026-06-16': { math: 45, large: '10' } },
      },
    });
    expect(insertPayload.payload.user).toBeUndefined();
    expect(insertPayload.payload.sync).toBeUndefined();
    expect(insertPayload.payload.snapshots).toBeUndefined();
  });

  it('saves cloud state with malformed local containers and ignores loose task buckets', async () => {
    const queries = [];
    const from = vi.fn((table) => {
      const query = createQueryResult([]);
      query.table = table;
      queries.push(query);
      return query;
    });
    const { saveCloudState } = await importSupabaseSync({ from });

    await expect(saveCloudState({
      settings: 'bad-settings',
      sync: { cloudPaused: 'false', localImportPending: 'false' },
      entries: 'bad-entries',
      weekPlans: {
        '2026-09-01': { id: 'loose-task', date: '2026-09-01', text: '不应同步' },
        '2026-09-02': [
          'bad-task',
          ['bad-task-array'],
          { id: 'task-safe', date: '2026-09-02', text: '安全任务', topicId: 'topic-safe', status: 'bad-status' },
        ],
      },
      tasks: 'bad-task-state',
      reviewItems: 'bad-review-items',
      topics: { 'topic-safe': 2 },
      topicEvidence: { 'topic-safe': 'bad-evidence' },
      scores: 'bad-scores',
      resources: 'bad-resources',
      deleted: 'bad-deleted',
      deletedMeta: 'bad-deleted-meta',
    })).resolves.toEqual({ syncedAt: expect.any(String) });

    const upsertPayloads = (table) => queries
      .filter((query) => query.table === table)
      .flatMap((query) => query.upsert.mock.calls.map(([payload]) => payload));
    const upsertRows = (table) => upsertPayloads(table).find((payload) => Array.isArray(payload));

    expect(upsertPayloads('profiles').find((payload) => !Array.isArray(payload))).toMatchObject({
      weekday_minutes: 60,
      weekend_minutes: 60,
      task_count: 3,
      core_ratio: 55,
      target_exam_date: '2027-12-25',
      density_mode: 'focus',
      retro_time: '22:00',
      plan_version: '4.1-evidence-capacity-governance-2026-08-31',
    });
    expect(upsertRows('daily_records')).toBeUndefined();
    expect(upsertRows('study_tasks').map((row) => row.id)).toEqual(['task-safe']);
    expect(upsertRows('study_tasks')[0]).toEqual(expect.objectContaining({
      title: '安全任务',
      topic_id: 'topic-safe',
      status: 'todo',
    }));
    expect(upsertRows('topic_progress')).toEqual([expect.objectContaining({
      topic_id: 'topic-safe',
      problems_done: 0,
      evidence: '',
      mastery_status: 'mastered',
    })]);
    expect(upsertRows('resources')).toBeUndefined();
  });

  it('filters unsafe local keys before saving cloud state', async () => {
    const queries = [];
    const from = vi.fn((table) => {
      const query = createQueryResult([]);
      query.table = table;
      queries.push(query);
      return query;
    });
    const { saveCloudState } = await importSupabaseSync({ from });

    await expect(saveCloudState({
      settings: {
        targetExamDate: '2027-12-25',
        weekdayMinutes: 120,
        weekendMinutes: 240,
        taskCount: 3,
        coreRatio: 70,
        reviewDays: [1, 3, 7],
        density: 'focus',
        retroTime: '22:00',
        planLogicVersion: 'test',
        cleanStartVersion: '2026-08-31-from-zero-v2',
        cleanStartAppliedAt: '2026-09-01T00:00:00.000Z',
      },
      entries: {
        '2026-09-01': { math: 45, quality: { bad: true }, quality_score: '4', nextTask: { bad: true }, note: { bad: true } },
        'bad-date': { math: 90 },
        '2026-02-31': { math: 30 },
      },
      weekPlans: {
        '2026-09-01': [
          {
            id: 'task-safe',
            date: '2026-09-01',
            subject: { bad: true },
            text: { bad: true },
            title: '安全任务标题',
            topicId: 'topic-safe',
            sourceTaskId: '__proto__',
            status: 'done',
            source: { bad: true },
            contractType: '__proto__',
            contract_type: 'practice',
            requiredProblemCount: { bad: true },
            required_problem_count: '12',
            requiredAccuracy: { bad: true },
            required_accuracy: '84',
            requiredArtifacts: ['错题照片', { bad: true }, 'prototype', ''],
            minutesMin: { bad: true },
            minutes_min: '20',
            minutesMax: { bad: true },
            minutes_max: '45',
            actualProblems: { bad: true },
            actual_problems: '10',
            actualCorrect: { bad: true },
            actual_correct: '9',
            actualMinutes: { bad: true },
            actual_minutes: '30',
            locked: 'false',
            recordApplied: 'false',
            evidenceSubmitted: { bad: true },
            evidence_submitted: 'true',
          },
          { id: '__proto__', date: '2026-09-01', subject: '数学', text: '坏任务' },
        ],
      },
      tasks: { 'task-safe': true, __proto__: true },
      reviewItems: [
        { id: 'review-safe', dueDate: '2026-09-01', sourceTaskId: '__proto__', topicId: 'constructor', subject: { bad: true }, text: { bad: true }, title: '安全复盘', failureReason: { bad: true }, failure_reason: '需要重做', status: 'bad-status', done: 'false', lastResult: { bad: true }, last_result: 'delay', delayCount: { bad: true }, delay_count: '3', quality: { bad: true }, quality_score: '4', intervalIndex: { bad: true }, interval_index: '2', failStreak: { bad: true }, fail_streak: '1' },
        { id: '__proto__', dueDate: '2026-09-01', text: '坏复盘' },
      ],
      topics: {
        'topic-safe': 2,
        __proto__: 1,
      },
      topicEvidence: {
        'topic-safe': {
          problems: '18',
          accuracy: '82',
          evidence: { bad: true },
          masteryStatus: 'bad-status',
          totalProblems: { bad: true },
          total_problems: '32',
          recent14dAccuracy: { bad: true },
          recent_14d_accuracy: '76',
          updatedAt: '2026-09-01T08:00:00.000Z',
        },
      },
      scores: [
        { id: 'score-safe', date: '2026-09-01', name: { bad: true }, note: { bad: true }, politics: 70, english: 60, math: 100, cs408: 90, total: { bad: true } },
        { id: '__proto__', date: '2026-09-01', politics: 80 },
      ],
      resources: {
        'math-book': 40,
        __proto__: 100,
        constructor: 50,
      },
      customTasks: [],
      project: {},
      deleted: {
        records: ['bad-date', '2026-02-31', '2026-09-01'],
        scores: ['__proto__', 'score-safe'],
        tasks: ['constructor', 'task-safe'],
        reviews: ['prototype', 'review-safe'],
      },
      deletedMeta: {
        records: { '2026-09-01': '2026-09-02T00:00:00.000Z', 'bad-date': '2026-09-02T00:00:00.000Z', '2026-02-31': '2026-09-02T00:00:00.000Z' },
        scores: { 'score-safe': '2026-06-17T01:00:00.000Z', __proto__: '2026-06-17T01:00:00.000Z' },
        tasks: { 'task-safe': '2026-06-17T02:00:00.000Z', constructor: '2026-06-17T02:00:00.000Z' },
        reviews: { 'review-safe': '2026-06-17T03:00:00.000Z', prototype: '2026-06-17T03:00:00.000Z' },
      },
    })).resolves.toEqual({ syncedAt: expect.any(String) });

    const upsertRows = (table) => queries
      .filter((query) => query.table === table)
      .flatMap((query) => query.upsert.mock.calls.map(([payload]) => payload))
      .find((payload) => Array.isArray(payload));
    const deleteIds = (table, column) => queries
      .filter((query) => query.table === table)
      .flatMap((query) => query.in.mock.calls)
      .filter(([field]) => field === column)
      .flatMap(([, ids]) => ids);

    expect(upsertRows('daily_records')).toEqual([expect.objectContaining({
      study_date: '2026-09-01',
      quality_score: 4,
      next_task: '',
      note: '',
    })]);
    expect(upsertRows('study_tasks')).toEqual([expect.objectContaining({
      id: 'task-safe',
      subject: '复盘',
      title: '安全任务标题',
      topic_id: 'topic-safe',
      source_task_id: '',
      source: 'generated',
      contract_type: 'practice',
      required_problem_count: 12,
      required_accuracy: 0.84,
      minutes_min: 20,
      minutes_max: 45,
      actual_problems: 10,
      actual_correct: 9,
      actual_minutes: 30,
      locked: false,
      record_applied: false,
      evidence_submitted: true,
      required_artifacts: ['错题照片'],
    })]);
    expect(upsertRows('review_items')).toEqual([expect.objectContaining({
      id: 'review-safe',
      subject: '复盘',
      title: '安全复盘',
      topic_id: '',
      source_task_id: '',
      status: 'due',
      failure_reason: '需要重做',
      delay_count: 3,
      quality_score: 4,
      interval_index: 2,
      fail_streak: 1,
      last_result: 'delay',
    })]);
    expect(upsertRows('topic_progress')).toEqual([expect.objectContaining({
      topic_id: 'topic-safe',
      problems_done: 18,
      accuracy: 82,
      evidence: '',
      total_problems: 32,
      recent_14d_accuracy: 0.76,
      mastery_status: 'mastered',
    })]);
    expect(upsertRows('mock_scores')).toEqual([expect.objectContaining({
      id: 'score-safe',
      name: '未命名模考',
      total: 320,
      note: '',
    })]);
    expect(upsertRows('resources')).toEqual([expect.objectContaining({ resource_key: 'math-book', progress: 40 })]);
    expect(deleteIds('daily_records', 'study_date')).toEqual(['2026-09-01']);
    expect(deleteIds('mock_scores', 'id')).toEqual(['score-safe']);
    expect(deleteIds('study_tasks', 'id')).toEqual(['task-safe']);
    expect(deleteIds('review_items', 'id')).toEqual(['review-safe']);
  });
});

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from '../../src/core/state-manager.js';
import { OfflineCache } from '../../src/infrastructure/offline-cache.js';
import * as FactIndexView from '../../src/views/fact-index-view.js';
import * as RecordsView from '../../src/views/records-view.js';
import * as ReviewsView from '../../src/views/reviews-view.js';
import * as RetrospectiveView from '../../src/views/retrospective-view.js';
import * as SettingsView from '../../src/views/settings-view.js';
import * as ShowcaseView from '../../src/views/showcase-view.js';
import * as TodayView from '../../src/views/today-view.js';
import * as WeeklyView from '../../src/views/weekly-view.js';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let container;

function restoreUrlMethod(name, original) {
  if (original) {
    Object.defineProperty(URL, name, { configurable: true, value: original });
  } else {
    delete URL[name];
  }
}

function mockBlobDownload({ clickError = null, url = 'blob:records' } = {}) {
  let capturedBlob = null;
  const createObjectURL = vi.fn((blob) => {
    capturedBlob = blob;
    return url;
  });
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
    if (clickError) throw clickError;
  });

  return {
    get blob() {
      return capturedBlob;
    },
    click,
    createObjectURL,
    revokeObjectURL,
  };
}

describe('module views', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    document.documentElement.removeAttribute('data-density');
    StateManager.clear();
  });

  afterEach(() => {
    FactIndexView.unmount();
    SettingsView.unmount();
    RecordsView.unmount();
    ReviewsView.unmount();
    RetrospectiveView.unmount();
    ShowcaseView.unmount();
    TodayView.unmount();
    WeeklyView.unmount();
    StateManager.clear();
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreUrlMethod('createObjectURL', originalCreateObjectURL);
    restoreUrlMethod('revokeObjectURL', originalRevokeObjectURL);
  });

  it('keeps settings density aria-pressed aligned with the selected mode', () => {
    SettingsView.mount(container);

    const balanced = container.querySelector('[data-density="balanced"]');
    const focus = container.querySelector('[data-density="focus"]');

    expect(balanced?.classList.contains('active')).toBe(true);
    expect(balanced?.getAttribute('aria-pressed')).toBe('true');
    expect(focus?.getAttribute('aria-pressed')).toBe('false');

    focus.click();

    expect(StateManager.getState('profile.density_mode')).toBe('focus');
    expect(document.documentElement.getAttribute('data-density')).toBe('focus');
    expect(focus.classList.contains('active')).toBe(true);
    expect(focus.getAttribute('aria-pressed')).toBe('true');
    expect(balanced.classList.contains('active')).toBe(false);
    expect(balanced.getAttribute('aria-pressed')).toBe('false');
  });

  it('ignores tampered settings density values and normalizes bad retro time', () => {
    StateManager.setState('profile.density_mode', 'evil-mode');
    StateManager.setState('profile.retro_time', '99:99');
    SettingsView.mount(container);

    const balanced = container.querySelector('[data-density="balanced"]');
    expect(balanced?.classList.contains('active')).toBe(true);
    expect(container.querySelector('#sv-retro-time')?.value).toBe('22:00');

    balanced.dataset.density = 'constructor';
    balanced.click();
    expect(StateManager.getState('profile.density_mode')).toBe('evil-mode');

    const time = container.querySelector('#sv-retro-time');
    time.value = '25:61';
    container.querySelector('#sv-save-retro-time').click();
    expect(StateManager.getState('profile.retro_time')).toBe('22:00');
    expect(time.value).toBe('22:00');
  });

  it('renders settings templates as inert text and safe attributes', () => {
    StateManager.setState('settings.custom_templates', [{
      name: '刷题" autofocus onfocus="window.__xss=1',
      subject: '<script>window.__subjectXss=1</script>',
      estimatedMinutes: Number.POSITIVE_INFINITY,
    }]);

    SettingsView.mount(container);

    const deleteButton = container.querySelector('.template-delete-btn');
    expect(deleteButton?.getAttribute('aria-label')).toBe('删除模板: 刷题" autofocus onfocus="window.__xss=1');
    expect(deleteButton?.hasAttribute('autofocus')).toBe(false);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>window.__subjectXss=1</script>');
    expect(container.textContent).toContain('0分钟');
  });

  it('keeps raw mocked settings template object fields out of visible labels', () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'settings.custom_templates') {
        return [{
          name: { bad: true },
          subject: { bad: true },
          estimatedMinutes: { bad: true },
        }];
      }
      return originalGetState(path);
    });

    SettingsView.mount(container);

    const deleteButton = container.querySelector('.template-delete-btn');
    expect(container.textContent).toContain('未命名模板');
    expect(container.textContent).toContain('0分钟');
    expect(container.textContent).not.toContain('[object Object]');
    expect(deleteButton?.getAttribute('aria-label')).toBe('删除模板: 未命名模板');
  });

  it('ignores invalid settings template delete indexes', () => {
    StateManager.setState('settings.custom_templates', [
      { name: 'A', subject: 'math', estimatedMinutes: 30 },
      { name: 'B', subject: 'cs408', estimatedMinutes: 40 },
    ]);
    SettingsView.mount(container);

    const deleteButton = container.querySelector('.template-delete-btn');
    deleteButton.dataset.index = 'bad';
    deleteButton.click();

    expect(StateManager.getState('settings.custom_templates')).toHaveLength(2);
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('B');
  });

  it('skips malformed settings templates without drifting delete indexes', () => {
    StateManager.setState('settings.custom_templates', [
      'bad-template',
      { name: 'A', subject: 'math', estimatedMinutes: 30 },
      null,
      ['bad-array'],
      { name: 'B', subject: 'cs408', estimatedMinutes: 40 },
    ]);
    SettingsView.mount(container);

    const deleteButtons = [...container.querySelectorAll('.template-delete-btn')];
    expect(container.textContent).not.toContain('bad-template');
    expect(container.textContent).toContain('A');
    expect(container.textContent).toContain('B');
    expect(deleteButtons.map((button) => button.dataset.index)).toEqual(['1', '4']);

    deleteButtons[0].click();

    const templates = StateManager.getState('settings.custom_templates');
    expect(templates).toEqual([
      'bad-template',
      null,
      ['bad-array'],
      { name: 'B', subject: 'cs408', estimatedMinutes: 40 },
    ]);
    expect(container.textContent).not.toContain('A');
    expect(container.textContent).toContain('B');
  });

  it('surfaces settings persistence failures without discarding a new template', () => {
    SettingsView.mount(container);

    const originalSetState = StateManager.setState.bind(StateManager);
    vi.spyOn(StateManager, 'setState').mockImplementation((path, value) => {
      originalSetState(path, value);
      return path === 'settings.custom_templates' ? false : true;
    });

    container.querySelector('#sv-tpl-name').value = '错题回炉';
    container.querySelector('#sv-tpl-subject').value = 'math';
    container.querySelector('#sv-template-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const templates = StateManager.getState('settings.custom_templates');
    const feedback = container.querySelector('#sv-settings-feedback');
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ name: '错题回炉', subject: 'math' });
    expect(container.textContent).toContain('错题回炉');
    expect(feedback?.classList.contains('error')).toBe(true);
    expect(feedback?.textContent).toContain('本机缓存写入失败');
    expect(feedback?.textContent).toContain('导出备份');
  });

  it('releases settings export URLs even when a local backup download fails', async () => {
    StateManager.setState('entries', {
      '2026-06-09': { math: 45 },
    });
    StateManager.setState('sync', { lastError: 'contains-session-details' });
    StateManager.setState('user', { email: 'me@example.com' });
    StateManager.setState('snapshots', [{
      reason: 'manual',
      createdAt: '2026-06-09T00:00:00.000Z',
      payload: {
        entries: { '2026-06-08': { math: 30 } },
        sync: { lastError: 'nested-session-details' },
        user: { email: 'snapshot@example.com' },
        snapshots: [{ reason: 'nested' }],
      },
    }, {
      reason: { bad: true },
      createdAt: { bad: true },
      payload: {
        entries: { '2026-06-07': { math: 20 } },
        user: { email: 'object-snapshot@example.com' },
      },
    }]);
    const download = mockBlobDownload({
      clickError: new Error('blocked-download'),
      url: 'blob:settings',
    });
    SettingsView.mount(container);

    container.querySelector('#sv-export-data').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(download.createObjectURL).toHaveBeenCalledTimes(1);
    expect(download.click).toHaveBeenCalledTimes(1);
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:settings');
    expect(container.querySelector('#sv-export-feedback')?.textContent).toBe('导出失败: blocked-download');

    const payload = JSON.parse(await download.blob.text());
    const serialized = JSON.stringify(payload);
    expect(payload.entries).toEqual({ '2026-06-09': { math: 45 } });
    expect(payload.sync).toBeUndefined();
    expect(payload.user).toBeUndefined();
    expect(payload.snapshots).toEqual([{
      reason: 'manual',
      createdAt: '2026-06-09T00:00:00.000Z',
      payload: { entries: { '2026-06-08': { math: 30 } } },
    }, {
      reason: 'manual',
      createdAt: '',
      payload: { entries: { '2026-06-07': { math: 20 } } },
    }]);
    expect(serialized).not.toContain('me@example.com');
    expect(serialized).not.toContain('snapshot@example.com');
    expect(serialized).not.toContain('object-snapshot@example.com');
    expect(serialized).not.toContain('contains-session-details');
    expect(serialized).not.toContain('nested-session-details');
    expect(serialized).not.toContain('[object Object]');
  });

  it('keeps object-like settings export errors out of feedback', async () => {
    StateManager.setState('entries', {
      '2026-06-09': { math: 45 },
    });
    const download = mockBlobDownload({
      clickError: { message: { toString: () => 'object-error' }, details: 'safe-download-detail' },
      url: 'blob:settings-object-error',
    });
    SettingsView.mount(container);

    container.querySelector('#sv-export-data').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:settings-object-error');
    expect(container.querySelector('#sv-export-feedback')?.textContent).toBe('导出失败: safe-download-detail');
    expect(container.querySelector('#sv-export-feedback')?.textContent).not.toContain('[object Object]');
  });

  it('exports local settings backup even when state contains circular objects', async () => {
    const circular = { email: 'nested@example.com' };
    circular.self = circular;
    const circularState = {
      entries: {
        '2026-06-09': {
          math: 45,
          nested: {
            sync: { token: 'secret-token' },
            user: circular,
          },
        },
      },
    };
    const originalGetState = StateManager.getState.bind(StateManager);
    const download = mockBlobDownload({ url: 'blob:circular-settings' });
    SettingsView.mount(container);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === undefined) return circularState;
      return originalGetState(path);
    });

    container.querySelector('#sv-export-data').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(download.createObjectURL).toHaveBeenCalledTimes(1);
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:circular-settings');
    expect(container.querySelector('#sv-export-feedback')?.textContent).toBe('✓ 本地数据已导出');

    const payload = JSON.parse(await download.blob.text());
    const serialized = JSON.stringify(payload);
    expect(payload.entries['2026-06-09'].math).toBe(45);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('nested@example.com');
  });
  it('does not download an empty records CSV', () => {
    const download = mockBlobDownload();
    RecordsView.mount(container);

    container.querySelector('#rv-export-csv').click();

    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(download.click).not.toHaveBeenCalled();
    expect(container.querySelector('#rv-export-feedback')?.textContent).toBe('暂无可导出记录');
  });

  it('renders imported record keys as inert text', () => {
    StateManager.setState('entries', {
      '<img src=x onerror="window.__recordsXss=1">': {
        math: '15<script>window.__minutesXss=1</script>',
        english: 20,
      },
    });

    RecordsView.mount(container);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="window.__recordsXss=1">');
    expect(container.textContent).toContain('数0');
    expect(container.innerHTML).toContain('&lt;img src=x onerror=');
  });

  it('neutralizes formula-like CSV cells and revokes the generated blob URL', async () => {
    StateManager.setState('entries', {
      '=IMPORTXML("https://example.test")': {
        math: 45,
        english: 20,
      },
    });
    const download = mockBlobDownload();
    RecordsView.mount(container);

    container.querySelector('#rv-export-csv').click();

    expect(download.createObjectURL).toHaveBeenCalledTimes(1);
    expect(download.click).toHaveBeenCalledTimes(1);
    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:records');
    expect(container.querySelector('#rv-export-feedback')?.textContent).toBe('CSV 已导出');

    const text = await download.blob.text();
    expect(text).toContain('"\'=IMPORTXML(""https://example.test"")"');
    expect(text).toContain('"45"');
    expect(text).not.toContain('\n=IMPORTXML');
  });

  it('keeps object-like records export errors out of feedback', () => {
    StateManager.setState('entries', {
      '2026-06-09': {
        math: 45,
      },
    });
    const download = mockBlobDownload({
      clickError: { message: { toString: () => 'object-error' }, details: 'safe-csv-detail' },
      url: 'blob:records-object-error',
    });
    RecordsView.mount(container);

    container.querySelector('#rv-export-csv').click();

    expect(download.revokeObjectURL).toHaveBeenCalledWith('blob:records-object-error');
    expect(container.querySelector('#rv-export-feedback')?.textContent).toBe('CSV 导出失败: safe-csv-detail');
    expect(container.querySelector('#rv-export-feedback')?.textContent).not.toContain('[object Object]');
  });

  it('clamps dirty record numbers for display and CSV export', async () => {
    StateManager.setState('entries', {
      '2026-06-09': {
        math: -45,
        cs408: 'Infinity',
        english: 20,
        politics: '-5',
        project: '=SUM(1,2)',
        mathProblems: -1,
        csProblems: 'bad',
        reading: 3,
        newMistakes: '-2',
        fixedMistakes: 1,
      },
    });
    const download = mockBlobDownload();
    RecordsView.mount(container);

    expect(container.textContent).toContain('数0');
    expect(container.textContent).toContain('408:0');
    expect(container.textContent).toContain('英20');
    expect(container.textContent).toContain('政0');
    expect(container.textContent).toContain('项0');
    expect(container.textContent).not.toContain('Infinity');
    expect(container.textContent).not.toContain('=SUM');

    container.querySelector('#rv-export-csv').click();

    const text = await download.blob.text();
    expect(text).toContain('"2026-06-09","0","0","20","0","0","0","0","3","0","1"');
  });

  it('keeps raw mocked record object dates out of display and CSV export', async () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') {
        return {
          'object-date-key': {
            date: { bad: true },
            mathMin: 45,
            csMin: { bad: true },
          },
        };
      }
      return originalGetState(path);
    });
    const download = mockBlobDownload();
    RecordsView.mount(container);

    expect(container.textContent).toContain('object-date-key');
    expect(container.textContent).not.toContain('[object Object]');

    container.querySelector('#rv-export-csv').click();

    const text = await download.blob.text();
    expect(text).toContain('"object-date-key","45","0"');
    expect(text).not.toContain('[object Object]');
  });

  it('ignores tampered record filters and malformed record rows', () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') {
        return {
          '2026-06-09': { mathMin: 45 },
          '2026-06-10': null,
        };
      }
      return originalGetState(path);
    });

    RecordsView.mount(container);
    const subject = container.querySelector('#rv-subject-filter');
    subject.insertAdjacentHTML('beforeend', '<option value="constructor">tampered</option>');
    subject.value = 'constructor';
    container.querySelector('#rv-apply-filter').click();

    expect(container.textContent).toContain('2026-06-09');
    expect(container.textContent).toContain('2026-06-10');
    expect(container.textContent).not.toContain('undefined');
  });

  it('keeps malformed record dates visible but excludes them from date filtering and monthly buckets', () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') {
        return {
          'not-a-date': { mathMin: 60 },
          '2026-02-31': { mathMin: 30 },
          '2026-06-09': { mathMin: 45 },
        };
      }
      return originalGetState(path);
    });

    RecordsView.mount(container);

    const statsPanelText = [...container.querySelectorAll('.panel')]
      .find((panel) => panel.textContent.includes('统计'))
      ?.textContent;
    expect(container.textContent).toContain('not-a-date');
    expect(container.textContent).toContain('2026-02-31');
    expect(statsPanelText).toContain('2026-06');
    expect(statsPanelText).not.toContain('not-a-');
    expect(statsPanelText).not.toContain('2026-02');

    container.querySelector('#rv-start-date').value = '2026-06-01';
    container.querySelector('#rv-end-date').value = '2026-06-30';
    container.querySelector('#rv-apply-filter').click();

    expect(container.textContent).toContain('2026-06-09');
    expect(container.textContent).not.toContain('not-a-date');
    expect(container.textContent).not.toContain('2026-02-31');
  });

  it('renders review topic ids as inert text while preserving action ids', () => {
    const today = new Date().toISOString().slice(0, 10);
    const topicId = '<img src=x onerror="window.__reviewXss=1">';
    StateManager.setState('review_items', [{
      topicId,
      subject: 'math',
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: '2<script>window.__failXss=1</script>',
    }]);

    ReviewsView.mount(container);

    const passButton = container.querySelector('.review-pass-btn');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(topicId);
    expect(container.textContent).toContain('连续失败: 0');
    expect(container.innerHTML).toContain('&lt;img src=x onerror=');
    expect(passButton?.dataset.topicId).toBe(topicId);
    expect(passButton?.getAttribute('aria-label')).toBe(`通过: ${topicId}`);
    expect(passButton?.dataset.reviewIndex).toBe('0');
  });

  it('skips malformed review due dates and completed review records', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [
      { topicId: 'bad-date', nextDueAt: 'not-a-date', intervalIndex: 0 },
      { topicId: 'done-item', nextDueAt: today, status: 'done', intervalIndex: 0 },
      { topicId: 'valid-item', nextDueAt: today, intervalIndex: 0 },
    ]);

    ReviewsView.mount(container);

    expect(container.textContent).not.toContain('bad-date');
    expect(container.textContent).not.toContain('done-item');
    expect(container.textContent).toContain('valid-item');
    expect(container.querySelectorAll('.review-pass-btn')).toHaveLength(1);
  });

  it('renders sanitized fallback review labels after StateManager adaptation', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [{
      topicId: '',
      topic: { bad: true },
      title: { bad: true },
      text: { bad: true },
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: 0,
    }]);

    ReviewsView.mount(container);
    expect(container.textContent).toContain('未命名');
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.querySelector('.review-pass-btn')?.getAttribute('aria-label')).toBe('通过: 未命名');

    ReviewsView.unmount();
    container.innerHTML = '';
    TodayView.mount(container);
    expect(container.textContent).toContain('未命名');
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.querySelector('.today-review-panel .review-pass-btn')?.getAttribute('aria-label')).toBe('通过: 未命名');
  });

  it('keeps raw mocked review object fields out of review and today labels', () => {
    const today = new Date().toISOString().slice(0, 10);
    const rawReviewItems = [
      {
        topicId: { bad: true },
        topic: { bad: true },
        subject: 'math',
        nextDueAt: today,
        intervalIndex: 0,
        failStreak: { bad: true },
      },
      {
        topicId: { bad: true },
        topic: '线性代数错题',
        subject: 'math',
        nextDueAt: today,
        intervalIndex: 0,
        failStreak: 0,
        contract: {
          required_artifacts: [{ bad: true }, '复盘笔记'],
        },
      },
    ];
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'review_items') return rawReviewItems;
      if (path === 'candidate_topics') return [];
      if (path === 'blocked_topics') return [];
      if (path === 'daily_records') return {};
      if (path === 'settings') return { weekdayMinutes: 240, weekendMinutes: 240 };
      return originalGetState(path);
    });

    ReviewsView.mount(container);
    expect(container.textContent).toContain('未命名');
    expect(container.textContent).toContain('线性代数错题');
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.querySelector('.review-pass-btn')?.dataset.topicId).toBe('');
    expect(container.querySelector('.review-pass-btn')?.getAttribute('aria-label')).toBe('通过: 未命名');

    ReviewsView.unmount();
    container.innerHTML = '';
    TodayView.mount(container);
    const todayPassLabels = [...container.querySelectorAll('.today-review-panel .review-pass-btn')]
      .map(button => button.getAttribute('aria-label'));
    const planTitles = [...container.querySelectorAll('.plan-card-title')]
      .map(title => title.textContent);
    expect(container.textContent).toContain('未命名');
    expect(container.textContent).toContain('线性代数错题');
    expect(container.textContent).toContain('复盘笔记');
    expect(container.textContent).not.toContain('[object Object]');
    expect(planTitles).toContain('学习任务');
    expect(planTitles).toContain('线性代数错题');
    expect(todayPassLabels).toContain('通过: 未命名');
    expect(todayPassLabels).toContain('通过: 线性代数错题');
  });

  it('updates duplicate blank review topic ids by stable review index', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [
      { topicId: '', topic: 'first blank', nextDueAt: today, intervalIndex: 0, failStreak: 0 },
      { topicId: '', topic: 'second blank', nextDueAt: today, intervalIndex: 0, failStreak: 0 },
    ]);

    ReviewsView.mount(container);
    const failButtons = [...container.querySelectorAll('.review-fail-btn')];
    expect(failButtons.map((button) => button.dataset.reviewIndex)).toEqual(['0', '1']);
    const beforeFirst = { ...StateManager.getState('review_items')[0] };

    failButtons[1].click();

    const items = StateManager.getState('review_items');
    expect(items[0]).toMatchObject(beforeFirst);
    expect(items[1].lastResult).toBe('fail');
  });

  it('surfaces review persistence failures without discarding the in-memory result', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [{
      topicId: 'math-limit',
      subject: 'math',
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: 0,
    }]);
    const originalSetState = StateManager.setState.bind(StateManager);
    vi.spyOn(StateManager, 'setState').mockImplementation((path, value) => {
      originalSetState(path, value);
      return path === 'review_items' ? false : true;
    });

    ReviewsView.mount(container);
    container.querySelector('.review-pass-btn').click();

    const updated = StateManager.getState('review_items')[0];
    const feedback = container.querySelector('.review-action-feedback');
    expect(updated.lastResult).toBe('pass');
    expect(updated.lastSubmittedDate).toBe(today);
    expect(feedback?.classList.contains('error')).toBe(true);
    expect(feedback?.textContent).toContain('本机缓存写入失败');
    expect(feedback?.textContent).toContain('导出备份');
  });

  it('ignores malformed review action state without throwing', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [{
      topicId: 'math-limit',
      subject: 'math',
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: 0,
    }]);
    ReviewsView.mount(container);

    const originalGetState = StateManager.getState.bind(StateManager);
    const setStateSpy = vi.spyOn(StateManager, 'setState');
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'review_items') return ['not-a-review-row'];
      return originalGetState(path);
    });

    expect(() => container.querySelector('.review-pass-btn').click()).not.toThrow();
    expect(setStateSpy).not.toHaveBeenCalled();
  });

  it('ignores malformed stale review action state without throwing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
    StateManager.setState('review_items', [{
      topicId: 'stale-math',
      subject: 'math',
      nextDueAt: '2026-05-20',
      intervalIndex: 2,
      failStreak: 1,
    }]);
    ReviewsView.mount(container);

    const originalGetState = StateManager.getState.bind(StateManager);
    const setStateSpy = vi.spyOn(StateManager, 'setState');
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'review_items') return { bad: true };
      return originalGetState(path);
    });

    expect(() => container.querySelector('.stale-reset-btn').click()).not.toThrow();
    expect(setStateSpy).not.toHaveBeenCalled();
  });

  it('renders today tasks and due reviews as inert text', () => {
    const today = new Date().toISOString().slice(0, 10);
    const topicId = '<img src=x onerror="window.__todayReviewXss=1">';
    const taskTitle = '极限<script>window.__taskXss=1</script>';
    StateManager.setState('candidate_topics', [{
      topicId: 'task-safe-id',
      title: taskTitle,
      subject: 'math',
      category: 'phaseCore',
      isCore: true,
      estimatedMinutes: 30,
      priority: 2,
      contract: {
        required_artifacts: ['推导<script>window.__artifactXss=1</script>'],
        required_problem_count: 5,
      },
    }]);
    StateManager.setState('review_items', [{
      topicId,
      subject: 'math',
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: 1,
    }]);

    TodayView.mount(container);

    const reviewPassButton = container.querySelector('.today-review-panel .review-pass-btn');
    const taskCheckbox = Array.from(container.querySelectorAll('.task-complete-check'))
      .find((checkbox) => checkbox.getAttribute('aria-label')?.includes(taskTitle));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(topicId);
    expect(container.textContent).toContain(taskTitle);
    expect(container.textContent).toContain('推导<script>window.__artifactXss=1</script>');
    expect(reviewPassButton?.dataset.topicId).toBe(topicId);
    expect(reviewPassButton?.getAttribute('aria-label')).toBe(`通过: ${topicId}`);
    expect(reviewPassButton?.dataset.reviewIndex).toBe('0');
    expect(taskCheckbox?.getAttribute('aria-label')).toBe(`标记任务完成: ${taskTitle}`);
  });

  it('uses task-level completion contract when nested contract fields are malformed', () => {
    StateManager.setState('candidate_topics', [{
      topicId: 'task-contract-fallback',
      title: '合同回退任务',
      subject: 'math',
      category: 'phaseCore',
      isCore: true,
      estimatedMinutes: 30,
      priority: 1,
      contract: {
        required_artifacts: { bad: true },
        required_problem_count: { bad: true },
      },
      required_artifacts: ['错因笔记'],
      required_problem_count: 5,
    }]);

    TodayView.mount(container);

    expect(container.textContent).toContain('需完成题目: ≥5');
    expect(container.textContent).toContain('需提交: 错因笔记');
    expect(container.textContent).not.toContain('[object Object]');

    const checkbox = container.querySelector('.task-complete-check');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    container.querySelector('.completion-problems').value = '3';
    container.querySelector('.completion-correct').value = '3';
    container.querySelector('.completion-submit-btn').click();

    const errors = container.querySelector('.completion-errors');
    expect(errors?.style.display).toBe('block');
    expect(errors?.textContent).toContain('Missing required artifact: 错因笔记');
    expect(errors?.textContent).toContain('Submitted problems (3) less than required (5)');
  });

  it('updates duplicate blank today review topic ids by stable review index', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [
      { topicId: '', topic: 'first blank today', nextDueAt: today, intervalIndex: 0, failStreak: 3 },
      { topicId: '', topic: 'second blank today', nextDueAt: today, intervalIndex: 0, failStreak: 0 },
    ]);

    TodayView.mount(container);
    const failButtons = [...container.querySelectorAll('.today-review-panel .review-fail-btn')];
    expect(failButtons.map((button) => button.dataset.reviewIndex)).toEqual(['0', '1']);
    const beforeFirst = { ...StateManager.getState('review_items')[0] };

    failButtons[1].click();

    const items = StateManager.getState('review_items');
    expect(items[0]).toMatchObject(beforeFirst);
    expect(items[1].lastResult).toBe('fail');
  });

  it('surfaces today plan persistence failures without discarding generated tasks', () => {
    const originalSetState = StateManager.setState.bind(StateManager);
    vi.spyOn(StateManager, 'setState').mockImplementation((path, value) => {
      originalSetState(path, value);
      return path === 'today.tasks' ? false : true;
    });

    TodayView.mount(container);

    const tasks = StateManager.getState('today.tasks');
    const feedback = container.querySelector('.today-action-feedback');
    expect(Array.isArray(tasks)).toBe(true);
    expect(feedback?.classList.contains('error')).toBe(true);
    expect(feedback?.textContent).toContain('本机缓存写入失败');
    expect(feedback?.textContent).toContain('导出备份');
  });

  it('builds today plan from dirty history records without leaking invalid dates or numbers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));

    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'settings') {
        return {
          phase: 'foundation',
          weekdayMinutes: 'Infinity',
          coreRatio: 'Infinity',
        };
      }
      if (path === 'daily_records') {
        return {
          '2099-01-01': { mathMin: 9999 },
          'not-a-date': { mathMin: 'Infinity' },
          '2026-06-07': { mathMin: 'Infinity', csMin: -10, engMin: 'bad', polMin: 5, projectMin: '7' },
          '2026-06-06': null,
          '2026-06-05': 'not-object',
        };
      }
      if (path === 'candidate_topics') {
        return [
          {
            topicId: 'math-recovery',
            title: '恢复日数学',
            subject: 'math',
            category: 'phaseCore',
            isCore: true,
            estimatedMinutes: 30,
            priority: 2,
          },
          {
            topicId: 'english-normal',
            title: '普通英语',
            subject: 'english',
            category: 'english',
            estimatedMinutes: 30,
            priority: 4,
          },
        ];
      }
      if (path === 'blocked_topics') return [];
      if (path === 'review_items') return [];
      return originalGetState(path);
    });

    TodayView.mount(container);

    const tasks = StateManager.getState('today.tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      topicId: 'math-recovery',
      isRecovery: true,
      estimatedMinutes: 30,
    });
    expect(container.textContent).toContain('恢复日数学');
    expect(container.textContent).not.toContain('普通英语');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });

  it('surfaces today review persistence failures without discarding the result', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [{
      topicId: 'math-limit',
      subject: 'math',
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: 0,
    }]);
    const originalSetState = StateManager.setState.bind(StateManager);
    vi.spyOn(StateManager, 'setState').mockImplementation((path, value) => {
      originalSetState(path, value);
      return path === 'review_items' ? false : true;
    });

    TodayView.mount(container);
    container.querySelector('.today-review-panel .review-pass-btn').click();

    const updated = StateManager.getState('review_items')[0];
    const feedback = container.querySelector('.today-action-feedback');
    expect(updated.lastResult).toBe('pass');
    expect(updated.lastSubmittedDate).toBe(today);
    expect(feedback?.classList.contains('error')).toBe(true);
    expect(feedback?.textContent).toContain('本机缓存写入失败');
    expect(feedback?.textContent).toContain('导出备份');
  });

  it('ignores malformed today task completion state without throwing', () => {
    StateManager.setState('candidate_topics', [{
      topicId: 'task-safe-id',
      title: '高数极限',
      subject: 'math',
      category: 'phaseCore',
      isCore: true,
      estimatedMinutes: 30,
      priority: 2,
    }]);
    TodayView.mount(container);

    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'today.tasks') return ['not-a-task-object'];
      return originalGetState(path);
    });

    const checkbox = container.querySelector('.task-complete-check');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    const submit = container.querySelector('.completion-submit-btn');
    expect(() => submit.click()).not.toThrow();
    expect(StateManager.getState('review_items')).toEqual([]);
  });

  it('ignores malformed today review state during review actions', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [{
      topicId: 'math-limit',
      subject: 'math',
      nextDueAt: today,
      intervalIndex: 0,
      failStreak: 0,
    }]);
    TodayView.mount(container);

    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'review_items') return { bad: true };
      return originalGetState(path);
    });

    expect(() => container.querySelector('.today-review-panel .review-pass-btn').click()).not.toThrow();
  });

  it('skips malformed and completed today review items', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('review_items', [
      { topicId: 'bad-date-today', nextDueAt: 'not-a-date', intervalIndex: 0 },
      { topicId: 'done-today', nextDueAt: today, status: 'done', intervalIndex: 0 },
      { topicId: 'failed-today', nextDueAt: today, status: 'failed', intervalIndex: 0 },
      { topicId: 'valid-today', nextDueAt: today, intervalIndex: 0 },
    ]);

    TodayView.mount(container);

    expect(container.textContent).not.toContain('bad-date-today');
    expect(container.textContent).not.toContain('done-today');
    expect(container.textContent).not.toContain('failed-today');
    expect(container.textContent).toContain('valid-today');
    expect(container.querySelectorAll('.today-review-panel .review-pass-btn')).toHaveLength(1);
  });

  it('surfaces today record persistence failures without discarding the in-memory record', () => {
    TodayView.mount(container);

    const originalSetState = StateManager.setState.bind(StateManager);
    const originalMarkDirty = StateManager.markDirty.bind(StateManager);
    const originalSetDirty = OfflineCache.setDirty.bind(OfflineCache);
    vi.spyOn(StateManager, 'setState').mockImplementation((path, value) => {
      const saved = originalSetState(path, value);
      return path === 'daily_records' ? false : saved;
    });
    vi.spyOn(StateManager, 'markDirty').mockImplementation((table, id) => {
      originalMarkDirty(table, id);
      return false;
    });
    vi.spyOn(OfflineCache, 'setDirty').mockImplementation((table, id, record) => {
      originalSetDirty(table, id, record);
      return false;
    });

    const dateInput = container.querySelector('#tv-entry-date');
    const mathInput = container.querySelector('#tv-mathMin');
    const nextTaskInput = container.querySelector('#tv-nextTask');
    dateInput.value = '2026-06-09';
    mathInput.value = '45';
    nextTaskInput.value = '极限基础题 20 道';

    container.querySelector('#tv-entry-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const feedback = container.querySelector('.tv-submit-feedback');
    expect(StateManager.getState('daily_records')['2026-06-09']).toMatchObject({
      mathMin: 45,
      nextTask: '极限基础题 20 道',
    });
    expect(feedback?.classList.contains('error')).toBe(true);
    expect(feedback?.textContent).toContain('本机缓存写入失败');
    expect(feedback?.textContent).toContain('导出备份');
  });

  it('saves today records into a clean map when record state is malformed', () => {
    TodayView.mount(container);

    const originalGetState = StateManager.getState.bind(StateManager);
    const getStateSpy = vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') return 'not-a-record-map';
      return originalGetState(path);
    });

    container.querySelector('#tv-entry-date').value = '2026-06-09';
    container.querySelector('#tv-mathMin').value = '45';
    container.querySelector('#tv-nextTask').value = '干净记录表';

    container.querySelector('#tv-entry-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    getStateSpy.mockRestore();
    expect(StateManager.getState('daily_records')).toEqual({
      '2026-06-09': expect.objectContaining({
        date: '2026-06-09',
        mathMin: 45,
        nextTask: '干净记录表',
      }),
    });
  });

  it('falls back to today when saving a record with a malformed date', () => {
    const today = new Date().toISOString().slice(0, 10);
    TodayView.mount(container);

    container.querySelector('#tv-entry-date').value = 'not-a-date';
    container.querySelector('#tv-mathMin').value = '45';

    container.querySelector('#tv-entry-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const records = StateManager.getState('daily_records');
    expect(records['not-a-date']).toBeUndefined();
    expect(records[today]).toMatchObject({ date: today, mathMin: 45 });
  });

  it('clamps negative today record inputs before saving', () => {
    TodayView.mount(container);

    container.querySelector('#tv-entry-date').value = '2026-06-09';
    container.querySelector('#tv-mathMin').value = '-45';
    container.querySelector('#tv-csMin').value = '30';
    container.querySelector('#tv-newMistakes').value = '-2';
    container.querySelector('#tv-fixedMistakes').value = '3';
    container.querySelector('#tv-nextTask').value = '负数输入测试';

    container.querySelector('#tv-entry-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const record = StateManager.getState('daily_records')['2026-06-09'];
    expect(record).toMatchObject({
      mathMin: 0,
      csMin: 30,
      newMistakes: 0,
      fixedMistakes: 3,
      nextTask: '负数输入测试',
    });
  });

  it('renders retrospective snapshots as inert text with safe numeric fallbacks', () => {
    const checkpoint = '<img src=x onerror="window.__retroXss=1">';
    StateManager.setState('snapshots', [{
      checkpoint_date: checkpoint,
      result_payload: {
        predictedScore: 'bad<script>window.__scoreXss=1</script>',
        lowerBound: '<script>window.__lowerXss=1</script>',
        upperBound: 420,
      },
    }]);

    RetrospectiveView.mount(container);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(checkpoint);
    expect(container.textContent).toContain('—分');
    expect(container.textContent).toContain('[—, 420]');
    expect(container.textContent).not.toContain('NaN');
    expect(container.innerHTML).toContain('&lt;img src=x onerror=');
  });

  it('keeps raw mocked retrospective snapshot object fields out of visible text', () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'calibration_snapshots') {
        return [{
          checkpoint_date: { bad: true },
          result_payload: {
            predictedScore: { bad: true },
            lowerBound: { bad: true },
            upperBound: 420,
          },
        }];
      }
      if (path === 'daily_records') return {};
      if (path === 'settings') return {};
      if (path === 'today.tasks') return [];
      if (path === 'review_items') return [];
      return originalGetState(path);
    });

    RetrospectiveView.mount(container);

    expect(container.textContent).toContain('未知日期');
    expect(container.textContent).toContain('[—, 420]');
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.textContent).not.toContain('NaN');
  });

  it('renders retrospective metrics from dirty records and settings as safe numbers', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('settings.weekdayMinutes', 'bad<script>window.__retroWeekdayXss=1</script>');
    StateManager.setState('settings.weekendMinutes', 'Infinity');
    StateManager.setState('entries', {
      [today]: {
        math: '-20',
        cs408: 10,
        english: '<img src=x onerror="window.__retroEnglishXss=1">',
        politics: 'Infinity',
        project: '-5',
        mathProblems: '-3',
        csProblems: 4,
        newMistakes: '-4',
        fixedMistakes: 2,
      },
    });

    RetrospectiveView.mount(container);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('今日复盘');
    expect(container.textContent).toContain('周复盘');
    expect(container.textContent).toContain('月度审计');
    expect(container.textContent).not.toContain('<script>');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });

  it('tolerates malformed retrospective state collections', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));

    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'settings') return [];
      if (path === 'today.tasks') return { completed: true };
      if (path === 'daily_records') {
        return {
          'not-a-date': { mathMin: 'Infinity', mathProblems: 'Infinity' },
          '2026-06-08': { mathMin: 30, csMin: 10, newMistakes: 2, fixedMistakes: 1 },
          '2026-06-09': 'not-a-record-row',
        };
      }
      if (path === 'review_items') {
        return [
          null,
          { topicId: 'bad-date', nextDueAt: 'not-a-date' },
          { topicId: 'done-review', nextDueAt: '2026-06-09', status: 'done' },
          { topicId: 'valid-review', nextDueAt: '2026-06-09', lastSubmittedDate: '2026-06-09' },
        ];
      }
      if (path === 'calibration_snapshots') {
        return [
          null,
          {
            checkpoint_date: '<script>window.__badSnapshot=1</script>',
            result_payload: 'not-a-result-object',
          },
        ];
      }
      if (path === 'mock_scores') return [{ total: 260 }];
      if (path === 'topic_progress') return [null, 'bad-row', { mastery_status: 'mastered' }];
      return originalGetState(path);
    });

    expect(() => RetrospectiveView.mount(container)).not.toThrow();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('今日复盘');
    expect(container.textContent).toContain('<script>window.__badSnapshot=1</script>');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');

    const tierButton = container.querySelector('#retro-show-tier-modal');
    expect(tierButton).not.toBeNull();
    expect(() => tierButton.click()).not.toThrow();
    expect(container.querySelector('#retro-tier-content')?.textContent).not.toContain('NaN');
    expect(container.querySelector('#retro-tier-content')?.textContent).not.toContain('Infinity');
  });

  it('uses structured mock score records when rendering tier fallback suggestions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-08-15T00:00:00.000Z'));
    StateManager.setState('mock_scores', [
      { id: 'mock-1', date: '2027-08-01', total: 260 },
      { id: 'mock-2', date: '2027-08-08', politics: 60, english: 60, math: 70, cs408: 70 },
      { id: 'bad-mock', date: '2027-08-09', total: 'Infinity' },
    ]);

    RetrospectiveView.mount(container);
    container.querySelector('#retro-show-tier-modal')?.click();

    const content = container.querySelector('#retro-tier-content');
    expect(content?.textContent).toContain('北大软微主目标');
    expect(content?.textContent).not.toContain('NaN');
    expect(content?.textContent).not.toContain('Infinity');
  });

  it('renders fact claims with inert metadata and safe links', () => {
    StateManager.setState('sourceRegistry', [
      {
        claim_type: '<img src=x onerror="window.__factTypeXss=1">',
        claim_text: '招生<script>window.__claimXss=1</script>',
        source_publisher: '<script>window.__publisherXss=1</script>',
        source_url: 'https://example.com/fact',
        last_verified_at: '<img src=x onerror="window.__verifiedXss=1">',
      },
      {
        claim_type: 'hidden',
        claim_text: 'unsafe source should not render',
        source_publisher: 'bad',
        source_url: 'javascript:alert(1)',
        last_verified_at: '2024-01-01',
      }
    ]);

    FactIndexView.mount(container);

    const link = container.querySelector('.source-card a');
    expect(container.querySelectorAll('.source-card')).toHaveLength(1);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('招生<script>window.__claimXss=1</script>');
    expect(container.textContent).toContain('<script>window.__publisherXss=1</script>');
    expect(container.textContent).not.toContain('unsafe source should not render');
    expect(container.textContent).toContain('验证: 未知');
    expect(link?.getAttribute('href')).toBe('https://example.com/fact');
  });

  it('keeps raw mocked fact claim object fields out of visible metadata', () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'source_registry') {
        return [{
          claim_type: { bad: true },
          claim_text: { bad: true },
          source_publisher: { bad: true },
          source_url: 'https://example.com/object-claim',
          last_verified_at: new Date().toISOString().slice(0, 10),
        }];
      }
      return originalGetState(path);
    });

    FactIndexView.mount(container);

    const link = container.querySelector('.source-card a');
    expect(container.querySelectorAll('.source-card')).toHaveLength(1);
    expect(container.textContent).toContain('general');
    expect(container.textContent).toContain('来源: 未知');
    expect(container.textContent).not.toContain('[object Object]');
    expect(link?.getAttribute('href')).toBe('https://example.com/object-claim');
  });

  it('treats impossible and future fact verification dates as unknown outdated claims', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
    StateManager.setState('sourceRegistry', [
      {
        claim_type: 'admission_deadline',
        claim_text: 'impossible date claim',
        source_publisher: 'source',
        source_url: 'https://example.com/impossible',
        last_verified_at: '2026-02-31',
      },
      {
        claim_type: 'admission_score_line',
        claim_text: 'future date claim',
        source_publisher: 'source',
        source_url: 'https://example.com/future',
        last_verified_at: '2099-01-01',
      },
    ]);

    FactIndexView.mount(container);

    const groups = [...container.querySelectorAll('.panel')];
    const verified = groups.find((group) => group.textContent.includes('已验证'));
    const pending = groups.find((group) => group.textContent.includes('待验证'));
    const outdated = groups.find((group) => group.textContent.includes('已过期'));
    const verifiedText = verified?.textContent.replace(/\s+/g, ' ');
    const pendingText = pending?.textContent.replace(/\s+/g, ' ');
    const outdatedText = outdated?.textContent.replace(/\s+/g, ' ');
    expect(verifiedText).toContain('已验证 0');
    expect(pendingText).toContain('待验证 0');
    expect(outdatedText).toContain('已过期 2');
    expect(outdated?.textContent).toContain('impossible date claim');
    expect(outdated?.textContent).toContain('future date claim');
    expect(outdated?.textContent.match(/验证: 未知/g)).toHaveLength(2);
    expect(container.textContent).not.toContain('2099');
    expect(container.textContent).not.toContain('Invalid Date');
  });

  it('renders showcase item dates as inert text and keeps dirty metrics numeric', () => {
    const itemDate = '<img src=x onerror="window.__showcaseDateXss=1">';
    StateManager.setState('entries', {
      '2026-06-09': {
        math: '20<script>window.__metricXss=1</script>',
        cs408: 10,
      },
    });
    StateManager.setState('showcase_items', [{
      category: 'engineering_points',
      artifact_type: '实现<script>window.__artifactXss=1</script>',
      item_date: itemDate,
      output_link: 'javascript:alert(1)',
      description: '<script>window.__descriptionXss=1</script>',
    }]);

    ShowcaseView.mount(container);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(itemDate);
    expect(container.textContent).toContain('实现<script>window.__artifactXss=1</script>');
    expect(container.textContent).toContain('<script>window.__descriptionXss=1</script>');
    expect(container.textContent).not.toContain('NaN');
    expect(container.querySelector('a[href="#"]')).toBeNull();
    expect(container.textContent).not.toContain('查看链接');
  });

  it('renders showcase from malformed state collections without crashing', () => {
    const circularRecord = { mathMin: 60, csMin: 'Infinity' };
    circularRecord.self = circularRecord;
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') {
        return {
          '2026-06-09': circularRecord,
          '2026-06-10': null,
        };
      }
      if (path === 'topic_progress') {
        return [null, 'bad-row', { mastery_status: 'mastered', name: 'sensitive topic' }];
      }
      if (path === 'showcase_items') {
        return [
          null,
          'bad-item',
          {
            category: 'engineering_points',
            artifact_type: '实现<script>window.__showcaseDirtyXss=1</script>',
            item_date: '2026-06-09',
            output_link: 'https://example.com/showcase',
            description: '<script>window.__showcaseDescriptionXss=1</script>',
          },
        ];
      }
      return originalGetState(path);
    });

    expect(() => ShowcaseView.mount(container)).not.toThrow();

    const detailLink = [...container.querySelectorAll('a')]
      .find((link) => link.textContent === '查看链接');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('实现<script>window.__showcaseDirtyXss=1</script>');
    expect(container.textContent).toContain('<script>window.__showcaseDescriptionXss=1</script>');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
    expect(detailLink?.getAttribute('href')).toBe('https://example.com/showcase');
  });

  it('keeps raw mocked showcase object fields out of material cards', () => {
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'showcase_items') {
        return [{
          category: 'engineering_points',
          artifact_type: { bad: true },
          item_date: { bad: true },
          output_link: { bad: true },
          description: { bad: true },
        }];
      }
      if (path === 'daily_records') return {};
      if (path === 'topic_progress') return [];
      return originalGetState(path);
    });

    ShowcaseView.mount(container);

    const engineeringPanel = [...container.querySelectorAll('h4')]
      .find((heading) => heading.textContent === '工程亮点')
      ?.parentElement;
    expect(engineeringPanel).not.toBeUndefined();
    const engineeringText = engineeringPanel?.textContent || '';
    expect(engineeringText).not.toContain('暂无');
    expect(engineeringText).not.toContain('[object Object]');
    expect(engineeringText).not.toContain('查看链接');
    expect(container.textContent).not.toContain('[object Object]');
  });

  it('rejects unsafe showcase submission links before saving', () => {
    ShowcaseView.mount(container);

    container.querySelector('#sc-artifact-type').value = '算法实现';
    container.querySelector('#sc-item-date').value = '2026-06-09';
    container.querySelector('#sc-output-link').value = 'javascript:alert(1)';

    container.querySelector('#sc-submit-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const feedback = container.querySelector('#sc-form-feedback');
    expect(StateManager.getState('showcase_items')).toEqual([]);
    expect(feedback?.getAttribute('role')).toBe('alert');
    expect(feedback?.textContent).toContain('absolute http(s) URL');
  });

  it('rejects tampered showcase dates before saving', () => {
    ShowcaseView.mount(container);

    const dateInput = container.querySelector('#sc-item-date');
    dateInput.setAttribute('type', 'text');
    container.querySelector('#sc-artifact-type').value = '算法实现';
    dateInput.value = 'not-a-date';
    container.querySelector('#sc-output-link').value = 'https://example.com/out';

    container.querySelector('#sc-submit-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const feedback = container.querySelector('#sc-form-feedback');
    expect(StateManager.getState('showcase_items')).toEqual([]);
    expect(feedback?.getAttribute('role')).toBe('alert');
    expect(feedback?.textContent).toContain('valid YYYY-MM-DD date');
  });

  it('normalizes tampered showcase categories before saving', () => {
    ShowcaseView.mount(container);

    const category = container.querySelector('#sc-category');
    category.insertAdjacentHTML('beforeend', '<option value="constructor">tampered</option>');
    category.value = 'constructor';
    container.querySelector('#sc-artifact-type').value = '算法实现';
    container.querySelector('#sc-item-date').value = '2026-06-09';

    container.querySelector('#sc-submit-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    expect(StateManager.getState('showcase_items')[0]).toMatchObject({
      category: 'research_interest',
      artifact_type: '算法实现',
      item_date: '2026-06-09',
    });
  });

  it('surfaces showcase persistence failures without discarding the submitted item', () => {
    ShowcaseView.mount(container);

    const originalSetState = StateManager.setState.bind(StateManager);
    vi.spyOn(StateManager, 'setState').mockImplementation((path, value) => {
      originalSetState(path, value);
      return path === 'showcase_items' ? false : true;
    });

    container.querySelector('#sc-artifact-type').value = '算法实现';
    container.querySelector('#sc-item-date').value = '2026-06-09';

    container.querySelector('#sc-submit-form').dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }));

    const items = StateManager.getState('showcase_items');
    const feedback = container.querySelector('#sc-form-feedback');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      artifact_type: '算法实现',
      item_date: '2026-06-09',
    });
    expect(container.textContent).toContain('算法实现');
    expect(feedback?.classList.contains('error')).toBe(true);
    expect(feedback?.textContent).toContain('本机缓存写入失败');
    expect(feedback?.textContent).toContain('导出备份');
  });

  it('renders weekly metrics from dirty records as safe numbers', () => {
    const today = new Date().toISOString().slice(0, 10);
    StateManager.setState('settings.weekdayMinutes', 'bad<script>window.__weekdayXss=1</script>');
    StateManager.setState('settings.weekendMinutes', 'bad<script>window.__weekendXss=1</script>');
    StateManager.setState('entries', {
      [today]: {
        math: '-20',
        cs408: 10,
        english: '<img src=x onerror="window.__weeklyEnglishXss=1">',
        politics: 'Infinity',
        project: '-5',
        newMistakes: '-4',
        fixedMistakes: 2,
      },
    });

    WeeklyView.mount(container);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).not.toContain('<script>');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
    expect(container.textContent).toContain('10 分钟');
    expect(container.textContent).toContain('数学');
    expect(container.textContent).toContain('0');
  });

  it('does not treat malformed weekly record collections as daily records', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));

    const arrayRecordMap = Object.assign([], {
      '2026-06-09': { mathMin: 120, csMin: 30 },
    });
    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') return arrayRecordMap;
      if (path === 'settings') return [];
      return originalGetState(path);
    });

    WeeklyView.mount(container);

    expect(container.textContent).toContain('0.0h');
    expect(container.textContent).toContain('0 分钟');
    expect(container.textContent).not.toContain('150 分钟');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });

  it('renders weekly metrics from legacy record fields without object text leakage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));

    const originalGetState = StateManager.getState.bind(StateManager);
    vi.spyOn(StateManager, 'getState').mockImplementation((path) => {
      if (path === 'daily_records') {
        return {
          '2026-06-09': {
            math: 30,
            cs408: 20,
            english: { bad: true },
            politics: '10',
            project: -5,
            newMistakes: '4',
            fixedMistakes: '2',
          },
        };
      }
      if (path === 'settings') {
        return {
          weekdayMinutes: { bad: true },
          weekendMinutes: { bad: true },
          phase: { bad: true },
        };
      }
      return originalGetState(path);
    });

    WeeklyView.mount(container);

    const cards = [...container.querySelectorAll('.metric-card')].map((card) => card.textContent.replace(/\s+/g, ' '));
    expect(cards[0]).toContain('60 分钟');
    expect(cards.some((card) => card.includes('数学') && card.includes('30'))).toBe(true);
    expect(cards.some((card) => card.includes('408') && card.includes('20'))).toBe(true);
    expect(cards.some((card) => card.includes('政治') && card.includes('10'))).toBe(true);
    expect(container.textContent).not.toContain('[object Object]');
    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
  });
});

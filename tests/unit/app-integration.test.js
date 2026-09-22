/**
 * @vitest-environment jsdom
 *
 * Behavioural integration coverage for the production entry.
 *
 * `tests/unit/app-imports.test.js` pins the same wiring by pattern-matching
 * `src/app.js` as source text. That catches every change — including harmless
 * ones — while proving nothing about what the page actually does. These tests
 * mount the real `index.html`, run the real `bootstrapApp()`, and drive the
 * page, so a refactor that preserves behaviour stays green and a behaviour
 * regression fails.
 *
 * The harness (`tests/support/bootstrap-harness.js`) opts this import into the
 * bootstrap that `app.js` otherwise skips under Vitest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureDownloads, downloadText, goToView, mountProductionApp } from '../support/bootstrap-harness.js';

const STORAGE_KEYS = {
  APP_STATE: 'pku_swm_420_dashboard_v3',
  LEGACY_APP_STATE: 'pku_swm_420_dashboard_v1',
  LEGACY_MODULAR_STATE: 'pku_swm_420_state',
  STATE_DIRTY_MAP: 'pku_swm_420_dirty',
  OFFLINE_DIRTY_QUEUE: 'pku_swm_420_dirty_queue',
};

const toastText = () => document.getElementById('toast')?.textContent?.trim() || '';
const activeView = () => document.querySelector('.view.active')?.id || '';
const storedState = () => JSON.parse(window.localStorage.getItem(STORAGE_KEYS.APP_STATE) || '{}');

function fillEntry(overrides = {}) {
  const values = {
    entryDate: '2026-09-22',
    mathMin: '120',
    csMin: '90',
    engMin: '45',
    polMin: '30',
    projectMin: '30',
    qualityScore: '4',
    mathProblems: '20',
    csProblems: '15',
    readingCount: '2',
    newMistakes: '3',
    fixedMistakes: '1',
    nextTask: '高数极限 20 题',
    note: '',
    ...overrides,
  };
  for (const [id, value] of Object.entries(values)) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }
}

function submitForm(id) {
  document.getElementById(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

describe('app integration: boot', () => {
  it('wires navigation, auth, workspace and density against the real markup', async () => {
    await mountProductionApp();

    expect(document.documentElement.dataset.navBound).toBe('1');
    expect(document.documentElement.dataset.authBound).toBe('1');
    expect(document.documentElement.dataset.workspaceBound).toBe('1');
    expect(activeView()).toBe('dashboard');
    expect(window.__rwDebug.health().appStarted).toBe(true);
  });

  it('persists a migrated state container on first boot', async () => {
    await mountProductionApp();

    const state = storedState();
    expect(state.schemaVersion).toBeTypeOf('number');
    expect(state.entries).toBeTypeOf('object');
    expect(state.sync).toBeTypeOf('object');
  });
});

describe('app integration: routing and assistive state', () => {
  let downloads;

  beforeEach(async () => {
    downloads = captureDownloads();
    await mountProductionApp();
  });

  afterEach(() => downloads.restore());

  it('switches views and keeps aria-current on the active nav item only', async () => {
    await goToView('today');

    const navItems = [...document.querySelectorAll('.nav-item[data-view]')];
    const current = navItems.filter((item) => item.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].dataset.view).toBe('today');
  });

  it('keeps inactive views hidden from assistive technology', async () => {
    await goToView('records');

    for (const view of document.querySelectorAll('.view')) {
      const isActive = view.id === 'records';
      expect(view.hidden).toBe(!isActive);
      expect(view.getAttribute('aria-hidden')).toBe(String(!isActive));
      expect(view.classList.contains('active')).toBe(isActive);
    }
  });

  it('normalizes an unknown hash route back to the dashboard', async () => {
    window.location.hash = '#not-a-real-view';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));

    expect(activeView()).toBe('dashboard');
    expect(window.location.hash).toBe('#dashboard');
  });

  it('exposes syllabus subject tabs as pressed segmented controls', async () => {
    await goToView('syllabus');

    const tabs = [...document.querySelectorAll('.seg[data-syllabus]')];
    expect(tabs.length).toBeGreaterThan(1);
    expect(tabs.filter((tab) => tab.getAttribute('aria-pressed') === 'true')).toHaveLength(1);

    const target = tabs.find((tab) => tab.dataset.syllabus !== 'math');
    target.click();

    expect(target.getAttribute('aria-pressed')).toBe('true');
    expect(target.classList.contains('active')).toBe(true);
    expect(document.querySelectorAll('.seg[aria-pressed="true"]')).toHaveLength(1);
  });
});

describe('app integration: account panel', () => {
  let downloads;

  beforeEach(async () => {
    downloads = captureDownloads();
    await mountProductionApp();
  });

  afterEach(() => downloads.restore());

  it('opens and closes the account dialog, returning focus to the trigger', async () => {
    const open = document.getElementById('authOpenBtn');
    const dialog = document.getElementById('authDialog');

    open.click();
    expect(dialog.open).toBe(true);

    document.getElementById('authCloseBtn').click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(open);
  });

  it('flags empty credentials before making an auth request', async () => {
    document.getElementById('authOpenBtn').click();
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';

    submitForm('authForm');

    expect(document.getElementById('authEmail').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('authPassword').getAttribute('aria-invalid')).toBe('true');
  });

  it('validates email and password in stages, flagging one field at a time', async () => {
    document.getElementById('authOpenBtn').click();
    document.getElementById('authEmail').value = 'not-an-email';
    document.getElementById('authPassword').value = 'abc';

    submitForm('authForm');

    // The email is rejected first, so only that field is flagged.
    expect(document.getElementById('authEmail').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('authPassword').getAttribute('aria-invalid')).toBeNull();

    document.getElementById('authEmail').value = 'learner@example.com';
    submitForm('authForm');

    // Now the password is the blocking problem.
    expect(document.getElementById('authPassword').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('authEmail').getAttribute('aria-invalid')).toBeNull();
  });

  it('downloads a backup before clearing local data, then clears both cache generations', async () => {
    window.localStorage.setItem(STORAGE_KEYS.LEGACY_APP_STATE, JSON.stringify({ legacy: true }));
    window.localStorage.setItem(STORAGE_KEYS.LEGACY_MODULAR_STATE, JSON.stringify({ modular: true }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    try {
      document.getElementById('resetLocalBtn').click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(downloads.downloads.length).toBe(1);
      expect(downloads.downloads[0].name).toContain('before-reset');
      const payload = JSON.parse(await downloadText(downloads.downloads[0]));
      expect(payload).toBeTypeOf('object');

      expect(window.localStorage.getItem(STORAGE_KEYS.LEGACY_APP_STATE)).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEYS.LEGACY_MODULAR_STATE)).toBeNull();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('does not clear local data when the reset confirmation is declined', async () => {
    window.localStorage.setItem(STORAGE_KEYS.APP_STATE, JSON.stringify({ keep: true }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    try {
      document.getElementById('resetLocalBtn').click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(downloads.downloads).toHaveLength(0);
      expect(window.localStorage.getItem(STORAGE_KEYS.APP_STATE)).toContain('keep');
    } finally {
      confirmSpy.mockRestore();
    }
  });
});

describe('app integration: form validation', () => {
  let downloads;

  beforeEach(async () => {
    downloads = captureDownloads();
    await mountProductionApp();
    await goToView('today');
  });

  afterEach(() => downloads.restore());

  it('rejects a negative duration and flags the offending field', async () => {
    fillEntry({ mathMin: '-5' });

    submitForm('entryForm');

    expect(document.getElementById('mathMin').getAttribute('aria-invalid')).toBe('true');
    expect(toastText()).toContain('非负整数');
    expect(storedState().entries?.['2026-09-22']).toBeUndefined();
  });

  it('rejects a quality score outside 1-5', async () => {
    fillEntry({ qualityScore: '9' });

    submitForm('entryForm');

    expect(document.getElementById('qualityScore').getAttribute('aria-invalid')).toBe('true');
    expect(storedState().entries?.['2026-09-22']).toBeUndefined();
  });

  it('accepts a valid record and persists it', async () => {
    fillEntry();

    submitForm('entryForm');

    expect(document.getElementById('mathMin').getAttribute('aria-invalid')).toBeNull();
    const entry = storedState().entries?.['2026-09-22'];
    expect(entry).toBeDefined();
    expect(entry.math).toBe(120);
    expect(entry.cs408).toBe(90);
    expect(entry.quality).toBe(4);
    expect(entry.nextTask).toBe('高数极限 20 题');
  });

  it('refuses an all-empty mock score record', async () => {
    await goToView('scores');
    for (const id of ['scorePol', 'scoreEng', 'scoreMath', 'scoreCs']) {
      document.getElementById(id).value = '';
    }
    document.getElementById('scoreName').value = '空记录';
    document.getElementById('scoreDate').value = '2026-09-22';

    submitForm('scoreForm');

    expect(toastText()).toContain('至少填写一科');
    expect(storedState().scores || []).toHaveLength(0);
  });

  it('refuses a mock score above its subject ceiling', async () => {
    await goToView('scores');
    for (const id of ['scorePol', 'scoreEng', 'scoreMath', 'scoreCs']) {
      document.getElementById(id).value = '';
    }
    document.getElementById('scoreDate').value = '2026-09-22';
    document.getElementById('scoreMath').value = '200';

    submitForm('scoreForm');

    expect(toastText()).toContain('模考分数需填写为整数');
    expect(document.getElementById('scoreMath').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('app integration: export', () => {
  let downloads;

  beforeEach(async () => {
    downloads = captureDownloads();
    await mountProductionApp();
  });

  afterEach(() => downloads.restore());

  it('exports a restorable backup without account identity or sync runtime fields', async () => {
    document.getElementById('exportBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(downloads.downloads).toHaveLength(1);
    const payload = JSON.parse(await downloadText(downloads.downloads[0]));
    expect(payload.user).toBeUndefined();
    expect(payload.sync).toBeUndefined();
    expect(payload.entries).toBeTypeOf('object');
    expect(payload.snapshots).toBeTypeOf('object');
  });
});

describe('app integration: persistence round-trip', () => {
  let downloads;

  beforeEach(() => {
    downloads = captureDownloads();
  });

  afterEach(() => downloads.restore());

  it('restores a saved record after a full remount', async () => {
    await mountProductionApp();
    await goToView('today');
    fillEntry({ mathMin: '77' });
    submitForm('entryForm');
    expect(storedState().entries['2026-09-22'].math).toBe(77);

    await mountProductionApp({ keepStorage: true });

    const restored = storedState().entries['2026-09-22'];
    expect(restored.math).toBe(77);
    expect(document.getElementById('entryDate')).toBeTruthy();
  });
});

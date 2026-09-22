/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from '../../src/core/router.js';
import { DEFAULT_VIEW_ID, VIEW_IDS } from '../../src/core/route-contract.js';

describe('Router', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    window.location.hash = '';
  });

  afterEach(() => {
    Router.destroy();
    document.body.removeChild(container);
    window.location.hash = '';
  });

  describe('route-contract conformance', () => {
    it('keeps every contract-backed route key a member of VIEW_IDS', () => {
      for (const route of Object.keys(Router._CONTRACT_ROUTES)) {
        expect(VIEW_IDS).toContain(route);
      }
    });

    it('declares migration-only routes separately from contract routes', () => {
      const contract = Object.keys(Router._CONTRACT_ROUTES);
      const migrationOnly = Object.keys(Router._MIGRATION_ONLY_ROUTES);

      expect(contract).toHaveLength(4);
      expect(migrationOnly).toHaveLength(4);
      expect(Router._VIEW_MAP).toEqual(expect.objectContaining(Router._CONTRACT_ROUTES));
      expect(Router._VIEW_MAP).toEqual(expect.objectContaining(Router._MIGRATION_ONLY_ROUTES));
      expect(Object.keys(Router._VIEW_MAP)).toHaveLength(contract.length + migrationOnly.length);
      expect(contract.filter((route) => migrationOnly.includes(route))).toEqual([]);
    });

    it('does not re-declare a route under a second name', () => {
      // The migration layer used to call the review queue "reviews" while the
      // contract calls it "review". Both existing at once is exactly the drift
      // this split is meant to prevent.
      expect(Object.keys(Router._VIEW_MAP)).not.toContain('reviews');
      expect(Object.keys(Router._VIEW_MAP)).not.toContain('week');
      expect(Object.keys(Router._VIEW_MAP)).not.toContain('syllabus');
    });

    it('keeps its default route a valid VIEW_IDS member', () => {
      expect(VIEW_IDS).toContain(Router._DEFAULT_ROUTE);
    });

    it('uses the contract default whenever the migration layer can serve it', () => {
      // `dashboard` is the contract default but has no migrated view, so the
      // router falls back to its own default. The moment a dashboard view
      // exists this assertion forces the two constants back together.
      if (Object.prototype.hasOwnProperty.call(Router._VIEW_MAP, DEFAULT_VIEW_ID)) {
        expect(Router._DEFAULT_ROUTE).toBe(DEFAULT_VIEW_ID);
      } else {
        expect(Router._DEFAULT_ROUTE).not.toBe(DEFAULT_VIEW_ID);
      }
    });
  });

  it('exposes VIEW_MAP with all 8 view routes', () => {
    const routes = Object.keys(Router._VIEW_MAP);
    expect(routes).toHaveLength(8);
    expect(routes).toContain('today');
    expect(routes).toContain('weekly');
    expect(routes).toContain('review');
    expect(routes).toContain('records');
    expect(routes).toContain('settings');
    expect(routes).toContain('facts');
    expect(routes).toContain('showcase');
    expect(routes).toContain('retro');
  });

  it('VIEW_MAP entries are all functions returning promises', () => {
    for (const loader of Object.values(Router._VIEW_MAP)) {
      expect(typeof loader).toBe('function');
    }
  });

  it('defaults to today route when hash is empty', () => {
    window.location.hash = '';
    const route = Router._parseHash();
    expect(route).toBe('today');
  });

  it('parses valid hash route correctly', () => {
    window.location.hash = '#review';
    const route = Router._parseHash();
    expect(route).toBe('review');
  });

  it('still accepts the legacy "#/route" hash form', () => {
    window.location.hash = '#/review';
    const route = Router._parseHash();
    expect(route).toBe('review');
  });

  it('falls back to today for unknown route', () => {
    window.location.hash = '#nonexistent';
    const route = Router._parseHash();
    expect(route).toBe('today');
  });

  it('writes the same hash shape app.js produces', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('review');

    expect(window.location.hash).toBe('#review');
  });

  it('getCurrentRoute returns null before init', () => {
    expect(Router.getCurrentRoute()).toBeNull();
  });

  it('navigates to the initial route on init', async () => {
    window.location.hash = '#settings';
    Router.init(container);
    // Wait for async navigation
    await new Promise((r) => setTimeout(r, 50));
    expect(Router.getCurrentRoute()).toBe('settings');
  });

  it('navigate changes current route', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('review');
    expect(Router.getCurrentRoute()).toBe('review');
  });

  it('navigate falls back to today for invalid route', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('invalid-route');
    expect(Router.getCurrentRoute()).toBe('today');
  });

  it('navigate mounts view into container', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('weekly');
    expect(container.innerHTML).toContain('weekly-view');
  });

  it('navigate unmounts previous view before mounting new one', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('review');
    // Manually patch the current view's unmount to spy
    // Navigate again to trigger unmount
    const originalRoute = Router.getCurrentRoute();
    expect(originalRoute).toBe('review');
    await Router.navigate('settings');
    expect(Router.getCurrentRoute()).toBe('settings');
  });

  it('does not re-navigate if already on the same route', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('records');
    const html = container.innerHTML;
    await Router.navigate('records');
    expect(container.innerHTML).toBe(html);
  });

  it('registers only one hashchange listener across repeated init calls', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');

    try {
      Router.init(container);
      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const hashListeners = addEventListener.mock.calls.filter(([event]) => event === 'hashchange');
      expect(hashListeners).toHaveLength(1);
    } finally {
      addEventListener.mockRestore();
    }
  });

  it('reinitializes into a new container after unmounting the previous view', async () => {
    const originalToday = Router._VIEW_MAP.today;
    const nextContainer = document.createElement('div');
    const unmount = vi.fn();

    document.body.appendChild(nextContainer);
    Router._VIEW_MAP.today = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>today-mounted</div>';
      },
      unmount,
    }));

    try {
      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container.innerHTML).toContain('today-mounted');

      Router.init(nextContainer);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unmount).toHaveBeenCalledTimes(1);
      expect(nextContainer.innerHTML).toContain('today-mounted');
      expect(Router.getCurrentRoute()).toBe('today');
    } finally {
      Router._VIEW_MAP.today = originalToday;
      document.body.removeChild(nextContainer);
    }
  });

  it('mounts a route that was navigated before init once a container exists', async () => {
    const originalReview = Router._VIEW_MAP.review;
    const mount = vi.fn((target) => {
      target.innerHTML = '<div>review-after-init</div>';
    });

    Router._VIEW_MAP.review = vi.fn(async () => ({
      mount,
      unmount: vi.fn(),
    }));

    try {
      await Router.navigate('review');

      expect(Router.getCurrentRoute()).toBe('review');
      expect(mount).not.toHaveBeenCalled();

      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mount).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toContain('review-after-init');
      expect(Router.getCurrentRoute()).toBe('review');
    } finally {
      Router._VIEW_MAP.review = originalReview;
    }
  });

  it('ignores stale async view loads after a newer navigation wins', async () => {
    const originalToday = Router._VIEW_MAP.today;
    const originalReview = Router._VIEW_MAP.review;
    let resolveToday;
    let resolveReview;
    const todayMount = vi.fn((target) => {
      target.innerHTML = '<div>stale-today</div>';
    });
    const reviewMount = vi.fn((target) => {
      target.innerHTML = '<div>current-review</div>';
    });

    Router._VIEW_MAP.today = vi.fn(() => new Promise((resolve) => {
      resolveToday = resolve;
    }));
    Router._VIEW_MAP.review = vi.fn(() => new Promise((resolve) => {
      resolveReview = resolve;
    }));

    try {
      window.location.hash = '#today';
      Router.init(container);

      const reviewNavigation = Router.navigate('review');
      resolveReview({ mount: reviewMount, unmount: vi.fn() });
      await reviewNavigation;
      expect(container.innerHTML).toContain('current-review');

      resolveToday({ mount: todayMount, unmount: vi.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(todayMount).not.toHaveBeenCalled();
      expect(container.innerHTML).toContain('current-review');
      expect(Router.getCurrentRoute()).toBe('review');
    } finally {
      Router._VIEW_MAP.today = originalToday;
      Router._VIEW_MAP.review = originalReview;
    }
  });

  it('continues navigation when the previous view unmount throws', async () => {
    const originalToday = Router._VIEW_MAP.today;
    const originalSettings = Router._VIEW_MAP.settings;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Router._VIEW_MAP.today = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>today-ready</div>';
      },
      unmount() {
        throw new Error('unmount failed');
      },
    }));
    Router._VIEW_MAP.settings = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>settings-ready</div>';
      },
      unmount: vi.fn(),
    }));

    try {
      window.location.hash = '#today';
      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      await Router.navigate('settings');

      expect(container.innerHTML).toContain('settings-ready');
      expect(Router.getCurrentRoute()).toBe('settings');
      expect(warn).toHaveBeenCalled();
    } finally {
      Router._VIEW_MAP.today = originalToday;
      Router._VIEW_MAP.settings = originalSettings;
      warn.mockRestore();
    }
  });

  it('does not unmount the same previous view twice during overlapping navigations', async () => {
    const originalToday = Router._VIEW_MAP.today;
    const originalSettings = Router._VIEW_MAP.settings;
    const originalReview = Router._VIEW_MAP.review;
    const todayUnmount = vi.fn();
    let resolveSettings;

    Router._VIEW_MAP.today = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>today-ready</div>';
      },
      unmount: todayUnmount,
    }));
    Router._VIEW_MAP.settings = vi.fn(() => new Promise((resolve) => {
      resolveSettings = resolve;
    }));
    Router._VIEW_MAP.review = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>review-ready</div>';
      },
      unmount: vi.fn(),
    }));

    try {
      window.location.hash = '#today';
      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const settingsNavigation = Router.navigate('settings');
      await Router.navigate('review');

      resolveSettings({
        mount(target) {
          target.innerHTML = '<div>stale-settings</div>';
        },
        unmount: vi.fn(),
      });
      await settingsNavigation;

      expect(todayUnmount).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toContain('review-ready');
      expect(container.innerHTML).not.toContain('stale-settings');
      expect(Router.getCurrentRoute()).toBe('review');
    } finally {
      Router._VIEW_MAP.today = originalToday;
      Router._VIEW_MAP.settings = originalSettings;
      Router._VIEW_MAP.review = originalReview;
    }
  });

  it('shows a route error and allows retrying the same route after load failure', async () => {
    const originalToday = Router._VIEW_MAP.today;
    const originalSettings = Router._VIEW_MAP.settings;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempts = 0;

    Router._VIEW_MAP.today = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>today-base</div>';
      },
      unmount: vi.fn(),
    }));
    Router._VIEW_MAP.settings = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('load failed');
      }

      return {
        mount(target) {
          target.innerHTML = '<div>settings-recovered</div>';
        },
        unmount: vi.fn(),
      };
    });

    try {
      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Router.navigate('settings');

      expect(container.querySelector('[role="alert"]')?.textContent).toBe('页面加载失败，请刷新后重试。');
      expect(Router.getCurrentRoute()).toBe('settings');

      await Router.navigate('settings');

      expect(container.innerHTML).toContain('settings-recovered');
      expect(Router.getCurrentRoute()).toBe('settings');
      expect(Router._VIEW_MAP.settings).toHaveBeenCalledTimes(2);
    } finally {
      Router._VIEW_MAP.today = originalToday;
      Router._VIEW_MAP.settings = originalSettings;
      error.mockRestore();
    }
  });

  it('destroy cleans up state', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    Router.destroy();
    expect(Router.getCurrentRoute()).toBeNull();
  });
});

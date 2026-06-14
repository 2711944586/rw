/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from '../../src/core/router.js';

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

  it('exposes VIEW_MAP with all 8 view routes', () => {
    const routes = Object.keys(Router._VIEW_MAP);
    expect(routes).toHaveLength(8);
    expect(routes).toContain('today');
    expect(routes).toContain('weekly');
    expect(routes).toContain('reviews');
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
    window.location.hash = '#/reviews';
    const route = Router._parseHash();
    expect(route).toBe('reviews');
  });

  it('falls back to today for unknown route', () => {
    window.location.hash = '#/nonexistent';
    const route = Router._parseHash();
    expect(route).toBe('today');
  });

  it('getCurrentRoute returns null before init', () => {
    expect(Router.getCurrentRoute()).toBeNull();
  });

  it('navigates to the initial route on init', async () => {
    window.location.hash = '#/settings';
    Router.init(container);
    // Wait for async navigation
    await new Promise((r) => setTimeout(r, 50));
    expect(Router.getCurrentRoute()).toBe('settings');
  });

  it('navigate changes current route', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('reviews');
    expect(Router.getCurrentRoute()).toBe('reviews');
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
    const unmountSpy = vi.fn();
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    await Router.navigate('reviews');
    // Manually patch the current view's unmount to spy
    // Navigate again to trigger unmount
    const originalRoute = Router.getCurrentRoute();
    expect(originalRoute).toBe('reviews');
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
    const originalReviews = Router._VIEW_MAP.reviews;
    const mount = vi.fn((target) => {
      target.innerHTML = '<div>reviews-after-init</div>';
    });

    Router._VIEW_MAP.reviews = vi.fn(async () => ({
      mount,
      unmount: vi.fn(),
    }));

    try {
      await Router.navigate('reviews');

      expect(Router.getCurrentRoute()).toBe('reviews');
      expect(mount).not.toHaveBeenCalled();

      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mount).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toContain('reviews-after-init');
      expect(Router.getCurrentRoute()).toBe('reviews');
    } finally {
      Router._VIEW_MAP.reviews = originalReviews;
    }
  });

  it('ignores stale async view loads after a newer navigation wins', async () => {
    const originalToday = Router._VIEW_MAP.today;
    const originalReviews = Router._VIEW_MAP.reviews;
    let resolveToday;
    let resolveReviews;
    const todayMount = vi.fn((target) => {
      target.innerHTML = '<div>stale-today</div>';
    });
    const reviewsMount = vi.fn((target) => {
      target.innerHTML = '<div>current-reviews</div>';
    });

    Router._VIEW_MAP.today = vi.fn(() => new Promise((resolve) => {
      resolveToday = resolve;
    }));
    Router._VIEW_MAP.reviews = vi.fn(() => new Promise((resolve) => {
      resolveReviews = resolve;
    }));

    try {
      window.location.hash = '#/today';
      Router.init(container);

      const reviewsNavigation = Router.navigate('reviews');
      resolveReviews({ mount: reviewsMount, unmount: vi.fn() });
      await reviewsNavigation;
      expect(container.innerHTML).toContain('current-reviews');

      resolveToday({ mount: todayMount, unmount: vi.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(todayMount).not.toHaveBeenCalled();
      expect(container.innerHTML).toContain('current-reviews');
      expect(Router.getCurrentRoute()).toBe('reviews');
    } finally {
      Router._VIEW_MAP.today = originalToday;
      Router._VIEW_MAP.reviews = originalReviews;
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
      window.location.hash = '#/today';
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
    const originalReviews = Router._VIEW_MAP.reviews;
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
    Router._VIEW_MAP.reviews = vi.fn(async () => ({
      mount(target) {
        target.innerHTML = '<div>reviews-ready</div>';
      },
      unmount: vi.fn(),
    }));

    try {
      window.location.hash = '#/today';
      Router.init(container);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const settingsNavigation = Router.navigate('settings');
      await Router.navigate('reviews');

      resolveSettings({
        mount(target) {
          target.innerHTML = '<div>stale-settings</div>';
        },
        unmount: vi.fn(),
      });
      await settingsNavigation;

      expect(todayUnmount).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toContain('reviews-ready');
      expect(container.innerHTML).not.toContain('stale-settings');
      expect(Router.getCurrentRoute()).toBe('reviews');
    } finally {
      Router._VIEW_MAP.today = originalToday;
      Router._VIEW_MAP.settings = originalSettings;
      Router._VIEW_MAP.reviews = originalReviews;
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

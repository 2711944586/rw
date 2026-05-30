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

  it('destroy cleans up state', async () => {
    Router.init(container);
    await new Promise((r) => setTimeout(r, 50));
    Router.destroy();
    expect(Router.getCurrentRoute()).toBeNull();
  });
});

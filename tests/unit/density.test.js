/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, EVENTS } from '../../src/core/event-bus.js';
import { StateManager } from '../../src/core/state-manager.js';
import { applyDensityMode, getDensityMode, initDensityMode, setDensityMode } from '../../src/density.js';

describe('density mode utility', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="density-toggle">
        <button type="button" data-density="focus">Focus</button>
        <button type="button" data-density="balanced">Balanced</button>
        <button type="button" data-density="detail">Detail</button>
      </div>
    `;
    document.body.removeAttribute('data-density');
    StateManager.clear();
  });

  afterEach(() => {
    StateManager.clear();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('applies active and aria-pressed states to density buttons', () => {
    applyDensityMode('detail');

    expect(document.body.getAttribute('data-density')).toBe('detail');
    expect(document.querySelector('button[data-density="detail"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('button[data-density="detail"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[data-density="focus"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not apply arbitrary density values to the DOM', () => {
    StateManager.setState('profile.density_mode', 'balanced');

    applyDensityMode('evil-mode');

    expect(document.body.getAttribute('data-density')).toBe('balanced');
    expect(document.querySelector('button[data-density="balanced"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('button[data-density="detail"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('normalizes invalid density writes to the default mode', () => {
    expect(setDensityMode('evil-mode')).toBe(true);

    expect(StateManager.getState('profile.density_mode')).toBe('focus');
    expect(document.body.getAttribute('data-density')).toBe('focus');
    expect(document.querySelector('button[data-density="focus"]').classList.contains('active')).toBe(true);
  });

  it('returns false and emits localSaved=false when persistence fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage blocked');
    });
    const events = [];
    const handler = (payload) => events.push(payload);
    EventBus.on(EVENTS.STATE_CHANGED, handler);

    try {
      expect(setDensityMode('detail')).toBe(false);

      expect(getDensityMode()).toBe('detail');
      expect(document.body.getAttribute('data-density')).toBe('detail');
      expect(events.some((event) =>
        event.path === 'profile.density_mode' &&
        event.value === 'detail' &&
        event.localSaved === false
      )).toBe(true);
    } finally {
      EventBus.off(EVENTS.STATE_CHANGED, handler);
    }
  });

  it('does not bind duplicate click handlers when initialized twice', () => {
    const setState = vi.spyOn(StateManager, 'setState');

    initDensityMode();
    initDensityMode();
    document.querySelector('button[data-density="balanced"]').click();

    const densityWrites = setState.mock.calls.filter(([path]) => path === 'profile.density_mode');
    expect(densityWrites).toHaveLength(1);
    expect(getDensityMode()).toBe('balanced');
  });
});

import { describe, expect, beforeEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';

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

import { StateManager } from '../../src/core/state-manager.js';

/**
 * Property 17: Density mode round-trip persistence
 * **Validates: Requirements 5.2**
 *
 * For any valid density mode value in {focus, balanced, detail}, saving it via
 * StateManager.setState('profile.density_mode', value) and then loading it back
 * via StateManager.getState('profile.density_mode') returns the identical value.
 */
describe('Property 17: Density mode round-trip persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    StateManager.clear();
  });

  const arbDensityMode = fc.constantFrom('focus', 'balanced', 'detail');

  test.prop([arbDensityMode])(
    'saving and loading density mode returns the identical value',
    (mode) => {
      StateManager.setState('profile.density_mode', mode);
      const loaded = StateManager.getState('profile.density_mode');
      expect(loaded).toBe(mode);
    }
  );
});

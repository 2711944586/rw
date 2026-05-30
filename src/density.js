/**
 * Density Mode Utility
 *
 * Manages the three density modes (focus / balanced / detail)
 * and persists the selection to the user profile via StateManager.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { StateManager } from './core/state-manager.js';
import { EventBus, EVENTS } from './core/event-bus.js';

const VALID_MODES = ['focus', 'balanced', 'detail'];
const DEFAULT_MODE = 'focus';

/**
 * Get the current density mode from profile state.
 * @returns {'focus'|'balanced'|'detail'}
 */
export function getDensityMode() {
  const mode = StateManager.getState('profile.density_mode');
  return VALID_MODES.includes(mode) ? mode : DEFAULT_MODE;
}

/**
 * Set the density mode, persist to profile, and apply to DOM.
 * @param {'focus'|'balanced'|'detail'} mode
 */
export function setDensityMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    mode = DEFAULT_MODE;
  }
  StateManager.setState('profile.density_mode', mode);
  applyDensityMode(mode);
  EventBus.emit(EVENTS.STATE_CHANGED, { path: 'profile.density_mode', value: mode });
}

/**
 * Apply the density mode to the DOM by setting data-density attribute on body.
 * Also updates the density toggle button active states.
 * @param {string} [mode] - Optional mode; reads from state if not provided
 */
export function applyDensityMode(mode) {
  if (!mode) {
    mode = getDensityMode();
  }
  document.body.setAttribute('data-density', mode);

  // Update toggle button active states
  document.querySelectorAll('.density-toggle [data-density]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.density === mode);
  });
}

/**
 * Initialize density mode system:
 * - Restore persisted mode from profile
 * - Apply to DOM
 * - Bind toggle button click handlers
 */
export function initDensityMode() {
  const mode = getDensityMode();
  applyDensityMode(mode);

  // Bind density toggle buttons (in top-actions area)
  document.querySelectorAll('.density-toggle [data-density]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setDensityMode(btn.dataset.density);
    });
  });
}

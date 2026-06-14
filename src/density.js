/**
 * Density Mode Utility
 *
 * Manages the three density modes (focus / balanced / detail)
 * and persists the selection to the user profile via StateManager.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { StateManager } from './core/state-manager.js';

const VALID_MODES = ['focus', 'balanced', 'detail'];
const DEFAULT_MODE = 'focus';

function normalizeDensityMode(mode, fallback = DEFAULT_MODE) {
  return VALID_MODES.includes(mode) ? mode : fallback;
}

/**
 * Get the current density mode from profile state.
 * @returns {'focus'|'balanced'|'detail'}
 */
export function getDensityMode() {
  const mode = StateManager.getState('profile.density_mode');
  return normalizeDensityMode(mode);
}

/**
 * Set the density mode, persist to profile, and apply to DOM.
 * @param {'focus'|'balanced'|'detail'} mode
 * @returns {boolean} Whether the mode was persisted locally
 */
export function setDensityMode(mode) {
  mode = normalizeDensityMode(mode);
  const saved = StateManager.setState('profile.density_mode', mode);
  applyDensityMode(mode);
  return saved;
}

/**
 * Apply the density mode to the DOM by setting data-density attribute on body.
 * Also updates the density toggle button active states.
 * @param {string} [mode] - Optional mode; reads from state if not provided
 */
export function applyDensityMode(mode) {
  if (!mode) {
    mode = getDensityMode();
  } else {
    mode = normalizeDensityMode(mode, getDensityMode());
  }
  document.body.setAttribute('data-density', mode);

  // Update toggle button active states
  document.querySelectorAll('.density-toggle [data-density]').forEach((btn) => {
    const active = btn.dataset.density === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
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
    if (btn.dataset.densityBound === '1') return;
    btn.dataset.densityBound = '1';
    btn.addEventListener('click', () => {
      setDensityMode(btn.dataset.density);
    });
  });
}

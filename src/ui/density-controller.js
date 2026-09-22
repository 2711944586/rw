/**
 * Density Mode Utility
 *
 * Pure helpers plus the one DOM effect the production entry needs: applying a
 * density mode to `document`.
 *
 * This module used to also export `getDensityMode` / `setDensityMode` /
 * `initDensityMode`, which persisted the mode through `core/state-manager.js`.
 * Nothing in production or in the migration layer ever called them — the views
 * each keep their own local `getDensityMode` — so their only consumer was a
 * unit test. Because `app.js` imports this module, that leftover import dragged
 * `state-manager.js` (605 lines) and `event-bus.js` (139 lines) into the
 * production bundle, alongside a second state store bound to the *same*
 * localStorage key as `app.js`. Both are gone now; density is owned by
 * `state.settings.density` in `app.js` alone.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

export const DENSITY_MODES = Object.freeze({
  focus: Object.freeze({
    label: '专注',
    level: 'action',
    expand: Object.freeze([]),
  }),
  balanced: Object.freeze({
    label: '平衡',
    level: 'execution',
    expand: Object.freeze([]),
  }),
  detail: Object.freeze({
    label: '详尽',
    level: 'diagnostic',
    expand: Object.freeze(['detail']),
  }),
});

const VALID_MODES = Object.freeze(Object.keys(DENSITY_MODES));
const DEFAULT_MODE = 'focus';

export function normalizeDensityMode(mode, fallback = DEFAULT_MODE) {
  return VALID_MODES.includes(mode) ? mode : fallback;
}

export function densityModeMeta(mode) {
  return DENSITY_MODES[normalizeDensityMode(mode)];
}

/**
 * Apply the density mode to the DOM by setting the data-density attributes on
 * both `documentElement` and `body`, then syncing the toggle buttons and any
 * `details[data-density-expand]` sections.
 *
 * An unknown or missing mode normalizes to `focus` rather than reading a second
 * state store: the caller owns the persisted value.
 *
 * @param {string} [mode] - Density mode; unknown values fall back to the default
 */
export function applyDensityMode(mode) {
  mode = normalizeDensityMode(mode);
  document.documentElement.setAttribute('data-density', mode);
  document.documentElement.setAttribute('data-density-level', densityModeMeta(mode).level);
  document.body.setAttribute('data-density', mode);
  document.body.setAttribute('data-density-level', densityModeMeta(mode).level);

  document.querySelectorAll('.density-toggle [data-density]').forEach((btn) => {
    const active = btn.dataset.density === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  const expandLevels = new Set(densityModeMeta(mode).expand);
  document.querySelectorAll('details[data-density-expand]').forEach((section) => {
    const level = section.dataset.densityExpand;
    section.open = expandLevels.has(level);
  });
}

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDensityMode, densityModeMeta, normalizeDensityMode } from '../../src/ui/density-controller.js';

describe('density mode utility', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="density-toggle">
        <button type="button" data-density="focus">Focus</button>
        <button type="button" data-density="balanced">Balanced</button>
        <button type="button" data-density="detail">Detail</button>
      </div>
      <details data-density-expand="detail"><summary>Diagnostic</summary></details>
    `;
    document.body.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-density');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies active and aria-pressed states to density buttons', () => {
    applyDensityMode('detail');

    expect(document.body.getAttribute('data-density')).toBe('detail');
    expect(document.body.getAttribute('data-density-level')).toBe('diagnostic');
    expect(document.documentElement.getAttribute('data-density')).toBe('detail');
    expect(document.documentElement.getAttribute('data-density-level')).toBe('diagnostic');
    expect(document.querySelector('button[data-density="detail"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('button[data-density="detail"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('button[data-density="focus"]').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('details[data-density-expand="detail"]').open).toBe(true);
  });

  it('keeps diagnostic sections closed outside detail mode', () => {
    const details = document.querySelector('details[data-density-expand="detail"]');
    details.open = true;

    applyDensityMode('balanced');

    expect(document.body.getAttribute('data-density-level')).toBe('execution');
    expect(details.open).toBe(false);
  });

  it('normalizes unknown modes to the default instead of applying them raw', () => {
    applyDensityMode('evil-mode');

    expect(document.body.getAttribute('data-density')).toBe('focus');
    expect(document.body.getAttribute('data-density-level')).toBe('action');
    expect(document.querySelector('button[data-density="focus"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('button[data-density="balanced"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('falls back to the default when called without a mode', () => {
    applyDensityMode();

    expect(document.body.getAttribute('data-density')).toBe('focus');
  });

  it('normalizes and describes modes without touching the DOM', () => {
    expect(normalizeDensityMode('detail')).toBe('detail');
    expect(normalizeDensityMode('nope')).toBe('focus');
    expect(normalizeDensityMode('nope', 'balanced')).toBe('balanced');
    expect(normalizeDensityMode(undefined)).toBe('focus');

    expect(densityModeMeta('balanced')).toMatchObject({ level: 'execution' });
    expect(densityModeMeta('detail').expand).toEqual(['detail']);
    expect(densityModeMeta('nope').level).toBe('action');
  });
});

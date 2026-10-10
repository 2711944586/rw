import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  DEFAULT_VIEW_ID,
  MOBILE_PRIMARY_VIEW_IDS,
  VIEW_IDS,
  isKnownViewId,
} from '../../src/core/route-contract.js';

describe('route contract', () => {
  it('keeps canonical route ids unique and validates exact ids', () => {
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length);
    expect(VIEW_IDS).toContain(DEFAULT_VIEW_ID);
    VIEW_IDS.forEach((viewId) => expect(isKnownViewId(viewId)).toBe(true));
    expect(isKnownViewId('weekly')).toBe(false);
    expect(isKnownViewId('')).toBe(false);
    expect(isKnownViewId(null)).toBe(false);
  });

  it('keeps mobile primary routes inside the canonical contract', () => {
    expect(MOBILE_PRIMARY_VIEW_IDS).toEqual(['dashboard', 'today', 'review', 'week', 'settings']);
    MOBILE_PRIMARY_VIEW_IDS.forEach((viewId) => expect(VIEW_IDS).toContain(viewId));
  });

  it('keeps the static mobile navigation markers aligned with the contract', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const markedRoutes = [...html.matchAll(/data-view="([^"]+)"[^>]*data-mobile-primary/g)].map((match) => match[1]);
    expect(markedRoutes).toEqual(MOBILE_PRIMARY_VIEW_IDS);
    expect(html).toContain('id="mobileMoreBtn"');
  });
});

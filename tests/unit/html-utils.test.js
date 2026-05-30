import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHTML, safeExternalUrl } from '../../src/utils/html.js';

describe('html utils', () => {
  it('escapes text content payloads', () => {
    expect(escapeHTML('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes quotes and backticks for attributes', () => {
    expect(escapeAttr('" onclick=`alert(1)`')).toBe('&quot; onclick=&#096;alert(1)&#096;');
  });

  it('allows http and https URLs', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it('blocks script URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBe('#');
  });
});

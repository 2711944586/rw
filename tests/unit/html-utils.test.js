import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHTML, safeExternalUrl } from '../../src/utils/html.js';

describe('html utils', () => {
  it('escapes text content payloads', () => {
    expect(escapeHTML('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps object-like values out of escaped text and attributes', () => {
    expect(escapeHTML({ bad: true })).toBe('');
    expect(escapeHTML(['bad'])).toBe('');
    expect(escapeAttr({ bad: true })).toBe('');
    expect(escapeHTML(42)).toBe('42');
  });

  it('escapes quotes and backticks for attributes', () => {
    expect(escapeAttr('" onclick=`alert(1)`')).toBe('&quot; onclick=&#096;alert(1)&#096;');
  });

  it('allows http and https URLs', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeExternalUrl('http://example.com/a')).toBe('http://example.com/a');
  });

  it('blocks script URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBe('#');
  });

  it('blocks relative and protocol-relative URLs', () => {
    expect(safeExternalUrl('/local/path')).toBe('#');
    expect(safeExternalUrl('//example.com/path')).toBe('#');
  });

  it('blocks non-string URLs without object-string coercion', () => {
    expect(safeExternalUrl({ href: 'https://example.com' })).toBe('#');
    expect(safeExternalUrl(123)).toBe('#');
  });
});

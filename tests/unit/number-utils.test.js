import { describe, expect, it } from 'vitest';
import { finiteNumber, nonNegativeNumber, positiveNumber } from '../../src/utils/number.js';

describe('number utils', () => {
  it('returns finite numbers and falls back for malformed values', () => {
    expect(finiteNumber('12.5')).toBe(12.5);
    expect(finiteNumber('bad', 3)).toBe(3);
    expect(finiteNumber('Infinity', 3)).toBe(3);
    expect(finiteNumber('bad', 'also-bad')).toBe(0);
  });

  it('rejects object-coerced numeric values and fallbacks', () => {
    expect(finiteNumber({ valueOf: () => 12 }, 3)).toBe(3);
    expect(finiteNumber('bad', { valueOf: () => 9 })).toBe(0);
    expect(nonNegativeNumber({ valueOf: () => 12 }, 7)).toBe(7);
    expect(positiveNumber({ valueOf: () => 12 }, 240)).toBe(240);
  });

  it('clamps non-negative values while preserving zero', () => {
    expect(nonNegativeNumber(12)).toBe(12);
    expect(nonNegativeNumber(0, 5)).toBe(0);
    expect(nonNegativeNumber(-1, 5)).toBe(5);
    expect(nonNegativeNumber('-1')).toBe(0);
    expect(nonNegativeNumber('bad', 7)).toBe(7);
  });

  it('requires positive values when zero would break planning math', () => {
    expect(positiveNumber(45, 240)).toBe(45);
    expect(positiveNumber(0, 240)).toBe(240);
    expect(positiveNumber(-10, 240)).toBe(240);
    expect(positiveNumber('bad', 0)).toBe(1);
  });
});

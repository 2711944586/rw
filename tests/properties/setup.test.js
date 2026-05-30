import { describe, it, expect } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';

describe('Property test framework setup', () => {
  fcTest.prop([fc.integer()])('fast-check works with vitest', (n) => {
    expect(typeof n).toBe('number');
  });
});

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  calibrate,
  getCheckpointThreshold,
  generateTierFallback,
} from '../../src/domain/calibration-engine.js';

/**
 * Arbitrary for CalibrationInput with appropriate ranges.
 */
const calibrationInputArb = fc.record({
  mockScores: fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 0, maxLength: 10 }),
  topicCoverage: fc.double({ min: 0, max: 1, noNaN: true }),
  recent30DayAccuracy: fc.double({ min: 0, max: 1, noNaN: true }),
  recent30DayMinutes: fc.integer({ min: 0, max: 10000 }),
  currentDate: fc.constantFrom('2027-08-15', '2027-10-15', '2027-11-15'),
});

/**
 * Property 18: Calibration output bounds invariant
 *
 * For any valid CalibrationInput, lowerBound <= predictedScore <= upperBound,
 * and predictedScore is in [0, 500].
 *
 * **Validates: Requirements 6.1**
 */
describe('Property 18: Calibration output bounds invariant', () => {
  test.prop([calibrationInputArb])('lowerBound <= predictedScore <= upperBound and predictedScore in [0, 500]', (input) => {
    const result = calibrate(input);

    expect(result.lowerBound).toBeLessThanOrEqual(result.predictedScore);
    expect(result.predictedScore).toBeLessThanOrEqual(result.upperBound);
    expect(result.predictedScore).toBeGreaterThanOrEqual(0);
    expect(result.predictedScore).toBeLessThanOrEqual(500);
  });
});

/**
 * Property 19: Tier fallback generation
 *
 * For any CalibrationResult where lowerBound < checkpoint threshold,
 * tierFallback is non-null with exactly 3 entries, each with distinct tier level
 * and probability range.
 *
 * **Validates: Requirements 6.5**
 */
describe('Property 19: Tier fallback generation', () => {
  test.prop([calibrationInputArb])('tierFallback has 3 distinct-tier entries when lowerBound < threshold', (input) => {
    const result = calibrate(input);
    const threshold = getCheckpointThreshold(input.currentDate);

    if (threshold !== null && result.lowerBound < threshold) {
      expect(result.tierFallback).not.toBeNull();
      expect(result.tierFallback).toHaveLength(3);

      // Each entry has distinct tier level
      const tiers = result.tierFallback.map((entry) => entry.tier);
      const uniqueTiers = new Set(tiers);
      expect(uniqueTiers.size).toBe(3);

      // Each entry has a probability range (array of two numbers)
      for (const entry of result.tierFallback) {
        expect(entry.probabilityRange).toBeDefined();
        expect(entry.probabilityRange).toHaveLength(2);
        expect(typeof entry.probabilityRange[0]).toBe('number');
        expect(typeof entry.probabilityRange[1]).toBe('number');
      }
    }
  });
});

/**
 * Property 20: Dual model uncertainty flag
 *
 * highUncertainty is true iff |coverageModel.predicted - regressionModel.predicted| >= 15
 *
 * **Validates: Requirements 6.6**
 */
describe('Property 20: Dual model uncertainty flag', () => {
  test.prop([calibrationInputArb])('highUncertainty iff model difference >= 15', (input) => {
    const result = calibrate(input);

    const diff = Math.abs(result.coverageModel.predicted - result.regressionModel.predicted);
    const expectedHighUncertainty = diff >= 15;

    expect(result.highUncertainty).toBe(expectedHighUncertainty);
  });
});

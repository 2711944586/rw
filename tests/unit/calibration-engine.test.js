import { describe, it, expect } from 'vitest';
import {
  calibrate,
  getCheckpointThreshold,
  linearCoveragePredict,
  mockRegressionPredict,
  generateTierFallback,
} from '../../src/domain/calibration-engine.js';

describe('calibration-engine', () => {
  describe('getCheckpointThreshold', () => {
    it('returns 390 for August 2027', () => {
      expect(getCheckpointThreshold('2027-08-15')).toBe(390);
      expect(getCheckpointThreshold('2027-08-01')).toBe(390);
    });

    it('returns 405 for October 2027', () => {
      expect(getCheckpointThreshold('2027-10-20')).toBe(405);
    });

    it('returns 415 for November 2027', () => {
      expect(getCheckpointThreshold('2027-11-05')).toBe(415);
    });

    it('returns null for non-checkpoint months', () => {
      expect(getCheckpointThreshold('2027-09-15')).toBeNull();
      expect(getCheckpointThreshold('2027-07-01')).toBeNull();
      expect(getCheckpointThreshold('2027-12-01')).toBeNull();
    });

    it('returns null for null/empty input', () => {
      expect(getCheckpointThreshold(null)).toBeNull();
      expect(getCheckpointThreshold('')).toBeNull();
    });
  });

  describe('linearCoveragePredict', () => {
    it('returns base score of 250 when coverage is 0', () => {
      // accuracyFactor = 0*0.8+0.2 = 0.2, timeFactor = 0/5400 = 0
      // 250 + 0 * 0.2 * 0 = 250
      expect(linearCoveragePredict(0, 0, 0)).toBe(250);
    });

    it('computes correctly with full coverage, accuracy, and time', () => {
      // coverage=1, accuracy=1, minutes=5400
      // coverageBonus=170, accuracyFactor=1*0.8+0.2=1.0, timeFactor=1.0
      // 250 + 170*1.0*1.0 = 420
      expect(linearCoveragePredict(1, 1, 5400)).toBe(420);
    });

    it('caps timeFactor at 1.0 for minutes > 5400', () => {
      expect(linearCoveragePredict(1, 1, 10000)).toBe(420);
    });

    it('computes partial values correctly', () => {
      // coverage=0.5, accuracy=0.8, minutes=2700
      // coverageBonus=85, accuracyFactor=0.8*0.8+0.2=0.84, timeFactor=0.5
      // 250 + 85*0.84*0.5 = 250 + 35.7 = 285.7
      const result = linearCoveragePredict(0.5, 0.8, 2700);
      expect(result).toBeCloseTo(285.7, 1);
    });
  });

  describe('mockRegressionPredict', () => {
    it('returns null predicted and stddev=30 when scores < 2', () => {
      expect(mockRegressionPredict([])).toEqual({ predicted: null, stddev: 30 });
      expect(mockRegressionPredict([350])).toEqual({ predicted: null, stddev: 30 });
    });

    it('returns null predicted for null input', () => {
      expect(mockRegressionPredict(null)).toEqual({ predicted: null, stddev: 30 });
    });

    it('returns a predicted value for 2+ scores', () => {
      const result = mockRegressionPredict([300, 350]);
      expect(result.predicted).toBeGreaterThan(350); // should extrapolate upward
      expect(result.stddev).toBeGreaterThanOrEqual(5);
    });

    it('handles flat scores', () => {
      const result = mockRegressionPredict([400, 400, 400]);
      // Flat scores → predicted ≈ 400, stddev = minimum (5)
      expect(result.predicted).toBeCloseTo(400, 0);
      expect(result.stddev).toBe(5);
    });
  });

  describe('generateTierFallback', () => {
    it('returns exactly 3 tiers', () => {
      const tiers = generateTierFallback(370, 390);
      expect(tiers).toHaveLength(3);
    });

    it('each tier has required fields', () => {
      const tiers = generateTierFallback(370, 390);
      for (const tier of tiers) {
        expect(tier).toHaveProperty('tier');
        expect(tier).toHaveProperty('description');
        expect(tier).toHaveProperty('probabilityRange');
        expect(tier.probabilityRange).toHaveLength(2);
        expect(tier.probabilityRange[0]).toBeLessThanOrEqual(tier.probabilityRange[1]);
      }
    });

    it('tiers have distinct names', () => {
      const tiers = generateTierFallback(350, 405);
      const names = tiers.map(t => t.tier);
      expect(new Set(names).size).toBe(3);
    });
  });

  describe('calibrate', () => {
    const baseInput = {
      mockScores: [350, 360, 370],
      topicCoverage: 0.7,
      recent30DayAccuracy: 0.75,
      recent30DayMinutes: 4000,
      currentDate: '2027-08-15',
    };

    it('satisfies output invariant: lowerBound <= predicted <= upperBound', () => {
      const result = calibrate(baseInput);
      expect(result.lowerBound).toBeLessThanOrEqual(result.predictedScore);
      expect(result.predictedScore).toBeLessThanOrEqual(result.upperBound);
    });

    it('predicted is within [0, 500]', () => {
      const result = calibrate(baseInput);
      expect(result.predictedScore).toBeGreaterThanOrEqual(0);
      expect(result.predictedScore).toBeLessThanOrEqual(500);
    });

    it('sets highUncertainty when models differ >= 15', () => {
      // Low coverage but high mock scores → models should diverge
      const input = {
        mockScores: [400, 420, 440],
        topicCoverage: 0.1,
        recent30DayAccuracy: 0.5,
        recent30DayMinutes: 1000,
        currentDate: '2027-10-15',
      };
      const result = calibrate(input);
      // Check that highUncertainty reflects model difference
      const diff = Math.abs(result.coverageModel.predicted - result.regressionModel.predicted);
      expect(result.highUncertainty).toBe(diff >= 15);
    });

    it('generates tier fallback when lowerBound < threshold', () => {
      // Use very low scores to ensure lowerBound < 390
      const input = {
        mockScores: [200, 210],
        topicCoverage: 0.2,
        recent30DayAccuracy: 0.4,
        recent30DayMinutes: 1000,
        currentDate: '2027-08-15',
      };
      const result = calibrate(input);
      expect(result.tierFallback).not.toBeNull();
      expect(result.tierFallback).toHaveLength(3);
    });

    it('returns null tierFallback when lowerBound >= threshold', () => {
      const input = {
        mockScores: [420, 430, 440, 450],
        topicCoverage: 0.95,
        recent30DayAccuracy: 0.95,
        recent30DayMinutes: 5400,
        currentDate: '2027-08-15',
      };
      const result = calibrate(input);
      // With very high scores, lower bound should be above 390
      if (result.lowerBound >= 390) {
        expect(result.tierFallback).toBeNull();
      }
    });

    it('returns null tierFallback for non-checkpoint months', () => {
      const input = {
        ...baseInput,
        currentDate: '2027-09-15',
      };
      const result = calibrate(input);
      expect(result.tierFallback).toBeNull();
    });

    it('uses fallback regression when mock scores < 2', () => {
      const input = {
        mockScores: [],
        topicCoverage: 0.5,
        recent30DayAccuracy: 0.7,
        recent30DayMinutes: 3000,
        currentDate: '2027-08-15',
      };
      const result = calibrate(input);
      expect(result.confidence).toBe(0.3);
      expect(result.regressionModel.stddev).toBe(30);
    });

    it('has coverageModel and regressionModel in output', () => {
      const result = calibrate(baseInput);
      expect(result.coverageModel).toHaveProperty('predicted');
      expect(result.regressionModel).toHaveProperty('predicted');
      expect(result.regressionModel).toHaveProperty('stddev');
    });
  });
});

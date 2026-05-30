import { describe, it, expect } from 'vitest';
import {
  computeDailyRetro,
  computeWeeklyRetro,
  computeMonthlyAudit,
  shouldShrinkToCore,
  shouldTriggerTierFallback,
} from '../../src/domain/retrospective-engine.js';

describe('retrospective-engine', () => {
  describe('computeDailyRetro', () => {
    it('returns all green signals when all metrics are excellent', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.98,
        coreRatio: 0.70,
        phase: 'reinforcement',
      });
      expect(result.taskSignal).toBe('green');
      expect(result.reviewSignal).toBe('green');
      expect(result.recordSignal).toBe('green');
      expect(result.coreRatioSignal).toBe('green');
    });

    it('returns yellow taskSignal when rate is between 0.60 and 0.85', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.70,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.70,
        phase: 'foundation',
      });
      expect(result.taskSignal).toBe('yellow');
    });

    it('returns red taskSignal when rate is below 0.60', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.50,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.70,
        phase: 'foundation',
      });
      expect(result.taskSignal).toBe('red');
    });

    it('returns yellow reviewSignal when rate is between 0.80 and 0.95', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.85,
        coreRatio: 0.70,
        phase: 'foundation',
      });
      expect(result.reviewSignal).toBe('yellow');
    });

    it('returns red reviewSignal when rate is below 0.80', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.70,
        coreRatio: 0.70,
        phase: 'foundation',
      });
      expect(result.reviewSignal).toBe('red');
    });

    it('computes recordSignal based on recordCount vs taskCount ratio', () => {
      // recordCount / taskCount = 5/10 = 0.5 → red
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 5,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.70,
        phase: 'foundation',
      });
      expect(result.recordSignal).toBe('red');
    });

    it('returns yellow recordSignal when ratio is between 0.6 and 0.9', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 7,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.70,
        phase: 'foundation',
      });
      expect(result.recordSignal).toBe('yellow');
    });

    it('uses foundation phase threshold (0.55) for coreRatioSignal', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.50,
        phase: 'foundation',
      });
      // 0.50 >= 0.45 (threshold - 0.10) → yellow
      expect(result.coreRatioSignal).toBe('yellow');
    });

    it('returns red coreRatioSignal when below yellow threshold', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.40,
        phase: 'foundation',
      });
      // 0.40 < 0.45 (0.55 - 0.10) → red
      expect(result.coreRatioSignal).toBe('red');
    });

    it('uses reinforcement phase threshold (0.65) for coreRatioSignal', () => {
      const result = computeDailyRetro({
        taskCompletionRate: 0.90,
        recordCount: 10,
        taskCount: 10,
        reviewDueProcessedRate: 0.96,
        coreRatio: 0.60,
        phase: 'reinforcement',
      });
      // 0.60 >= 0.55 (0.65 - 0.10) → yellow
      expect(result.coreRatioSignal).toBe('yellow');
    });
  });

  describe('computeWeeklyRetro', () => {
    it('returns green overall when all metrics are good', () => {
      const result = computeWeeklyRetro([], {
        totalEffectiveMinutes: 1000,
        plannedMinutes: 1200,
        breakDays: 0,
        mistakeRecoveryRate: 0.80,
        coreRatioMedian: 0.70,
        phase: 'reinforcement',
      });
      expect(result.overallSignal).toBe('green');
    });

    it('returns red overall when effective minutes < planned * 0.70', () => {
      const result = computeWeeklyRetro([], {
        totalEffectiveMinutes: 500,
        plannedMinutes: 1200,
        breakDays: 0,
        mistakeRecoveryRate: 0.80,
        coreRatioMedian: 0.70,
        phase: 'reinforcement',
      });
      expect(result.overallSignal).toBe('red');
      expect(result.signals.effectiveMinutes).toBe('red');
    });

    it('returns red overall when breakDays >= 2', () => {
      const result = computeWeeklyRetro([], {
        totalEffectiveMinutes: 1000,
        plannedMinutes: 1200,
        breakDays: 2,
        mistakeRecoveryRate: 0.80,
        coreRatioMedian: 0.70,
        phase: 'reinforcement',
      });
      expect(result.overallSignal).toBe('red');
      expect(result.signals.breakDays).toBe('red');
    });

    it('returns red overall when mistakeRecoveryRate < 0.50', () => {
      const result = computeWeeklyRetro([], {
        totalEffectiveMinutes: 1000,
        plannedMinutes: 1200,
        breakDays: 0,
        mistakeRecoveryRate: 0.40,
        coreRatioMedian: 0.70,
        phase: 'reinforcement',
      });
      expect(result.overallSignal).toBe('red');
      expect(result.signals.mistakeRecovery).toBe('red');
    });

    it('returns red overall when coreRatioMedian < phase lower bound', () => {
      const result = computeWeeklyRetro([], {
        totalEffectiveMinutes: 1000,
        plannedMinutes: 1200,
        breakDays: 0,
        mistakeRecoveryRate: 0.80,
        coreRatioMedian: 0.50,
        phase: 'reinforcement',
      });
      expect(result.overallSignal).toBe('red');
      expect(result.signals.coreRatioMedian).toBe('red');
    });
  });

  describe('computeMonthlyAudit', () => {
    it('returns on_track when ratio >= 0.85', () => {
      const result = computeMonthlyAudit(
        { actualMinutes: 9000 },
        { cumulativePlannedMinutes: 10000 }
      );
      expect(result.ratio).toBeCloseTo(0.90);
      expect(result.shouldShrinkToCore).toBe(false);
      expect(result.shouldTierFallback).toBe(false);
      expect(result.recommendation).toBe('on_track');
    });

    it('returns shrink_to_core when ratio < 0.85 but >= 0.70', () => {
      const result = computeMonthlyAudit(
        { actualMinutes: 8000 },
        { cumulativePlannedMinutes: 10000 }
      );
      expect(result.ratio).toBeCloseTo(0.80);
      expect(result.shouldShrinkToCore).toBe(true);
      expect(result.shouldTierFallback).toBe(false);
      expect(result.recommendation).toBe('shrink_to_core');
    });

    it('returns tier_fallback when ratio < 0.70', () => {
      const result = computeMonthlyAudit(
        { actualMinutes: 6000 },
        { cumulativePlannedMinutes: 10000 }
      );
      expect(result.ratio).toBeCloseTo(0.60);
      expect(result.shouldShrinkToCore).toBe(true);
      expect(result.shouldTierFallback).toBe(true);
      expect(result.recommendation).toBe('tier_fallback');
    });

    it('handles zero planned minutes gracefully', () => {
      const result = computeMonthlyAudit(
        { actualMinutes: 100 },
        { cumulativePlannedMinutes: 0 }
      );
      expect(result.ratio).toBe(1);
      expect(result.recommendation).toBe('on_track');
    });
  });

  describe('shouldShrinkToCore', () => {
    it('returns true when ratio < 0.85', () => {
      expect(shouldShrinkToCore(0.84)).toBe(true);
      expect(shouldShrinkToCore(0.50)).toBe(true);
    });

    it('returns false when ratio >= 0.85', () => {
      expect(shouldShrinkToCore(0.85)).toBe(false);
      expect(shouldShrinkToCore(1.0)).toBe(false);
    });
  });

  describe('shouldTriggerTierFallback', () => {
    it('returns true when ratio < 0.70', () => {
      expect(shouldTriggerTierFallback(0.69)).toBe(true);
      expect(shouldTriggerTierFallback(0.30)).toBe(true);
    });

    it('returns false when ratio >= 0.70', () => {
      expect(shouldTriggerTierFallback(0.70)).toBe(false);
      expect(shouldTriggerTierFallback(0.90)).toBe(false);
    });
  });
});

import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import {
  computeDailyRetro,
  computeWeeklyRetro,
  computeMonthlyAudit,
  shouldShrinkToCore,
  shouldTriggerTierFallback,
} from '../../src/domain/retrospective-engine.js';

/**
 * Property 14: Daily retrospective signal computation
 * Validates: Requirements 4.2
 */
describe('Property 14: Daily retrospective signal computation', () => {
  const phaseArb = fc.constantFrom('foundation', 'reinforcement', 'pastExam', 'sprint');
  const rateArb = fc.double({ min: 0, max: 1, noNaN: true });
  const countArb = fc.integer({ min: 0, max: 100 });

  const dailyRetroInputArb = fc.record({
    taskCompletionRate: rateArb,
    recordCount: countArb,
    taskCount: fc.integer({ min: 1, max: 100 }),
    reviewDueProcessedRate: rateArb,
    coreRatio: rateArb,
    phase: phaseArb,
  });

  test.prop([dailyRetroInputArb])('taskSignal is green if rate >= 0.85, yellow if >= 0.60, red otherwise', (input) => {
    const result = computeDailyRetro(input);
    if (input.taskCompletionRate >= 0.85) {
      expect(result.taskSignal).toBe('green');
    } else if (input.taskCompletionRate >= 0.60) {
      expect(result.taskSignal).toBe('yellow');
    } else {
      expect(result.taskSignal).toBe('red');
    }
  });

  test.prop([dailyRetroInputArb])('reviewSignal is green if rate >= 0.95, yellow if >= 0.80, red otherwise', (input) => {
    const result = computeDailyRetro(input);
    if (input.reviewDueProcessedRate >= 0.95) {
      expect(result.reviewSignal).toBe('green');
    } else if (input.reviewDueProcessedRate >= 0.80) {
      expect(result.reviewSignal).toBe('yellow');
    } else {
      expect(result.reviewSignal).toBe('red');
    }
  });

  test.prop([dailyRetroInputArb])('recordSignal is green if recordCount >= taskCount * 0.9', (input) => {
    const result = computeDailyRetro(input);
    const recordRatio = input.recordCount / input.taskCount;
    if (recordRatio >= 0.9) {
      expect(result.recordSignal).toBe('green');
    } else if (recordRatio >= 0.6) {
      expect(result.recordSignal).toBe('yellow');
    } else {
      expect(result.recordSignal).toBe('red');
    }
  });

  test.prop([dailyRetroInputArb])('coreRatioSignal per phase thresholds', (input) => {
    const result = computeDailyRetro(input);
    const phaseThreshold = input.phase === 'foundation' ? 0.55 : 0.65;
    if (input.coreRatio >= phaseThreshold) {
      expect(result.coreRatioSignal).toBe('green');
    } else if (input.coreRatio >= phaseThreshold - 0.10) {
      expect(result.coreRatioSignal).toBe('yellow');
    } else {
      expect(result.coreRatioSignal).toBe('red');
    }
  });
});

/**
 * Property 15: Weekly retrospective red triggers
 * Validates: Requirements 4.4
 */
describe('Property 15: Weekly retrospective red triggers', () => {
  const phaseArb = fc.constantFrom('foundation', 'reinforcement', 'pastExam', 'sprint');

  const weekDataArb = fc.record({
    totalEffectiveMinutes: fc.double({ min: 0, max: 10000, noNaN: true }),
    plannedMinutes: fc.double({ min: 1, max: 10000, noNaN: true }),
    breakDays: fc.integer({ min: 0, max: 7 }),
    mistakeRecoveryRate: fc.double({ min: 0, max: 1, noNaN: true }),
    coreRatioMedian: fc.double({ min: 0, max: 1, noNaN: true }),
    phase: phaseArb,
  });

  test.prop([weekDataArb])('overall is red if ANY red trigger fires', (weekData) => {
    const result = computeWeeklyRetro([], weekData);

    const phaseThreshold = weekData.phase === 'foundation' ? 0.55 : 0.65;
    const effectiveRatio = weekData.totalEffectiveMinutes / weekData.plannedMinutes;

    const anyRedTrigger =
      effectiveRatio < 0.70 ||
      weekData.breakDays >= 2 ||
      weekData.mistakeRecoveryRate < 0.50 ||
      weekData.coreRatioMedian < phaseThreshold;

    if (anyRedTrigger) {
      expect(result.overallSignal).toBe('red');
    } else {
      expect(result.overallSignal).not.toBe('red');
    }
  });
});

/**
 * Property 16: Monthly audit threshold actions
 * Validates: Requirements 4.6, 4.7
 */
describe('Property 16: Monthly audit threshold actions', () => {
  const ratioArb = fc.double({ min: 0, max: 2, noNaN: true });

  test.prop([ratioArb])('shouldShrinkToCore when ratio < 0.85', (ratio) => {
    expect(shouldShrinkToCore(ratio)).toBe(ratio < 0.85);
  });

  test.prop([ratioArb])('shouldTriggerTierFallback when ratio < 0.70', (ratio) => {
    expect(shouldTriggerTierFallback(ratio)).toBe(ratio < 0.70);
  });

  test.prop([fc.double({ min: 0, max: 10000, noNaN: true }), fc.double({ min: 1, max: 10000, noNaN: true })])(
    'computeMonthlyAudit integrates both threshold checks correctly',
    (actualMinutes, plannedMinutes) => {
      const result = computeMonthlyAudit(
        { actualMinutes },
        { cumulativePlannedMinutes: plannedMinutes }
      );

      const ratio = actualMinutes / plannedMinutes;
      expect(result.shouldShrinkToCore).toBe(ratio < 0.85);
      expect(result.shouldTierFallback).toBe(ratio < 0.70);
    }
  );
});

import { describe, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import {
  validateCompletion,
  validateMasteryPromotion,
  checkMasteryDemotion,
} from '../../src/domain/task-contract.js';

/**
 * Property 11: Task contract validation
 * **Validates: Requirements 3.2, 3.3, 3.7**
 *
 * For any task with a TaskContract and any completion attempt payload,
 * the validation function SHALL return false (blocking completion) if:
 * (a) any required_artifacts field is missing from the payload, OR
 * (b) required_problem_count > 0 and submitted problems < required, OR
 * (c) problems > 0 and correct_count is not provided.
 * The function SHALL return true only when all contract fields are satisfied.
 */
describe('Property 11: Task contract validation', () => {
  // Generator for non-empty artifact names
  const artifactGen = fc.string({ minLength: 1, maxLength: 20 });

  test.prop([
    fc.array(artifactGen, { minLength: 1, maxLength: 5 }),
    fc.array(artifactGen, { minLength: 0, maxLength: 5 }),
  ])('returns invalid when required artifacts are missing from payload', (requiredArtifacts, submittedArtifacts) => {
    // Ensure at least one required artifact is NOT in submitted
    const missing = requiredArtifacts.filter((a) => !submittedArtifacts.includes(a));
    fc.pre(missing.length > 0);

    const task = { required_artifacts: requiredArtifacts, required_problem_count: 0 };
    const payload = { artifacts: submittedArtifacts, problem_count: 0 };

    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test.prop([
    fc.integer({ min: 1, max: 100 }),
    fc.integer({ min: 0, max: 99 }),
  ])('returns invalid when submitted problems < required', (required, submitted) => {
    fc.pre(submitted < required);

    const task = { required_artifacts: [], required_problem_count: required };
    const payload = { artifacts: [], problem_count: submitted, correct_count: submitted };

    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('problems'))).toBe(true);
  });

  test.prop([
    fc.integer({ min: 1, max: 100 }),
  ])('returns invalid when problems > 0 but correct_count is not provided', (problemCount) => {
    const task = { required_artifacts: [], required_problem_count: 0 };
    const payload = { artifacts: [], problem_count: problemCount };
    // correct_count is intentionally omitted

    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('correct_count'))).toBe(true);
  });

  test.prop([
    fc.array(artifactGen, { minLength: 0, maxLength: 5 }),
    fc.integer({ min: 0, max: 50 }),
    fc.integer({ min: 0, max: 50 }),
  ])('returns valid when all contract fields are satisfied', (artifacts, requiredProblems, extraProblems) => {
    const totalProblems = requiredProblems + extraProblems;
    const task = { required_artifacts: artifacts, required_problem_count: requiredProblems };
    const payload = {
      artifacts: [...artifacts], // All required artifacts present
      problem_count: totalProblems,
      correct_count: totalProblems, // All correct
    };

    // If problem_count is 0 and required is 0, correct_count isn't needed, but we provide it anyway
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

/**
 * Property 12: Mastery evidence gate
 * **Validates: Requirements 3.4**
 *
 * For any topic and mastery-promotion attempt, the gate function SHALL return
 * false (blocking promotion) unless ALL of: total_problems >= 30,
 * recent_14d_accuracy >= 0.80, and days since last review <= 7.
 */
describe('Property 12: Mastery evidence gate', () => {
  const today = new Date('2025-01-15T12:00:00Z');

  test.prop([
    fc.integer({ min: 0, max: 29 }),
    fc.double({ min: 0.80, max: 1.0, noNaN: true }),
    fc.integer({ min: 0, max: 7 }),
  ])('returns false when total_problems < 30', (totalProblems, accuracy, daysSince) => {
    const lastReview = new Date(today.getTime() - daysSince * 86400000);
    const progress = {
      total_problems: totalProblems,
      recent_14d_accuracy: accuracy,
      last_review: lastReview.toISOString(),
    };

    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria.length).toBeGreaterThan(0);
  });

  test.prop([
    fc.integer({ min: 30, max: 500 }),
    fc.double({ min: 0, max: 0.7999, noNaN: true }),
    fc.integer({ min: 0, max: 7 }),
  ])('returns false when recent_14d_accuracy < 0.80', (totalProblems, accuracy, daysSince) => {
    const lastReview = new Date(today.getTime() - daysSince * 86400000);
    const progress = {
      total_problems: totalProblems,
      recent_14d_accuracy: accuracy,
      last_review: lastReview.toISOString(),
    };

    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria.length).toBeGreaterThan(0);
  });

  test.prop([
    fc.integer({ min: 30, max: 500 }),
    fc.double({ min: 0.80, max: 1.0, noNaN: true }),
    fc.integer({ min: 8, max: 365 }),
  ])('returns false when daysSinceLastReview > 7', (totalProblems, accuracy, daysSince) => {
    const lastReview = new Date(today.getTime() - daysSince * 86400000);
    const progress = {
      total_problems: totalProblems,
      recent_14d_accuracy: accuracy,
      last_review: lastReview.toISOString(),
    };

    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria.length).toBeGreaterThan(0);
  });

  test.prop([
    fc.integer({ min: 30, max: 500 }),
    fc.double({ min: 0.80, max: 1.0, noNaN: true }),
    fc.integer({ min: 0, max: 7 }),
  ])('returns true when ALL criteria are met', (totalProblems, accuracy, daysSince) => {
    const lastReview = new Date(today.getTime() - daysSince * 86400000);
    const progress = {
      total_problems: totalProblems,
      recent_14d_accuracy: accuracy,
      last_review: lastReview.toISOString(),
    };

    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(true);
    expect(result.unmetCriteria).toHaveLength(0);
  });
});

/**
 * Property 13: Mastery demotion on poor review
 * **Validates: Requirements 3.5**
 *
 * For any topic with mastery_status='mastered' and accuracy < 0.60,
 * checkMasteryDemotion returns shouldDemote=true and newStatus='needs_review'.
 */
describe('Property 13: Mastery demotion on poor review', () => {
  test.prop([
    fc.double({ min: 0, max: 0.5999, noNaN: true }),
  ])('demotes mastered topic when accuracy < 0.60', (accuracy) => {
    const topic = { mastery_status: 'mastered' };
    const reviewResult = { accuracy };

    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(true);
    expect(result.newStatus).toBe('needs_review');
  });

  test.prop([
    fc.double({ min: 0.60, max: 1.0, noNaN: true }),
  ])('does NOT demote mastered topic when accuracy >= 0.60', (accuracy) => {
    const topic = { mastery_status: 'mastered' };
    const reviewResult = { accuracy };

    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(false);
    expect(result.newStatus).toBe('mastered');
  });

  test.prop([
    fc.constantFrom('learning', 'needs_review'),
    fc.double({ min: 0, max: 0.5999, noNaN: true }),
  ])('does NOT demote non-mastered topics even with low accuracy', (status, accuracy) => {
    const topic = { mastery_status: status };
    const reviewResult = { accuracy };

    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(false);
    expect(result.newStatus).toBe(status);
  });
});

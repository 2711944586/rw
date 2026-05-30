import { describe, it, expect } from 'vitest';
import {
  validateCompletion,
  validateMasteryPromotion,
  checkMasteryDemotion
} from '../../src/domain/task-contract.js';

describe('validateCompletion', () => {
  it('returns valid when all contract fields are satisfied', () => {
    const task = {
      required_artifacts: ['题目数与正确率'],
      required_problem_count: 5
    };
    const payload = {
      artifacts: ['题目数与正确率'],
      problem_count: 5,
      correct_count: 4
    };
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('blocks when required_artifacts are missing from payload', () => {
    const task = {
      required_artifacts: ['推导过程图', '错因笔记'],
      required_problem_count: 0
    };
    const payload = { artifacts: ['推导过程图'] };
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('错因笔记');
  });

  it('blocks when submitted problems < required_problem_count', () => {
    const task = { required_artifacts: [], required_problem_count: 10 };
    const payload = { problem_count: 5, correct_count: 3 };
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('less than required');
  });

  it('blocks when problem_count > 0 but correct_count not provided', () => {
    const task = { required_artifacts: [], required_problem_count: 0 };
    const payload = { problem_count: 3 };
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('correct_count is required');
  });

  it('passes when problem_count is 0 and no correct_count', () => {
    const task = { required_artifacts: [], required_problem_count: 0 };
    const payload = { problem_count: 0 };
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(true);
  });

  it('handles missing artifacts array in payload', () => {
    const task = { required_artifacts: ['代码或伪代码'], required_problem_count: 0 };
    const payload = {};
    const result = validateCompletion(task, payload);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('代码或伪代码');
  });
});

describe('validateMasteryPromotion', () => {
  const today = new Date('2027-06-15');

  it('allows promotion when all criteria met', () => {
    const progress = {
      total_problems: 35,
      recent_14d_accuracy: 0.85,
      last_review: '2027-06-12'
    };
    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(true);
    expect(result.unmetCriteria).toEqual([]);
  });

  it('blocks when total_problems < 30', () => {
    const progress = {
      total_problems: 20,
      recent_14d_accuracy: 0.85,
      last_review: '2027-06-12'
    };
    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria[0]).toContain('total_problems');
  });

  it('blocks when recent_14d_accuracy < 0.80', () => {
    const progress = {
      total_problems: 30,
      recent_14d_accuracy: 0.75,
      last_review: '2027-06-12'
    };
    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria[0]).toContain('recent_14d_accuracy');
  });

  it('blocks when last_review > 7 days ago', () => {
    const progress = {
      total_problems: 30,
      recent_14d_accuracy: 0.85,
      last_review: '2027-06-01'
    };
    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria[0]).toContain('daysSinceLastReview');
  });

  it('blocks when last_review is missing', () => {
    const progress = {
      total_problems: 30,
      recent_14d_accuracy: 0.85,
      last_review: null
    };
    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria[0]).toContain('last_review is missing');
  });

  it('reports multiple unmet criteria', () => {
    const progress = {
      total_problems: 10,
      recent_14d_accuracy: 0.50,
      last_review: '2027-05-01'
    };
    const result = validateMasteryPromotion(progress, today);
    expect(result.canPromote).toBe(false);
    expect(result.unmetCriteria.length).toBe(3);
  });
});

describe('checkMasteryDemotion', () => {
  it('demotes when mastered and accuracy < 0.60', () => {
    const topic = { mastery_status: 'mastered' };
    const reviewResult = { accuracy: 0.50 };
    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(true);
    expect(result.newStatus).toBe('needs_review');
  });

  it('does not demote when accuracy >= 0.60', () => {
    const topic = { mastery_status: 'mastered' };
    const reviewResult = { accuracy: 0.60 };
    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(false);
    expect(result.newStatus).toBe('mastered');
  });

  it('does not demote when status is not mastered', () => {
    const topic = { mastery_status: 'learning' };
    const reviewResult = { accuracy: 0.30 };
    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(false);
    expect(result.newStatus).toBe('learning');
  });

  it('does not demote needs_review even with low accuracy', () => {
    const topic = { mastery_status: 'needs_review' };
    const reviewResult = { accuracy: 0.10 };
    const result = checkMasteryDemotion(topic, reviewResult);
    expect(result.shouldDemote).toBe(false);
    expect(result.newStatus).toBe('needs_review');
  });
});

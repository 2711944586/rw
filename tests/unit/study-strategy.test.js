import { describe, expect, it } from 'vitest';
import {
  applyPlanControls,
  buildRollingReviewWindows,
  normalizePlanControls,
  reviewLoadSignal,
  subjectPlanWeights,
} from '../../src/domain/study-strategy.js';

describe('study-strategy', () => {
  it('normalizes invalid controls to safe defaults', () => {
    const controls = normalizePlanControls({
      planIntensity: 'panic',
      focusSubject: 'physics',
      reviewLoad: 999,
      maxNewTopics: -2,
      rollingWindowDays: 3,
      enabledSubjects: ['english'],
    });

    expect(controls.planIntensity).toBe('normal');
    expect(controls.focusSubject).toBe('auto');
    expect(controls.reviewLoad).toBe(60);
    expect(controls.maxNewTopics).toBe(0);
    expect(controls.rollingWindowDays).toBe(7);
    expect(controls.enabledSubjects).toContain('math');
    expect(controls.enabledSubjects).toContain('cs408');
    expect(controls.enabledSubjects).toContain('review');
  });

  it('increases the selected focus subject weight', () => {
    const base = subjectPlanWeights('C', normalizePlanControls({ focusSubject: 'auto' }));
    const focused = subjectPlanWeights('C', normalizePlanControls({ focusSubject: 'math' }));

    expect(focused.math).toBeGreaterThan(base.math);
  });

  it('keeps review and carryover tasks while limiting new topics', () => {
    const plan = applyPlanControls([
      { id: 'review', subject: '复盘', reviewItemId: 'r1', minutes: 25, priority: 1 },
      { id: 'math', subject: '数学', minutes: 60, priority: 2 },
      { id: 'cs', subject: '408', minutes: 60, priority: 3 },
      { id: 'eng', subject: '英语', minutes: 30, priority: 4 },
    ], {
      budget: 180,
      targetCount: 4,
      controls: normalizePlanControls({ maxNewTopics: 1 }),
    });

    expect(plan.map((task) => task.id)).toContain('review');
    expect(plan.filter((task) => !task.reviewItemId).length).toBe(1);
  });

  it('builds rolling review windows and surfaces overdue risk', () => {
    const windows = buildRollingReviewWindows([
      { id: 'a', dueDate: '2026-06-01', done: false, round: 'D+1' },
      { id: 'b', dueDate: '2026-06-02', done: false, round: 'D+3' },
      { id: 'c', dueDate: '2026-06-05', done: false, round: 'D+7' },
    ], '2026-06-02', { controls: normalizePlanControls() });

    expect(windows.find((item) => item.key === 'overdue')?.count).toBe(1);
    expect(windows.find((item) => item.key === 'today')?.count).toBe(1);
    expect(reviewLoadSignal([{ id: 'a', dueDate: '2026-06-01' }], '2026-06-02').level).toBe('risk');
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyPlanControls,
  buildRollingReviewWindows,
  getPhaseStrategy,
  getSyllabusFramework,
  isSubjectEnabled,
  normalizePlanControls,
  recommendPlanAdjustment,
  reviewLoadSignal,
  subjectKey,
  subjectLabel,
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

  it('normalizes malformed controls and localized subject names', () => {
    expect(normalizePlanControls(null)).toMatchObject({
      planIntensity: 'normal',
      focusSubject: 'auto',
      experienceTrack: 'balanced',
    });

    const controls = normalizePlanControls({
      enabledSubjects: ['数学', '408', '复盘', {}, 'physics'],
      focusSubject: '数学',
      experienceTrack: 'constructor',
      reviewLoad: Number.NaN,
      maxNewTopics: Number.POSITIVE_INFINITY,
      rollingWindowDays: '45',
    });

    expect(controls.enabledSubjects).toEqual(['math', 'cs408', 'review']);
    expect(controls.focusSubject).toBe('math');
    expect(controls.experienceTrack).toBe('balanced');
    expect(controls.reviewLoad).toBe(15);
    expect(controls.maxNewTopics).toBe(0);
    expect(controls.rollingWindowDays).toBe(45);
  });

  it('maps subject labels safely for malformed values', () => {
    expect(subjectKey('数学')).toBe('math');
    expect(subjectKey(408)).toBe('cs408');
    expect(subjectKey(null)).toBe('');
    expect(subjectKey({ bad: true })).toBe('');
    expect(subjectLabel(null)).toBe('');
    expect(subjectLabel({ bad: true })).toBe('');
    expect(isSubjectEnabled('数学', { enabledSubjects: ['数学'] })).toBe(true);
  });

  it('increases the selected focus subject weight', () => {
    const base = subjectPlanWeights('C', normalizePlanControls({ focusSubject: 'auto' }));
    const focused = subjectPlanWeights('C', normalizePlanControls({ focusSubject: 'math' }));

    expect(focused.math).toBeGreaterThan(base.math);
  });

  it('falls back for prototype-like phase keys and syllabus keys', () => {
    const phase = getPhaseStrategy('constructor', 'constructor');
    expect(phase.label).toBe('启动与负荷校准');
    expect(phase.trackText).toBe('');
    expect(getPhaseStrategy('A', { bad: true }).trackText).toBe('');
    expect(getSyllabusFramework('constructor')).toEqual([]);
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

  it('handles malformed task lists, priorities, minutes, and context safely', () => {
    expect(applyPlanControls(null, null)).toEqual([]);

    const plan = applyPlanControls([
      null,
      { id: 'carry', subject: '数学', source: 'carryover', minutes: Number.POSITIVE_INFINITY, priority: Number.NaN },
      { id: 'math', subject: '数学', minutes: '60', priority: '2' },
      { id: 'bad-subject', subject: {}, minutes: 30, priority: 1 },
      { id: 'english', subject: '英语', minutes: -5, priority: Number.POSITIVE_INFINITY },
    ], {
      budget: '60',
      targetCount: Number.POSITIVE_INFINITY,
      controls: normalizePlanControls({ enabledSubjects: ['数学', '英语', '复盘'], maxNewTopics: 4 }),
    });

    expect(plan.map((task) => task.id)).toEqual(['carry']);
    expect(plan.every((task) => Number.isInteger(task.priority) && task.priority > 0)).toBe(true);
  });

  it('builds rolling review windows and surfaces overdue risk', () => {
    const windows = buildRollingReviewWindows([
      { id: 'a', dueDate: '2026-06-01', done: false, round: 'D+1' },
      { id: 'b', dueDate: '2026-06-02', done: false, round: 'D+3' },
      { id: 'c', dueDate: '2026-06-05', done: false, round: 'D+7' },
      { id: 'd', dueDate: '2026-06-02', done: false, status: 'failed', round: 'D+1' },
      { id: 'e', dueDate: '2026-06-02', done: true, status: 'done', round: 'D+1' },
    ], '2026-06-02', { controls: normalizePlanControls() });

    expect(windows.find((item) => item.key === 'overdue')?.count).toBe(1);
    expect(windows.find((item) => item.key === 'today')?.count).toBe(1);
    expect(reviewLoadSignal([{ id: 'a', dueDate: '2026-06-01' }], '2026-06-02').level).toBe('risk');
    expect(reviewLoadSignal([], '2026-06-02')).toMatchObject({
      level: 'ok',
      label: '还没有复盘',
    });
    expect(reviewLoadSignal([{ id: 'later', dueDate: '2026-06-09', done: false }], '2026-06-02').label).toBe('无到期');
  });

  it('skips malformed review windows without producing NaN totals', () => {
    expect(buildRollingReviewWindows(null, '2026-06-02')).toHaveLength(6);

    const windows = buildRollingReviewWindows([
      { id: 'bad-date', dueDate: 'not-a-date', round: 'D+30' },
      { id: 'bad-today', nextDueAt: '2026-06-02', round: 'D+7' },
      { id: 'valid', dueDate: '2026-06-09', round: 'D+7' },
    ], '2026-06-02', { controls: { reviewLoad: '30', rollingWindowDays: Number.POSITIVE_INFINITY } });

    expect(windows.find((item) => item.key === 'week')?.count).toBe(1);
    expect(windows.every((item) => Number.isFinite(item.count) && Number.isFinite(item.minutes))).toBe(true);
    expect(reviewLoadSignal('bad-shape', 'bad-date').level).toBe('ok');
  });

  it('ignores object review rounds when estimating review minutes', () => {
    const objectRound = buildRollingReviewWindows([
      { id: 'object-round', dueDate: '2026-06-02', round: { bad: true } },
    ], '2026-06-02', { controls: { reviewLoad: 30 } });
    const d30Round = buildRollingReviewWindows([
      { id: 'd30-round', dueDate: '2026-06-02', round: 'D+30' },
    ], '2026-06-02', { controls: { reviewLoad: 30 } });

    expect(objectRound.find((item) => item.key === 'today')?.minutes).toBe(18);
    expect(d30Round.find((item) => item.key === 'today')?.minutes).toBe(30);
    expect(JSON.stringify(objectRound)).not.toContain('[object Object]');
  });

  it('sanitizes metrics before recommending plan adjustments', () => {
    expect(recommendPlanAdjustment(null, null, 'constructor')).toContain('四科均衡');
    expect(recommendPlanAdjustment({ activeDays: '2' })).toContain('底线日');
    expect(recommendPlanAdjustment({ coreRatio: '0.5' })).toContain('占比偏低');
    expect(recommendPlanAdjustment({ mistakeRecovery: -1 })).toContain('错题回炉率偏低');
    expect(recommendPlanAdjustment({ activeDays: Number.POSITIVE_INFINITY, coreRatio: Number.NaN, mistakeRecovery: 'bad' })).toContain('四科均衡');
  });
});

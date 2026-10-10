import { describe, expect, it } from 'vitest';
import {
  goalChangeImpact,
  resolveStudyGoal,
} from '../../src/domain/admission-catalog.js';

describe('admission catalog', () => {
  it('keeps 2026 directions 01-04 on math 1 and 408', () => {
    for (const directionId of ['01', '02', '03', '04']) {
      const goal = resolveStudyGoal({ admissionYear: 2026, directionId });
      expect(goal.status).toBe('official');
      expect(goal.subjects.map((subject) => subject.code)).toEqual(['101', '201', '301', '408']);
    }
  });

  it('keeps direction 05 on electronics and direction 06 on math 2', () => {
    const electronics = resolveStudyGoal({ admissionYear: 2026, directionId: '05' });
    const finance = resolveStudyGoal({ admissionYear: 2026, directionId: '06' });
    expect(electronics.subjects.map((subject) => subject.name)).toContain('电子信息基础');
    expect(electronics.subjectKeys).not.toContain('cs408');
    expect(finance.subjects.map((subject) => subject.code)).toContain('302');
    expect(finance.subjectKeys).toContain('professional');
  });

  it('keeps 2027 pending and preserves history when subjects change', () => {
    const pending = resolveStudyGoal({ admissionYear: 2027, directionId: '01' });
    expect(pending.pendingOfficial).toBe(true);
    expect(pending.basisAdmissionYear).toBe(2026);
    const impact = goalChangeImpact(
      { admissionYear: 2027, directionId: '01' },
      { admissionYear: 2026, directionId: '05' },
    );
    expect(impact.changesSubjects).toBe(true);
    expect(impact.preservesHistory).toBe(true);
    expect(impact.preserved).toContain('已完成任务');
  });
});

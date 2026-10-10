import { describe, expect, it } from 'vitest';
import { phases } from '../../src/data/study-content.js';
import { PHASE_STATUS, phaseHeadline, resolvePhaseStatus } from '../../src/domain/study-phase.js';

describe('study phase calendar', () => {
  it('stays not-started before the first phase and does not invent phase A as active', () => {
    const resolution = resolvePhaseStatus('2026-08-30', phases);
    expect(resolution.status).toBe(PHASE_STATUS.NOT_STARTED);
    expect(resolution.phase.id).toBe('A');
    expect(phaseHeadline(resolution)).toContain('未开始');
  });

  it('is active on a boundary day', () => {
    expect(resolvePhaseStatus('2026-08-31', phases).status).toBe(PHASE_STATUS.ACTIVE);
    expect(resolvePhaseStatus('2026-09-27', phases).phase.id).toBe('A');
    expect(resolvePhaseStatus('2026-09-28', phases).phase.id).toBe('B');
  });

  it('does not fall back to phase A after the last phase', () => {
    const resolution = resolvePhaseStatus('2027-12-26', phases);
    expect(resolution.status).toBe(PHASE_STATUS.COMPLETED);
    expect(resolution.phase.id).not.toBe('A');
    expect(phaseHeadline(resolution)).toContain('已结束');
  });

  it('rejects an invalid calendar date and accepts a real leap day', () => {
    expect(resolvePhaseStatus('2025-02-29', phases).phase).toBeNull();
    expect(resolvePhaseStatus('2024-02-29', [{ id: 'L', start: '2024-02-29', end: '2024-02-29' }]).status).toBe(PHASE_STATUS.ACTIVE);
  });
});

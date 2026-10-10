/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/config/app-config.js';
import { localReviewPrompt } from '../../src/domain/local-assist.js';
import { scoreTaskPriority } from '../../src/domain/priority-score.js';
import { buildStudyReport } from '../../src/domain/study-report.js';
import { createEntityRepository, replaceMistake, replaceSessions } from '../../src/infrastructure/persistence/entity-repository.js';
import { freshState, migrateState } from '../../src/app.js';

describe('workbench domain helpers', () => {
  it('migrates a pre-v4 payload without dropping history', () => {
    const migrated = migrateState({
      schemaVersion: 3,
      entries: { '2026-10-01': { math: 30, note: '保留' } },
      scores: [{ id: 's1', date: '2026-10-02', name: '套卷', politics: 1, english: 1, math: 1, cs408: 1 }],
      settings: { density: 'focus' },
    });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.settings.density).toBe('balanced');
    expect(migrated.settings.studyGoal.directionId).toBe('01');
    expect(migrated.entries['2026-10-01'].note).toBe('保留');
    expect(migrated.scores).toHaveLength(1);
    expect(migrated.mistakes).toEqual([]);
  });

  it('builds a report that leaves missing scores empty', () => {
    const report = buildStudyReport({ minutes: null, mockDelta: null, dueReviews: 1, weakTopics: ['极限'] });
    expect(report.facts.join(' ')).toContain('不记为 0');
    expect(report.facts.join(' ')).toContain('不把空数据当成 0 分');
    expect(report.inferences[0]).toContain('极限');
  });

  it('explains priority without treating the score as a locked rewrite', () => {
    const scored = scoreTaskPriority({ urgency: 0.9, weakness: 0.2, reviewLoad: 0.1, phaseImportance: 0.2, locked: true });
    expect(scored.reasons).toContain('临近到期或已逾期');
    expect(scored.locked).toBe(true);
  });

  it('keeps the local assist on device and off by default', () => {
    expect(localReviewPrompt({ enabled: false, mistakes: [{ summary: '错因' }] }).text).toBe('');
    const prompt = localReviewPrompt({ enabled: true, mistakes: [{ summary: '条件漏了' }] });
    expect(prompt.leavesDevice).toBe(false);
    expect(prompt.refusesPolicy).toBe(true);
    expect(prompt.text).toContain('条件漏了');
  });

  it('writes sessions and mistakes through the single repository', () => {
    let current = freshState();
    const repository = createEntityRepository({
      read: () => current,
      commit: (next) => {
        current = next;
        return true;
      },
    });
    current = replaceSessions(repository.read(), { id: 'session-1', status: 'paused' });
    current = replaceMistake(current, { id: 'mistake-1', summary: '错因' });
    expect(repository.commit(current)).toBe(true);
    expect(repository.read().sessions.map((item) => item.id)).toEqual(['session-1']);
    expect(repository.read().mistakes.map((item) => item.id)).toEqual(['mistake-1']);
    expect(() => createEntityRepository({ read: () => current, commit: () => true, storageKey: 'other' })).toThrow();
  });
});

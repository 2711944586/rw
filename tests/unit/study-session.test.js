import { describe, expect, it } from 'vitest';
import {
  claimStudySession,
  finishStudySession,
  pauseStudySession,
  sessionCrossedMidnight,
} from '../../src/domain/study-session.js';

describe('study session', () => {
  it('pauses and finishes one sitting without opening a second session for the same task', () => {
    const started = claimStudySession(null, 'task-1', new Date('2026-10-10T01:00:00.000Z')).session;
    const paused = pauseStudySession(started, new Date('2026-10-10T01:25:00.000Z'));
    expect(paused.status).toBe('paused');
    expect(paused.accumulatedMinutes).toBe(25);
    const again = claimStudySession(paused, 'task-1');
    expect(again.created).toBe(false);
    expect(again.session.id).toBe(started.id);
    const finished = finishStudySession(paused, new Date('2026-10-10T01:25:00.000Z'));
    expect(finished.status).toBe('finished');
    expect(finished.effectiveMinutes).toBe(25);
  });

  it('notices a midnight crossing', () => {
    const session = claimStudySession(null, 'task-1', new Date(2026, 9, 10, 23, 30, 0)).session;
    expect(sessionCrossedMidnight(session, new Date(2026, 9, 11, 0, 30, 0))).toBe(true);
  });
});

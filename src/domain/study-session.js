/**
 * One study sitting. A task may be finished with or without a timer.
 * Closing the browser, crossing midnight, or a second tab cannot create
 * a second authoritative session for the same task.
 */

const ACTIVE = new Set(['running', 'paused']);

function isoNow(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return '';
}

function minutesBetween(start, end) {
  const left = Date.parse(start);
  const right = Date.parse(end);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return 0;
  return Math.round((right - left) / 60000);
}

export function createStudySession(input = {}) {
  const taskId = input.taskId;
  const startedAt = input.startedAt;
  const device = input.device || 'web';
  const start = isoNow(startedAt) || new Date().toISOString();
  return {
    id: `session-${taskId || 'free'}-${start}`,
    taskId: taskId || '',
    status: 'running',
    startedAt: start,
    pausedAt: '',
    endedAt: '',
    accumulatedMinutes: 0,
    effectiveMinutes: 0,
    result: null,
    device: device || 'web',
    updatedAt: start,
  };
}

export function pauseStudySession(session, at = new Date()) {
  if (!session || session.status !== 'running') return session;
  const pausedAt = isoNow(at);
  const extra = minutesBetween(session.startedAt, pausedAt);
  return {
    ...session,
    status: 'paused',
    pausedAt,
    accumulatedMinutes: (Number(session.accumulatedMinutes) || 0) + extra,
    updatedAt: pausedAt,
  };
}

export function resumeStudySession(session, at = new Date()) {
  if (!session || session.status !== 'paused') return session;
  const startedAt = isoNow(at);
  return {
    ...session,
    status: 'running',
    startedAt,
    pausedAt: '',
    updatedAt: startedAt,
  };
}

export function finishStudySession(session, at = new Date(), result = null) {
  if (!session || !ACTIVE.has(session.status)) return session;
  const endedAt = isoNow(at);
  const runningExtra = session.status === 'running' ? minutesBetween(session.startedAt, endedAt) : 0;
  const effectiveMinutes = (Number(session.accumulatedMinutes) || 0) + runningExtra;
  return {
    ...session,
    status: 'finished',
    endedAt,
    effectiveMinutes,
    result: result || session.result || null,
    updatedAt: endedAt,
  };
}

export function sessionCrossedMidnight(session, now = new Date()) {
  if (!session?.startedAt) return false;
  const start = new Date(session.startedAt);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(current.getTime())) return false;
  return start.toDateString() !== current.toDateString();
}

/**
 * A second tab may attach to the open session. It must not start another one.
 */
export function claimStudySession(existing, taskId, now = new Date()) {
  if (existing && existing.taskId === taskId && ACTIVE.has(existing.status)) {
    return { session: existing, created: false };
  }
  return { session: createStudySession({ taskId, startedAt: now }), created: true };
}

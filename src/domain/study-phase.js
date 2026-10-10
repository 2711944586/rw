/**
 * Calendar phase lookup. The cycle has three explicit statuses:
 * not-started, active, completed. A date after the last phase never falls
 * back to phase A.
 */

export const PHASE_STATUS = Object.freeze({
  NOT_STARTED: 'not-started',
  ACTIVE: 'active',
  COMPLETED: 'completed',
});

function localDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` === text ? text : '';
}

function sortedPhases(phases) {
  return [...(Array.isArray(phases) ? phases : [])]
    .filter((phase) => phase && localDate(phase.start) && localDate(phase.end))
    .sort((left, right) => localDate(left.start).localeCompare(localDate(right.start)));
}

/**
 * @param {string|Date} dateValue
 * @param {Array<{id:string,start:string,end:string}>} phases
 * @returns {{status:'not-started'|'active'|'completed', phase: object|null, date: string}}
 */
export function resolvePhaseStatus(dateValue, phases) {
  const list = sortedPhases(phases);
  const date = localDate(dateValue);
  if (!list.length || !date) {
    return { status: PHASE_STATUS.NOT_STARTED, phase: null, date };
  }
  if (date < localDate(list[0].start)) {
    return { status: PHASE_STATUS.NOT_STARTED, phase: list[0], date };
  }
  const active = list.find((phase) => date >= localDate(phase.start) && date <= localDate(phase.end));
  if (active) return { status: PHASE_STATUS.ACTIVE, phase: active, date };
  const last = list[list.length - 1];
  if (date > localDate(last.end)) {
    return { status: PHASE_STATUS.COMPLETED, phase: last, date };
  }
  const upcoming = list.find((phase) => date < localDate(phase.start));
  return { status: PHASE_STATUS.NOT_STARTED, phase: upcoming || last, date };
}

export function phaseHeadline(resolution) {
  if (!resolution?.phase) return '阶段未配置';
  if (resolution.status === PHASE_STATUS.NOT_STARTED) return `未开始 · 下一阶段 ${resolution.phase.id}`;
  if (resolution.status === PHASE_STATUS.COMPLETED) return `已结束 · 末阶段 ${resolution.phase.id}`;
  return `阶段 ${resolution.phase.id} · ${resolution.phase.name || ''}`.trim();
}

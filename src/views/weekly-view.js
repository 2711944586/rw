/**
 * Weekly View — lazy-loaded view module for weekly summary,
 * cumulative minutes, core ratio median, subject distribution, and retro report.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 4.3, 5.1
 */

import { computeWeeklyRetro } from '../domain/retrospective-engine.js';
import { StateManager } from '../core/state-manager.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} Event listener cleanup registry */
let cleanupFns = [];

/**
 * Get ISO date string for today.
 */
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get the start of the current week (Monday).
 */
function getWeekStart(todayStr) {
  const d = new Date(todayStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Get array of 7 date strings for the week starting at weekStart.
 */
function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Compute weekly metrics from daily records.
 */
function computeWeeklyMetrics(weekDates) {
  const records = StateManager.getState('daily_records') || {};
  const settings = StateManager.getState('settings') || {};
  const phase = settings.phase || 'foundation';

  let totalMinutes = 0;
  let breakDays = 0;
  let mathMin = 0, csMin = 0, engMin = 0, polMin = 0, projectMin = 0;
  let newMistakes = 0, fixedMistakes = 0;
  const coreRatios = [];

  for (const date of weekDates) {
    const r = records[date];
    if (!r) {
      breakDays++;
      continue;
    }
    const dayTotal = (r.mathMin || 0) + (r.csMin || 0) + (r.engMin || 0) + (r.polMin || 0) + (r.projectMin || 0);
    if (dayTotal === 0) {
      breakDays++;
      continue;
    }
    totalMinutes += dayTotal;
    mathMin += r.mathMin || 0;
    csMin += r.csMin || 0;
    engMin += r.engMin || 0;
    polMin += r.polMin || 0;
    projectMin += r.projectMin || 0;
    newMistakes += r.newMistakes || 0;
    fixedMistakes += r.fixedMistakes || 0;

    const core = (r.mathMin || 0) + (r.csMin || 0);
    const ratio = dayTotal > 0 ? core / dayTotal : 0;
    coreRatios.push(ratio);
  }

  const coreRatioMedian = coreRatios.length > 0
    ? [...coreRatios].sort((a, b) => a - b)[Math.floor(coreRatios.length / 2)]
    : 0;

  const mistakeRecoveryRate = newMistakes > 0 ? Math.min(1, fixedMistakes / newMistakes) : 1;

  const plannedMinutes = (settings.weekdayMinutes || 240) * 5 + (settings.weekendMinutes || 360) * 2;

  return {
    totalMinutes,
    breakDays,
    coreRatioMedian,
    mistakeRecoveryRate,
    plannedMinutes,
    phase,
    subjects: { mathMin, csMin, engMin, polMin, projectMin },
  };
}

/**
 * Render color signal badge.
 */
function signalBadge(signal, label) {
  const colors = { green: 'var(--green)', yellow: 'var(--amber)', red: 'var(--red)' };
  const bgColors = { green: 'var(--green-soft)', yellow: 'var(--amber-soft)', red: 'var(--red-soft)' };
  return `<span class="signal-badge" style="background:${bgColors[signal]};color:${colors[signal]};padding:4px 10px;border-radius:999px;font-size:12px;font-weight:720;">${label}: ${signal === 'green' ? '正常' : signal === 'yellow' ? '注意' : '需调整'}</span>`;
}

/**
 * Main render function.
 */
function render() {
  const today = getToday();
  const weekStart = getWeekStart(today);
  const weekDates = getWeekDates(weekStart);
  const metrics = computeWeeklyMetrics(weekDates);

  // Compute weekly retro
  const weekData = {
    totalEffectiveMinutes: metrics.totalMinutes,
    plannedMinutes: metrics.plannedMinutes,
    breakDays: metrics.breakDays,
    mistakeRecoveryRate: metrics.mistakeRecoveryRate,
    coreRatioMedian: metrics.coreRatioMedian,
    phase: metrics.phase,
  };
  const retro = computeWeeklyRetro([], weekData);

  const hours = (metrics.totalMinutes / 60).toFixed(1);
  const { subjects } = metrics;

  return `
    <section class="view weekly-view active">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>本周总结</h3>
            <p>${weekStart} ~ ${weekDates[6]}</p>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric-card">
            <span>累计时长</span>
            <strong>${hours}h</strong>
            <p>${metrics.totalMinutes} 分钟</p>
          </div>
          <div class="metric-card">
            <span>核心比中位数</span>
            <strong>${(metrics.coreRatioMedian * 100).toFixed(0)}%</strong>
            <p>数学+408占比</p>
          </div>
          <div class="metric-card">
            <span>休息天数</span>
            <strong>${metrics.breakDays}</strong>
            <p>${metrics.breakDays >= 2 ? '⚠️ 过多' : '正常'}</p>
          </div>
          <div class="metric-card">
            <span>错题回收率</span>
            <strong>${(metrics.mistakeRecoveryRate * 100).toFixed(0)}%</strong>
            <p>回炉/新增</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>学科分布</h3>
            <p>各科目累计分钟数</p>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric-card"><span>数学</span><strong>${subjects.mathMin}</strong><p>分钟</p></div>
          <div class="metric-card"><span>408</span><strong>${subjects.csMin}</strong><p>分钟</p></div>
          <div class="metric-card"><span>英语</span><strong>${subjects.engMin}</strong><p>分钟</p></div>
          <div class="metric-card"><span>政治</span><strong>${subjects.polMin}</strong><p>分钟</p></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>周复盘报告</h3>
            <p>自动信号诊断</p>
          </div>
        </div>
        <div class="review-actions" style="flex-wrap:wrap;gap:8px;display:flex;">
          ${signalBadge(retro.signals.effectiveMinutes, '有效时长')}
          ${signalBadge(retro.signals.breakDays, '休息天数')}
          ${signalBadge(retro.signals.mistakeRecovery, '错题回收')}
          ${signalBadge(retro.signals.coreRatioMedian, '核心比')}
        </div>
        <p style="margin-top:12px;color:var(--muted);font-size:13px;">
          整体信号: <strong style="color:${retro.overallSignal === 'green' ? 'var(--green)' : 'var(--red)'}">
            ${retro.overallSignal === 'green' ? '本周节奏正常' : '需要调整'}
          </strong>
        </p>
      </section>
    </section>
  `;
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Mount the weekly view into the given container.
 * @param {HTMLElement} container
 */
export function mount(container) {
  containerEl = container;
  container.innerHTML = render();
  cleanupFns = [];
}

/**
 * Unmount the weekly view, cleaning up.
 */
export function unmount() {
  for (const fn of cleanupFns) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  cleanupFns = [];
  if (containerEl) containerEl.innerHTML = '';
  containerEl = null;
}

/**
 * Retrospective View — lazy-loaded view module for daily/weekly/monthly
 * retro displays, calibration integration, and snapshot history.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import {
  computeDailyRetro,
  computeWeeklyRetro,
  computeMonthlyAudit,
} from '../domain/retrospective-engine.js';
import { calibrate } from '../domain/calibration-engine.js';
import { StateManager } from '../core/state-manager.js';
import { escapeHTML } from '../utils/html.js';
import { nonNegativeNumber, positiveNumber } from '../utils/number.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundedOrDash(value) {
  const numeric = finiteNumber(value);
  return numeric === null ? '—' : String(Math.round(numeric));
}

function boundedScore(value) {
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  return Math.min(500, Math.max(0, numeric));
}

function subjectScore(value, max) {
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  return Math.min(max, Math.max(0, numeric));
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
}

function validDateKey(value) {
  const text = safeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

function reviewIsActive(item) {
  return item && typeof item === 'object' && !item.done && !['done', 'failed'].includes(item.status);
}

function isDueReviewItem(item, today) {
  const dueDate = validDateKey(item?.nextDueAt);
  return Boolean(reviewIsActive(item) && dueDate && dueDate <= today);
}

function extractMockScoreValues(mockScores) {
  return arrayValue(mockScores).flatMap((score) => {
    const directScore = typeof score === 'object' && score !== null
      ? boundedScore(score.total ?? score.score)
      : boundedScore(score);
    if (directScore !== null) return [directScore];

    if (typeof score !== 'object' || score === null) return [];
    const parts = [
      subjectScore(score.politics, 100),
      subjectScore(score.english, 100),
      subjectScore(score.math, 150),
      subjectScore(score.cs408, 150),
    ];
    return parts.some((part) => part !== null)
      ? [parts.reduce((sum, part) => sum + (part || 0), 0)]
      : [];
  });
}

function recordMinutes(record) {
  return nonNegativeNumber(record?.mathMin)
    + nonNegativeNumber(record?.csMin)
    + nonNegativeNumber(record?.engMin)
    + nonNegativeNumber(record?.polMin)
    + nonNegativeNumber(record?.projectMin);
}

function coreMinutes(record) {
  return nonNegativeNumber(record?.mathMin) + nonNegativeNumber(record?.csMin);
}

function problemCount(record) {
  return nonNegativeNumber(record?.mathProblems) + nonNegativeNumber(record?.csProblems);
}

/**
 * Get daily retro input from current state.
 */
function getDailyRetroInput() {
  const settings = objectValue(StateManager.getState('settings'));
  const todayTasks = arrayValue(StateManager.getState('today.tasks'));
  const records = objectValue(StateManager.getState('daily_records'));
  const today = getToday();
  const rawTodayRecord = records[today];
  const todayRecord = objectValue(rawTodayRecord);
  const hasTodayRecord = rawTodayRecord && typeof rawTodayRecord === 'object' && !Array.isArray(rawTodayRecord);
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  const phase = settings.phase || 'foundation';

  // Task completion rate
  const taskCount = todayTasks.length || 1;
  const completedTasks = todayTasks.filter(t => t.completed).length;
  const taskCompletionRate = taskCount > 0 ? completedTasks / taskCount : 0;

  // Record count
  const recordCount = hasTodayRecord ? 1 : 0;

  // Review due processed rate
  const dueItems = reviewItems.filter(item => isDueReviewItem(item, today));
  const processedItems = dueItems.filter(item => item.lastSubmittedDate === today);
  const reviewDueProcessedRate = dueItems.length > 0 ? processedItems.length / dueItems.length : 1;

  // Core ratio
  let coreRatio = 0.65;
  if (hasTodayRecord) {
    const total = recordMinutes(todayRecord);
    const core = coreMinutes(todayRecord);
    coreRatio = total > 0 ? core / total : 0;
  }

  return { taskCompletionRate, recordCount, taskCount, reviewDueProcessedRate, coreRatio, phase };
}

/**
 * Render signal indicator.
 */
function signalDot(signal, label) {
  const colors = { green: 'var(--green)', yellow: 'var(--amber)', red: 'var(--red)' };
  const labels = { green: '正常', yellow: '注意', red: '需调整' };
  const safeSignal = colors[signal] ? signal : 'red';
  return `
    <div class="metric-card" style="border-left:3px solid ${colors[safeSignal]};">
      <span>${escapeHTML(label)}</span>
      <strong style="color:${colors[safeSignal]};">${labels[safeSignal]}</strong>
    </div>
  `;
}

/**
 * Render daily retro section.
 */
function renderDailyRetro() {
  const input = getDailyRetroInput();
  const result = computeDailyRetro(input);

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>今日复盘</h3><p>4维信号诊断</p></div></div>
      <div class="metric-grid">
        ${signalDot(result.taskSignal, '任务完成率')}
        ${signalDot(result.reviewSignal, '复习处理率')}
        ${signalDot(result.coreRatioSignal, '核心比')}
        ${signalDot(result.recordSignal, '记录完整性')}
      </div>
    </section>
  `;
}

/**
 * Render weekly retro section.
 */
function renderWeeklyRetro() {
  const records = objectValue(StateManager.getState('daily_records'));
  const settings = objectValue(StateManager.getState('settings'));
  const phase = settings.phase || 'foundation';
  const today = getToday();

  // Get this week's dates
  const d = new Date(today + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);

  let totalMinutes = 0, breakDays = 0, newMistakes = 0, fixedMistakes = 0;
  const coreRatios = [];

  for (let i = 0; i < 7; i++) {
    const dd = new Date(d);
    dd.setUTCDate(dd.getUTCDate() + i);
    const dateStr = dd.toISOString().slice(0, 10);
    const rawRecord = records[dateStr];
    const r = objectValue(rawRecord);
    if (!rawRecord || Array.isArray(rawRecord) || typeof rawRecord !== 'object') { breakDays++; continue; }
    const dayTotal = recordMinutes(r);
    if (dayTotal === 0) { breakDays++; continue; }
    totalMinutes += dayTotal;
    newMistakes += nonNegativeNumber(r.newMistakes);
    fixedMistakes += nonNegativeNumber(r.fixedMistakes);
    const core = coreMinutes(r);
    coreRatios.push(dayTotal > 0 ? core / dayTotal : 0);
  }

  const coreRatioMedian = coreRatios.length > 0
    ? [...coreRatios].sort((a, b) => a - b)[Math.floor(coreRatios.length / 2)]
    : 0;
  const mistakeRecoveryRate = newMistakes > 0 ? Math.min(1, fixedMistakes / newMistakes) : 1;
  const plannedMinutes = positiveNumber(settings.weekdayMinutes, 240) * 5
    + positiveNumber(settings.weekendMinutes, 360) * 2;

  const weekData = { totalEffectiveMinutes: totalMinutes, plannedMinutes, breakDays, mistakeRecoveryRate, coreRatioMedian, phase };
  const result = computeWeeklyRetro([], weekData);

  // Only show if it's the last day of the week (Sunday)
  const isLastDay = new Date().getDay() === 0;
  const autoLabel = isLastDay ? '（自动生成）' : '';

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>周复盘 ${autoLabel}</h3><p>整体信号判定</p></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${Object.entries(result.signals).map(([key, signal]) => {
          const labels = { effectiveMinutes: '有效时长', breakDays: '休息日', mistakeRecovery: '错题回收', coreRatioMedian: '核心比' };
          return signalDot(signal, labels[key] || key);
        }).join('')}
      </div>
      <p style="font-size:13px;color:${result.overallSignal === 'green' ? 'var(--green)' : 'var(--red)'};">
        整体: ${result.overallSignal === 'green' ? '本周节奏正常' : '需要调整下周任务'}
      </p>
    </section>
  `;
}

/**
 * Render monthly audit section.
 */
function renderMonthlyAudit() {
  const records = objectValue(StateManager.getState('daily_records'));
  const settings = objectValue(StateManager.getState('settings'));

  // Compute current month actual minutes
  const today = getToday();
  const monthPrefix = today.slice(0, 7);
  let actualMinutes = 0;
  for (const [date, r] of Object.entries(records)) {
    const dateKey = validDateKey(date);
    if (dateKey && dateKey.startsWith(monthPrefix)) {
      actualMinutes += recordMinutes(r);
    }
  }

  const dayOfMonth = new Date().getDate();
  const dailyTarget = positiveNumber(settings.weekdayMinutes, 240);
  const cumulativePlannedMinutes = dailyTarget * dayOfMonth;

  const audit = computeMonthlyAudit({ actualMinutes }, { cumulativePlannedMinutes });

  const recommendationLabels = {
    on_track: '✓ 进度正常',
    shrink_to_core: '⚠ 建议收缩至核心科目',
    tier_fallback: '⚠ 触发志愿梯度重评估',
  };
  const recommendation = recommendationLabels[audit.recommendation] || safeText(audit.recommendation);

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>月度审计</h3><p>实际 vs 计划进度</p></div></div>
      <div class="metric-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));">
        <div class="metric-card"><span>实际时长</span><strong>${(actualMinutes / 60).toFixed(1)}h</strong></div>
        <div class="metric-card"><span>计划时长</span><strong>${(cumulativePlannedMinutes / 60).toFixed(1)}h</strong></div>
        <div class="metric-card"><span>完成比</span><strong>${(audit.ratio * 100).toFixed(0)}%</strong></div>
      </div>
      <p style="margin-top:12px;font-size:13px;color:${audit.recommendation === 'on_track' ? 'var(--green)' : 'var(--red)'};">
        ${escapeHTML(recommendation)}
      </p>
      ${audit.shouldTierFallback ? `
        <div id="retro-tier-fallback-trigger" style="margin-top:12px;">
          <button type="button" class="ghost-button" id="retro-show-tier-modal" aria-label="查看志愿梯度详情">查看梯度建议</button>
        </div>
      ` : ''}
    </section>
  `;
}

/**
 * Render snapshot history (read-only).
 */
function renderSnapshotHistory() {
  const snapshots = arrayValue(StateManager.getState('calibration_snapshots'));
  const recentSnapshots = snapshots.slice(-5).reverse();

  if (recentSnapshots.length === 0) {
    return `
      <section class="panel" style="margin-bottom:14px;">
        <div class="panel-head"><div><h3>校准快照</h3><p>历史记录（只读）</p></div></div>
        <p style="color:var(--muted);font-size:13px;">暂无快照记录</p>
      </section>
    `;
  }

  const rows = recentSnapshots.map((snapshot) => {
    const s = objectValue(snapshot);
    const result = objectValue(s.result_payload);
    const checkpointDate = safeText(s.checkpoint_date, '未知日期');
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:#fbfcfa;">
        <span style="font-size:12px;color:var(--muted);">${escapeHTML(checkpointDate)}</span>
        <strong style="font-size:14px;color:var(--ink);">${roundedOrDash(result.predictedScore)}分</strong>
        <span style="font-size:11px;color:var(--muted);">[${roundedOrDash(result.lowerBound)}, ${roundedOrDash(result.upperBound)}]</span>
      </div>
    `;
  }).join('');

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>校准快照</h3><p>历史记录（只读）</p></div></div>
      <div style="display:grid;gap:8px;">${rows}</div>
    </section>
  `;
}

/**
 * Render tier fallback modal.
 */
function renderTierModal() {
  return `
    <div id="retro-tier-modal" class="tier-modal" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.4);place-items:center;" role="dialog" aria-modal="true" aria-label="志愿梯度建议">
      <div style="background:var(--surface);border-radius:var(--radius);padding:24px;max-width:480px;width:90%;margin:auto;box-shadow:var(--shadow);">
        <h3 style="margin:0 0 12px;color:var(--ink);">志愿梯度建议</h3>
        <div id="retro-tier-content" style="font-size:13px;color:var(--text);line-height:1.6;"></div>
        <button type="button" class="primary-button" id="retro-close-tier-modal" aria-label="关闭" style="margin-top:16px;">关闭</button>
      </div>
    </div>
  `;
}

function render() {
  return `
    <section class="view retrospective-view active">
      ${renderDailyRetro()}
      ${renderWeeklyRetro()}
      ${renderMonthlyAudit()}
      ${renderSnapshotHistory()}
      ${renderTierModal()}
    </section>
  `;
}

/**
 * Handle tier modal interactions.
 */
function onClick(e) {
  if (e.target.id === 'retro-show-tier-modal' || e.target.closest('#retro-show-tier-modal')) {
    showTierModal();
  }
  if (e.target.id === 'retro-close-tier-modal' || e.target.closest('#retro-close-tier-modal')) {
    closeTierModal();
  }
  // Close modal on backdrop click
  if (e.target.id === 'retro-tier-modal') {
    closeTierModal();
  }
}

function showTierModal() {
  const modal = containerEl.querySelector('#retro-tier-modal');
  const content = containerEl.querySelector('#retro-tier-content');
  if (!modal || !content) return;

  // Run calibration to get tier fallback data
  const mockScores = arrayValue(StateManager.getState('mock_scores'));
  const topicProgress = arrayValue(StateManager.getState('topic_progress'));
  const records = objectValue(StateManager.getState('daily_records'));
  const today = getToday();

  const scores = extractMockScoreValues(mockScores);
  const progressRows = topicProgress.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const topicCoverage = progressRows.length > 0
    ? progressRows.filter(t => t.mastery_status === 'mastered').length / progressRows.length
    : 0.3;

  // Compute recent 30 day metrics
  let recent30Minutes = 0, problemsCorrect = 0, problemsTotal = 0;
  const thirtyDaysAgo = new Date(today + 'T00:00:00Z');
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

  for (const [date, r] of Object.entries(records)) {
    const dateKey = validDateKey(date);
    if (dateKey && dateKey >= cutoff) {
      const problems = problemCount(r);
      recent30Minutes += recordMinutes(r);
      problemsTotal += problems;
      problemsCorrect += problems * 0.7; // estimate
    }
  }

  const accuracy = problemsTotal > 0 ? Math.min(1, problemsCorrect / problemsTotal) : 0.6;

  const result = calibrate({
    mockScores: scores,
    topicCoverage,
    recent30DayAccuracy: accuracy,
    recent30DayMinutes: recent30Minutes,
    currentDate: today,
  });

  if (result.tierFallback) {
    content.innerHTML = result.tierFallback.map((tier) => {
      const t = objectValue(tier);
      return `
      <div style="padding:10px;border:1px solid var(--line);border-radius:var(--radius);margin-bottom:8px;">
        <strong style="color:var(--ink);">${escapeHTML(safeText(t.tier))}</strong>
        <p style="margin:4px 0 0;font-size:12px;color:var(--muted);">${escapeHTML(safeText(t.description))}</p>
        <span style="font-size:11px;color:var(--blue);">概率: ${((finiteNumber(t.probabilityRange?.[0]) || 0) * 100).toFixed(0)}% ~ ${((finiteNumber(t.probabilityRange?.[1]) || 0) * 100).toFixed(0)}%</span>
      </div>
    `;
    }).join('');
  } else {
    content.innerHTML = '<p>当前监测值在内部目标线上方，暂不需要调整院校梯度。</p>';
  }

  modal.style.display = 'grid';
}

function closeTierModal() {
  const modal = containerEl.querySelector('#retro-tier-modal');
  if (modal) modal.style.display = 'none';
}

// ─── Public API ───────────────────────────────────────────────

export function mount(container) {
  containerEl = container;
  container.innerHTML = render();
  container.addEventListener('click', onClick);
  cleanupFns = [() => container.removeEventListener('click', onClick)];
}

export function unmount() {
  for (const fn of cleanupFns) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  cleanupFns = [];
  if (containerEl) containerEl.innerHTML = '';
  containerEl = null;
}

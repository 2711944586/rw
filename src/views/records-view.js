/**
 * Records View — lazy-loaded view module for daily_records history
 * with filtering by date range and subject, statistics, and CSV export.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 3.6
 */

import { StateManager } from '../core/state-manager.js';
import { escapeAttr, escapeHTML } from '../utils/html.js';
import { nonNegativeNumber } from '../utils/number.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

/** Current filter state */
let filters = { startDate: '', endDate: '', subject: '' };

const SUBJECT_FILTERS = new Set(['', 'math', 'cs', 'eng', 'pol', 'project']);

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function minutes(value) {
  return nonNegativeNumber(value);
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
}

function safeErrorMessage(error, fallback = '未知错误') {
  const direct = safeText(error);
  if (direct) return direct;
  const source = error instanceof Error || (error && typeof error === 'object' && !Array.isArray(error)) ? error : null;
  if (!source) return fallback;
  return safeText(source.message) || safeText(source.details) || safeText(source.hint) || safeText(source.code) || fallback;
}

function safeDateFilter(value) {
  const text = safeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

function safeSubjectFilter(value) {
  const text = safeText(value);
  return SUBJECT_FILTERS.has(text) ? text : '';
}

/**
 * Get filtered and sorted records.
 */
function getFilteredRecords() {
  const records = objectValue(StateManager.getState('daily_records'));
  let entries = Object.entries(records).map(([date, r]) => {
    const dateText = safeText(date);
    return {
      ...objectValue(r),
      date: dateText,
      dateKey: safeDateFilter(dateText),
    };
  });

  if (filters.startDate) {
    entries = entries.filter(r => r.dateKey && r.dateKey >= filters.startDate);
  }
  if (filters.endDate) {
    entries = entries.filter(r => r.dateKey && r.dateKey <= filters.endDate);
  }
  if (filters.subject) {
    entries = entries.filter(r => {
      const key = filters.subject + 'Min';
      return minutes(r[key]) > 0;
    });
  }

  return entries.sort((a, b) => {
    if (a.dateKey && b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    if (a.dateKey) return -1;
    if (b.dateKey) return 1;
    return safeText(b.date).localeCompare(safeText(a.date));
  });
}

/**
 * Compute record statistics.
 */
function computeStats(entries) {
  let totalMinutes = 0;
  let totalDays = entries.length;
  const monthlyTotals = Object.create(null);

  for (const r of entries) {
    const dayTotal = minutes(r.mathMin) + minutes(r.csMin) + minutes(r.engMin) + minutes(r.polMin) + minutes(r.projectMin);
    totalMinutes += dayTotal;
    if (r.dateKey) {
      const month = r.dateKey.slice(0, 7);
      monthlyTotals[month] = (monthlyTotals[month] || 0) + dayTotal;
    }
  }

  return { totalMinutes, totalDays, monthlyTotals };
}

/**
 * Generate CSV content from records.
 */
function generateCSV(entries) {
  const headers = ['日期', '数学', '408', '英语', '政治', '项目', '数学题', '408题', '阅读', '新错题', '回炉错题'];
  const rows = entries.map(r => [
    r.date,
    minutes(r.mathMin), minutes(r.csMin), minutes(r.engMin), minutes(r.polMin), minutes(r.projectMin),
    minutes(r.mathProblems), minutes(r.csProblems), minutes(r.readingCount),
    minutes(r.newMistakes), minutes(r.fixedMistakes),
  ].map(csvCell).join(','));
  return [headers.map(csvCell).join(','), ...rows].join('\n');
}

function csvCell(value) {
  const text = safeText(value);
  const safeCellText = /^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeCellText.replaceAll('"', '""')}"`;
}

/**
 * Render the filter bar.
 */
function renderFilters() {
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-head">
        <div><h3>筛选</h3></div>
        <button type="button" class="primary-button" id="rv-export-csv" aria-label="导出CSV">导出 CSV</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">开始日期
          <input type="date" class="date-input" id="rv-start-date" value="${escapeAttr(filters.startDate)}" />
        </label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">结束日期
          <input type="date" class="date-input" id="rv-end-date" value="${escapeAttr(filters.endDate)}" />
        </label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">学科
          <select id="rv-subject-filter" style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;background:#fff;">
            <option value="">全部</option>
            <option value="math" ${filters.subject === 'math' ? 'selected' : ''}>数学</option>
            <option value="cs" ${filters.subject === 'cs' ? 'selected' : ''}>408</option>
            <option value="eng" ${filters.subject === 'eng' ? 'selected' : ''}>英语</option>
            <option value="pol" ${filters.subject === 'pol' ? 'selected' : ''}>政治</option>
            <option value="project" ${filters.subject === 'project' ? 'selected' : ''}>项目</option>
          </select>
        </label>
        <button type="button" class="ghost-button" id="rv-apply-filter" aria-label="应用筛选">应用</button>
      </div>
      <div id="rv-export-feedback" style="margin-top:8px;font-size:12px;color:var(--muted);display:none;" aria-live="polite"></div>
    </div>
  `;
}

/**
 * Render statistics panel.
 */
function renderStats(stats) {
  const hours = (stats.totalMinutes / 60).toFixed(1);
  const months = Object.entries(stats.monthlyTotals).sort((a, b) => b[0].localeCompare(a[0]));

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>统计</h3></div></div>
      <div class="metric-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));">
        <div class="metric-card"><span>累计时长</span><strong>${hours}h</strong></div>
        <div class="metric-card"><span>记录天数</span><strong>${stats.totalDays}</strong></div>
        <div class="metric-card"><span>日均</span><strong>${stats.totalDays > 0 ? Math.round(stats.totalMinutes / stats.totalDays) : 0}min</strong></div>
      </div>
      ${months.length > 0 ? `
        <div style="margin-top:12px;">
          <p style="font-size:12px;color:var(--muted);margin:0 0 8px;">月度分布</p>
          ${months.map(([m, min]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>${escapeHTML(m)}</span><strong>${(min / 60).toFixed(1)}h</strong></div>`).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

/**
 * Render records table.
 */
function renderRecordsTable(entries) {
  if (entries.length === 0) {
    return `<section class="panel"><p style="color:var(--muted);">暂无记录</p></section>`;
  }

  const rows = entries.slice(0, 50).map(r => {
    const mathMin = minutes(r.mathMin);
    const csMin = minutes(r.csMin);
    const engMin = minutes(r.engMin);
    const polMin = minutes(r.polMin);
    const projectMin = minutes(r.projectMin);
    const total = mathMin + csMin + engMin + polMin + projectMin;
    return `
      <div class="record-row" style="display:grid;grid-template-columns:90px repeat(5,1fr) 60px;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:#fbfcfa;font-size:12px;">
        <span style="font-weight:720;color:var(--ink);">${escapeHTML(safeText(r.date))}</span>
        <span>数${mathMin}</span>
        <span>408:${csMin}</span>
        <span>英${engMin}</span>
        <span>政${polMin}</span>
        <span>项${projectMin}</span>
        <strong style="color:var(--green);">${total}m</strong>
      </div>
    `;
  }).join('');

  return `
    <section class="panel">
      <div class="panel-head"><div><h3>记录列表</h3><p>最近 ${Math.min(entries.length, 50)} 条</p></div></div>
      <div class="records-table">${rows}</div>
    </section>
  `;
}

function render() {
  const entries = getFilteredRecords();
  const stats = computeStats(entries);

  return `
    <section class="view records-view active">
      ${renderFilters()}
      ${renderStats(stats)}
      ${renderRecordsTable(entries)}
    </section>
  `;
}

function onApplyFilter() {
  const startEl = containerEl.querySelector('#rv-start-date');
  const endEl = containerEl.querySelector('#rv-end-date');
  const subjectEl = containerEl.querySelector('#rv-subject-filter');
  filters.startDate = safeDateFilter(startEl?.value);
  filters.endDate = safeDateFilter(endEl?.value);
  filters.subject = safeSubjectFilter(subjectEl?.value);
  containerEl.innerHTML = render();
}

function onExportCSV() {
  const entries = getFilteredRecords();
  const feedback = containerEl.querySelector('#rv-export-feedback');
  if (feedback) {
    feedback.style.display = 'block';
    feedback.textContent = '正在导出...';
  }

  if (!entries.length) {
    if (feedback) feedback.textContent = '暂无可导出记录';
    return false;
  }

  try {
    const csv = generateCSV(entries);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-records-${getToday()}.csv`;
    try {
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
    if (feedback) feedback.textContent = 'CSV 已导出';
    return true;
  } catch (err) {
    if (feedback) feedback.textContent = 'CSV 导出失败: ' + safeErrorMessage(err);
    return false;
  }
}

function onClick(e) {
  if (e.target.id === 'rv-apply-filter' || e.target.closest('#rv-apply-filter')) {
    onApplyFilter();
  }
  if (e.target.id === 'rv-export-csv' || e.target.closest('#rv-export-csv')) {
    onExportCSV();
  }
}

// ─── Public API ───────────────────────────────────────────────

export function mount(container) {
  containerEl = container;
  filters = { startDate: '', endDate: '', subject: '' };
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

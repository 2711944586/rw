/**
 * Showcase View — lazy-loaded view module for project showcase pipeline.
 * Public demo section with desensitized data and private "复试材料" section
 * with 4-column layout for interview preparation.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import { desensitizeData, validateShowcaseItem } from '../domain/project-showcase.js';
import { StateManager } from '../core/state-manager.js';
import { escapeAttr, escapeHTML, safeExternalUrl } from '../utils/html.js';
import { nonNegativeNumber } from '../utils/number.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

/** @type {{status: 'success'|'error', message: string}|null} */
let showcaseFeedback = null;

/** Categories for the 4-column layout */
const CATEGORIES = [
  { key: 'research_interest', label: '研究兴趣' },
  { key: 'exam_evidence', label: '考试凭证' },
  { key: 'engineering_points', label: '工程亮点' },
  { key: 'paper_notes', label: '论文笔记' },
];

/** Tech stack for display */
const TECH_STACK = [
  { name: 'Vite 7', url: 'https://vitejs.dev/' },
  { name: 'Supabase', url: 'https://supabase.com/docs' },
  { name: 'fast-check', url: 'https://fast-check.dev/' },
  { name: 'Vitest', url: 'https://vitest.dev/' },
  { name: 'Vercel', url: 'https://vercel.com/docs' },
];

/**
 * Get showcase items from state.
 */
function getShowcaseItems() {
  return arrayValue(StateManager.getState('showcase_items')).filter(isPlainObject);
}

function safeNumber(value) {
  return nonNegativeNumber(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectValue(value) {
  return isPlainObject(value) ? value : {};
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

function validCategory(value) {
  const text = safeText(value);
  return CATEGORIES.some((category) => category.key === text) ? text : CATEGORIES[0].key;
}

function renderFormFeedback() {
  if (!showcaseFeedback) {
    return '<span id="sc-form-feedback" class="showcase-form-feedback" role="status" aria-live="polite" hidden></span>';
  }

  const role = showcaseFeedback.status === 'error' ? 'alert' : 'status';
  const live = showcaseFeedback.status === 'error' ? 'assertive' : 'polite';
  return `
    <span id="sc-form-feedback" class="showcase-form-feedback ${showcaseFeedback.status}" role="${role}" aria-live="${live}">
      ${escapeHTML(showcaseFeedback.message)}
    </span>
  `;
}

/**
 * Generate mock desensitized overview data.
 */
function getDesensitizedOverview() {
  const records = objectValue(StateManager.getState('daily_records'));
  const userData = {
    daily_records: records,
    topic_progress: arrayValue(StateManager.getState('topic_progress')).filter(isPlainObject),
  };
  const safe = desensitizeData(userData);

  // Compute aggregate stats from safe data
  let totalMinutes = 0;
  let dayCount = 0;
  const dailyRecords = objectValue(safe.daily_records);
  for (const rawRecord of Object.values(dailyRecords)) {
    if (!isPlainObject(rawRecord)) continue;
    const r = objectValue(rawRecord);
    totalMinutes += safeNumber(r.mathMin) + safeNumber(r.csMin) + safeNumber(r.engMin) + safeNumber(r.polMin) + safeNumber(r.projectMin);
    dayCount++;
  }

  const hours = (totalMinutes / 60).toFixed(0);
  const progressRows = arrayValue(safe.topic_progress).filter(isPlainObject);
  const coverage = progressRows.length > 0
    ? ((progressRows.filter(t => t.mastery_status === 'mastered').length / progressRows.length) * 100).toFixed(0)
    : '—';

  // Mock distribution
  const distribution = {
    math: 35,
    cs: 35,
    eng: 15,
    pol: 10,
    project: 5,
  };

  return { hours, dayCount, coverage, distribution };
}

/**
 * Render the public demo section.
 */
function renderPublicDemo() {
  const overview = getDesensitizedOverview();
  const lastRefresh = new Date().toLocaleString('zh-CN');

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head">
        <div>
          <h3>公开展示（脱敏）</h3>
          <p>面试可分享的数据概览</p>
        </div>
        <span style="font-size:11px;color:var(--muted);">刷新: ${lastRefresh}</span>
      </div>
      <div class="metric-grid">
        <div class="metric-card"><span>累计学时</span><strong>${overview.hours}h</strong></div>
        <div class="metric-card"><span>覆盖率</span><strong>${overview.coverage}%</strong></div>
        <div class="metric-card"><span>连续天数</span><strong>${overview.dayCount}</strong></div>
        <div class="metric-card">
          <span>学科分布</span>
          <div style="font-size:11px;line-height:1.6;color:var(--muted);">
            数学 ${overview.distribution.math}% · 408 ${overview.distribution.cs}%<br/>
            英语 ${overview.distribution.eng}% · 政治 ${overview.distribution.pol}%
          </div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Render the private 4-column showcase section.
 */
function renderPrivateShowcase() {
  const items = getShowcaseItems();

  const columns = CATEGORIES.map(cat => {
    const catItems = items.filter(i => safeText(i.category) === cat.key && !i.deleted_at);
    const itemRows = catItems.map(item => {
      const artifactType = safeText(item.artifact_type);
      const itemDate = safeText(item.item_date);
      const description = safeText(item.description);
      const outputHref = safeExternalUrl(safeText(item.output_link));
      return `
        <div style="padding:8px 10px;border:1px solid var(--line);border-radius:var(--radius-sm);background:#fff;font-size:12px;">
          <strong style="color:var(--ink);display:block;">${escapeHTML(artifactType)}</strong>
          ${itemDate ? `<span style="color:var(--muted);">${escapeHTML(itemDate)}</span>` : ''}
          ${outputHref !== '#' ? `<a href="${escapeAttr(outputHref)}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:11px;margin-top:4px;">查看链接</a>` : ''}
          ${description ? `<p style="margin:4px 0 0;color:var(--text);line-height:1.4;">${escapeHTML(description)}</p>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div>
        <h4 style="margin:0 0 10px;font-size:14px;color:var(--ink);font-weight:720;">${escapeHTML(cat.label)}</h4>
        <div style="display:grid;gap:8px;">
          ${itemRows || '<p style="color:var(--muted);font-size:12px;">暂无</p>'}
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>复试材料</h3><p>4栏布局: 研究/凭证/工程/论文</p></div></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;">
        ${columns}
      </div>
    </section>
  `;
}

/**
 * Render item submission form.
 */
function renderSubmitForm() {
  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>添加材料</h3><p>至少填写 2 个字段</p></div></div>
      <form id="sc-submit-form" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">分类
          <select id="sc-category" required style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;background:#fff;">
            ${CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}
          </select>
        </label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">产出类型
          <input type="text" id="sc-artifact-type" placeholder="例: 算法实现" style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        </label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">日期
          <input type="date" id="sc-item-date" style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        </label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);">输出链接
          <input type="url" id="sc-output-link" placeholder="https://..." pattern="https?://.*" style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        </label>
        <label style="display:grid;gap:4px;font-size:12px;color:var(--muted);grid-column:span 2;">描述
          <input type="text" id="sc-description" placeholder="简要描述" style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        </label>
        <div style="grid-column:span 2;display:flex;gap:10px;align-items:center;">
          <button type="submit" class="primary-button" aria-label="提交材料">提交</button>
          ${renderFormFeedback()}
        </div>
      </form>
    </section>
  `;
}

/**
 * Render tech stack section.
 */
function renderTechStack() {
  const links = TECH_STACK.map(t =>
    `<a href="${escapeAttr(safeExternalUrl(t.url))}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:var(--radius);background:#fbfcfa;color:var(--blue);font-size:13px;font-weight:720;text-decoration:none;">${escapeHTML(t.name)}</a>`
  ).join('');

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>技术栈</h3><p>项目使用的核心技术</p></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">${links}</div>
    </section>
  `;
}

function render() {
  return `
    <section class="view showcase-view active">
      ${renderPublicDemo()}
      ${renderPrivateShowcase()}
      ${renderSubmitForm()}
      ${renderTechStack()}
    </section>
  `;
}

/**
 * Handle form submission with validation.
 */
function onFormSubmit(e) {
  if (e.target.id !== 'sc-submit-form') return;
  e.preventDefault();

  const category = validCategory(containerEl.querySelector('#sc-category')?.value);
  const artifactType = containerEl.querySelector('#sc-artifact-type')?.value?.trim() || '';
  const rawItemDate = containerEl.querySelector('#sc-item-date')?.value || '';
  const itemDate = validDateKey(rawItemDate);
  const rawOutputLink = containerEl.querySelector('#sc-output-link')?.value?.trim() || '';
  const outputLink = rawOutputLink ? safeExternalUrl(rawOutputLink) : '';
  const description = containerEl.querySelector('#sc-description')?.value?.trim() || '';

  const item = { artifact_type: artifactType, item_date: itemDate, output_link: outputLink };
  const dateErrors = rawItemDate && !itemDate ? ['item_date must be a valid YYYY-MM-DD date.'] : [];
  const validation = validateShowcaseItem(item);
  const errors = [...dateErrors, ...validation.errors];

  if (errors.length > 0) {
    showcaseFeedback = { status: 'error', message: errors.join('; ') };
    const feedback = containerEl.querySelector('#sc-form-feedback');
    if (feedback) {
      feedback.hidden = false;
      feedback.className = 'showcase-form-feedback error';
      feedback.setAttribute('role', 'alert');
      feedback.setAttribute('aria-live', 'assertive');
      feedback.textContent = showcaseFeedback.message;
    }
    return;
  }

  // Save item
  const items = getShowcaseItems();
  const nextItems = [...items, {
    id: `sc_${Date.now()}`,
    category,
    artifact_type: artifactType,
    item_date: itemDate,
    output_link: outputLink,
    description,
    updated_at: new Date().toISOString(),
  }];
  const saved = StateManager.setState('showcase_items', nextItems);
  showcaseFeedback = saved
    ? { status: 'success', message: '材料已保存，等待同步。' }
    : { status: 'error', message: '材料已保留在当前页面，本机缓存写入失败，请立即导出备份。' };

  // Re-render
  containerEl.innerHTML = render();
}

function onSubmit(e) {
  onFormSubmit(e);
}

// ─── Public API ───────────────────────────────────────────────

export function mount(container) {
  containerEl = container;
  showcaseFeedback = null;
  container.innerHTML = render();
  container.addEventListener('submit', onSubmit);
  cleanupFns = [() => container.removeEventListener('submit', onSubmit)];
}

export function unmount() {
  for (const fn of cleanupFns) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  cleanupFns = [];
  if (containerEl) containerEl.innerHTML = '';
  containerEl = null;
  showcaseFeedback = null;
}

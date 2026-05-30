/**
 * Settings View — lazy-loaded view module for user preferences.
 * Density mode, retro time, export, sync status, custom task templates.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 5.1, 5.2, 8.4, 8.7
 */

import { StateManager } from '../core/state-manager.js';
import { EventBus, EVENTS } from '../core/event-bus.js';
import { exportAllData } from '../infrastructure/sync-service.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

/**
 * Get current density mode.
 */
function getDensityMode() {
  return StateManager.getState('profile.density_mode') || 'balanced';
}

/**
 * Get retro time.
 */
function getRetroTime() {
  return StateManager.getState('profile.retro_time') || '22:00';
}

/**
 * Get custom task templates.
 */
function getTemplates() {
  return StateManager.getState('settings.custom_templates') || [];
}

/**
 * Render density mode selector.
 */
function renderDensitySection() {
  const current = getDensityMode();
  const modes = [
    { value: 'focus', label: '专注' },
    { value: 'balanced', label: '平衡' },
    { value: 'detail', label: '详尽' },
  ];

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>显示密度</h3><p>控制界面信息量，立即生效</p></div></div>
      <div class="density-toggle" role="group" aria-label="显示密度选择">
        ${modes.map(m => `
          <button type="button" class="density-btn ${m.value === current ? 'active' : ''}"
            data-density="${m.value}" aria-label="密度模式: ${m.label}">${m.label}</button>
        `).join('')}
      </div>
    </section>
  `;
}

/**
 * Render retro time configuration.
 */
function renderRetroTimeSection() {
  const time = getRetroTime();
  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>复盘提醒时间</h3><p>每日自动触发复盘的时间</p></div></div>
      <label style="display:flex;gap:10px;align-items:center;">
        <input type="time" id="sv-retro-time" value="${time}"
          style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        <button type="button" class="ghost-button" id="sv-save-retro-time" aria-label="保存复盘时间">保存</button>
      </label>
    </section>
  `;
}

/**
 * Render export and sync section.
 */
function renderExportSection() {
  const lastSynced = StateManager.getState('profile.last_synced_at');
  const syncText = lastSynced
    ? `上次同步: ${new Date(lastSynced).toLocaleString('zh-CN')}`
    : '尚未同步';

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>数据管理</h3><p>导出及同步状态</p></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="primary-button" id="sv-export-data" aria-label="导出全部数据">导出全部数据</button>
        <span style="font-size:12px;color:var(--muted);">${syncText}</span>
      </div>
      <div id="sv-export-feedback" style="margin-top:8px;font-size:12px;color:var(--muted);display:none;" aria-live="polite"></div>
    </section>
  `;
}

/**
 * Render custom task templates CRUD.
 */
function renderTemplatesSection() {
  const templates = getTemplates();
  const rows = templates.map((t, i) => `
    <div class="custom-task-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:#fbfcfa;">
      <div>
        <strong style="font-size:13px;color:var(--ink);">${escapeHTML(t.name || '')}</strong>
        <span style="display:block;font-size:11px;color:var(--muted);">${escapeHTML(t.subject || '')} · ${t.estimatedMinutes || 0}分钟</span>
      </div>
      <button type="button" class="ghost-button template-delete-btn" data-index="${i}" aria-label="删除模板: ${escapeHTML(t.name || '')}">删除</button>
    </div>
  `).join('');

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>自定义任务模板</h3><p>快速创建常用任务</p></div></div>
      <div class="custom-task-list" style="margin-bottom:12px;">${rows || '<p style="color:var(--muted);font-size:13px;">暂无模板</p>'}</div>
      <form id="sv-template-form" class="custom-task-form" style="grid-template-columns:1fr 1fr auto;gap:8px;">
        <input type="text" id="sv-tpl-name" placeholder="模板名称" required style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        <input type="text" id="sv-tpl-subject" placeholder="学科 (math/cs/eng/pol)" style="min-height:38px;border:1px solid var(--line);border-radius:var(--radius);padding:0 10px;" />
        <button type="submit" class="primary-button" aria-label="添加模板">添加</button>
      </form>
    </section>
  `;
}

function render() {
  return `
    <section class="view settings-view active">
      ${renderDensitySection()}
      ${renderRetroTimeSection()}
      ${renderExportSection()}
      ${renderTemplatesSection()}
    </section>
  `;
}

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Handle density mode selection with immediate persistence.
 */
function onDensityClick(e) {
  const btn = e.target.closest('.density-btn');
  if (!btn) return;
  const mode = btn.dataset.density;
  if (!mode) return;

  StateManager.setState('profile.density_mode', mode);
  // Update document attribute for CSS
  document.documentElement.setAttribute('data-density', mode);

  // Update active button state
  containerEl.querySelectorAll('.density-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/**
 * Handle retro time save.
 */
function onSaveRetroTime() {
  const input = containerEl.querySelector('#sv-retro-time');
  if (input) {
    StateManager.setState('profile.retro_time', input.value);
  }
}

/**
 * Handle export button.
 */
async function onExport() {
  const feedback = containerEl.querySelector('#sv-export-feedback');
  if (feedback) {
    feedback.textContent = '正在导出...';
    feedback.style.display = 'block';
  }

  try {
    const result = await exportAllData();
    if (result && result.success && result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pku-swm-420-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (feedback) feedback.textContent = '✓ 导出完成';
    } else {
      // Fallback: export local state
      const state = StateManager.getState();
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pku-swm-420-local-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (feedback) feedback.textContent = '✓ 本地数据已导出';
    }
  } catch (err) {
    if (feedback) feedback.textContent = '导出失败: ' + (err.message || '未知错误');
  }
}

/**
 * Handle template form submission.
 */
function onTemplateSubmit(e) {
  e.preventDefault();
  const nameInput = containerEl.querySelector('#sv-tpl-name');
  const subjectInput = containerEl.querySelector('#sv-tpl-subject');
  const name = nameInput?.value?.trim();
  if (!name) return;

  const templates = getTemplates();
  templates.push({
    name,
    subject: subjectInput?.value?.trim() || '',
    estimatedMinutes: 30,
    createdAt: new Date().toISOString(),
  });
  StateManager.setState('settings.custom_templates', templates);
  containerEl.innerHTML = render();
}

/**
 * Handle template deletion.
 */
function onTemplateDelete(e) {
  const btn = e.target.closest('.template-delete-btn');
  if (!btn) return;
  const idx = parseInt(btn.dataset.index, 10);
  const templates = getTemplates();
  templates.splice(idx, 1);
  StateManager.setState('settings.custom_templates', templates);
  containerEl.innerHTML = render();
}

function onClick(e) {
  onDensityClick(e);
  onTemplateDelete(e);

  if (e.target.id === 'sv-save-retro-time' || e.target.closest('#sv-save-retro-time')) {
    onSaveRetroTime();
  }
  if (e.target.id === 'sv-export-data' || e.target.closest('#sv-export-data')) {
    onExport();
  }
}

function onSubmit(e) {
  if (e.target.id === 'sv-template-form') {
    onTemplateSubmit(e);
  }
}

// ─── Public API ───────────────────────────────────────────────

export function mount(container) {
  containerEl = container;
  container.innerHTML = render();

  container.addEventListener('click', onClick);
  container.addEventListener('submit', onSubmit);

  cleanupFns = [
    () => container.removeEventListener('click', onClick),
    () => container.removeEventListener('submit', onSubmit),
  ];
}

export function unmount() {
  for (const fn of cleanupFns) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  cleanupFns = [];
  if (containerEl) containerEl.innerHTML = '';
  containerEl = null;
}

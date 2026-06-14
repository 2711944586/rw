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
import { escapeAttr, escapeHTML } from '../utils/html.js';
import { nonNegativeNumber } from '../utils/number.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

/** @type {{status: 'success'|'error', message: string}|null} */
let settingsFeedback = null;

const VALID_DENSITY_MODES = new Set(['focus', 'balanced', 'detail']);
const DEFAULT_DENSITY_MODE = 'balanced';
const DEFAULT_RETRO_TIME = '22:00';
const MAX_TEMPLATE_MINUTES = 240;
const SENSITIVE_EXPORT_KEYS = new Set(['snapshots', 'sync', 'user']);

function validDensityMode(mode) {
  return VALID_DENSITY_MODES.has(mode) ? mode : DEFAULT_DENSITY_MODE;
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

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validRetroTime(value) {
  const time = safeText(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : DEFAULT_RETRO_TIME;
}

function templateMinutes(value) {
  return Math.min(MAX_TEMPLATE_MINUTES, Math.round(nonNegativeNumber(value)));
}

function templateName(template) {
  return safeText(objectValue(template).name, '未命名模板') || '未命名模板';
}

function templateSubject(template) {
  return safeText(objectValue(template).subject);
}

function formatLastSynced(value) {
  const text = safeText(value);
  if (!text) return '尚未同步';
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return '尚未同步';
  return `上次同步: ${date.toLocaleString('zh-CN')}`;
}

function safeCloneWithoutSensitiveKeys(value) {
  const seen = new WeakSet();
  const serialized = JSON.stringify(value, (key, currentValue) => {
    if (SENSITIVE_EXPORT_KEYS.has(key)) return undefined;
    if (currentValue && typeof currentValue === 'object') {
      if (seen.has(currentValue)) return undefined;
      seen.add(currentValue);
    }
    return currentValue;
  });
  return serialized ? JSON.parse(serialized) : {};
}

/**
 * Get current density mode.
 */
function getDensityMode() {
  return validDensityMode(StateManager.getState('profile.density_mode'));
}

/**
 * Get retro time.
 */
function getRetroTime() {
  return validRetroTime(StateManager.getState('profile.retro_time'));
}

/**
 * Get custom task templates.
 */
function getTemplates() {
  const templates = StateManager.getState('settings.custom_templates');
  return Array.isArray(templates) ? templates : [];
}

function isTemplateObject(template) {
  return template && typeof template === 'object' && !Array.isArray(template);
}

function templateRows() {
  return getTemplates()
    .map((template, index) => ({ template, index }))
    .filter(({ template }) => isTemplateObject(template));
}

function sanitizeLocalExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const { snapshots, sync, user, ...rest } = payload;
  return safeCloneWithoutSensitiveKeys(rest);
}

function sanitizeLocalExportSnapshots(snapshots) {
  return (Array.isArray(snapshots) ? snapshots : []).slice(0, 5).map((snapshot) => {
    const row = objectValue(snapshot);
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : row;
    return {
      reason: safeText(row.reason, 'manual'),
      createdAt: safeText(row.createdAt) || safeText(row.created_at),
      payload: sanitizeLocalExportPayload(payload),
    };
  });
}

function sanitizeLocalExportState(localState = {}) {
  const payload = sanitizeLocalExportPayload(localState);
  payload.snapshots = sanitizeLocalExportSnapshots(localState.snapshots);
  return payload;
}

function getExportUserId() {
  const user = objectValue(StateManager.getState('user'));
  return safeText(user.id) || safeText(user.user_id);
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  try {
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderSettingsFeedback() {
  if (!settingsFeedback) {
    return '<div id="sv-settings-feedback" class="settings-action-feedback" aria-live="polite" hidden></div>';
  }

  const role = settingsFeedback.status === 'error' ? 'alert' : 'status';
  const live = settingsFeedback.status === 'error' ? 'assertive' : 'polite';
  return `
    <div id="sv-settings-feedback" class="settings-action-feedback ${settingsFeedback.status}" role="${role}" aria-live="${live}">
      ${escapeHTML(settingsFeedback.message)}
    </div>
  `;
}

function updateSettingsFeedbackElement() {
  const feedback = containerEl?.querySelector('#sv-settings-feedback');
  if (!feedback || !settingsFeedback) return;
  feedback.hidden = false;
  feedback.className = `settings-action-feedback ${settingsFeedback.status}`;
  feedback.setAttribute('role', settingsFeedback.status === 'error' ? 'alert' : 'status');
  feedback.setAttribute('aria-live', settingsFeedback.status === 'error' ? 'assertive' : 'polite');
  feedback.textContent = settingsFeedback.message;
}

function setSettingsFeedback(saved, successMessage) {
  settingsFeedback = saved
    ? { status: 'success', message: successMessage }
    : {
      status: 'error',
      message: '设置已保留在当前页面，本机缓存写入失败，请立即导出备份。',
    };
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
            data-density="${escapeAttr(m.value)}" aria-label="密度模式: ${escapeAttr(m.label)}"
            aria-pressed="${String(m.value === current)}">${m.label}</button>
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
        <input type="time" id="sv-retro-time" value="${escapeAttr(time)}"
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
  const syncText = formatLastSynced(lastSynced);

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head"><div><h3>数据管理</h3><p>导出及同步状态</p></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="primary-button" id="sv-export-data" aria-label="导出全部数据">导出全部数据</button>
        <span style="font-size:12px;color:var(--muted);">${escapeHTML(syncText)}</span>
      </div>
      <div id="sv-export-feedback" style="margin-top:8px;font-size:12px;color:var(--muted);display:none;" aria-live="polite"></div>
    </section>
  `;
}

/**
 * Render custom task templates CRUD.
 */
function renderTemplatesSection() {
  const rows = templateRows().map(({ template: t, index }) => {
    const name = templateName(t);
    const subject = templateSubject(t);
    return `
      <div class="custom-task-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:#fbfcfa;">
        <div>
          <strong style="font-size:13px;color:var(--ink);">${escapeHTML(name)}</strong>
          <span style="display:block;font-size:11px;color:var(--muted);">${escapeHTML(subject)} · ${templateMinutes(t.estimatedMinutes)}分钟</span>
        </div>
        <button type="button" class="ghost-button template-delete-btn" data-index="${index}" aria-label="删除模板: ${escapeAttr(name)}">删除</button>
      </div>
    `;
  }).join('');

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
      ${renderSettingsFeedback()}
      ${renderDensitySection()}
      ${renderRetroTimeSection()}
      ${renderExportSection()}
      ${renderTemplatesSection()}
    </section>
  `;
}

/**
 * Handle density mode selection with immediate persistence.
 */
function onDensityClick(e) {
  const btn = e.target.closest('.density-btn');
  if (!btn) return;
  const mode = validDensityMode(btn.dataset.density);
  if (mode !== btn.dataset.density) return;

  const saved = StateManager.setState('profile.density_mode', mode);
  setSettingsFeedback(saved, '显示密度已保存。');
  // Update document attribute for CSS
  document.documentElement.setAttribute('data-density', mode);

  // Update active button state
  containerEl.querySelectorAll('.density-btn').forEach((button) => {
    const active = button === btn;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateSettingsFeedbackElement();
}

/**
 * Handle retro time save.
 */
function onSaveRetroTime() {
  const input = containerEl.querySelector('#sv-retro-time');
  if (input) {
    const time = validRetroTime(input.value);
    input.value = time;
    const saved = StateManager.setState('profile.retro_time', time);
    setSettingsFeedback(saved, '复盘提醒时间已保存。');
    updateSettingsFeedbackElement();
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
    const exportUserId = getExportUserId();
    const result = await exportAllData(exportUserId);
    if (result && result.success && result.data) {
      downloadJsonFile(result.data, `pku-swm-420-export-${new Date().toISOString().slice(0, 10)}.json`);
      if (feedback) feedback.textContent = '✓ 导出完成';
    } else {
      // Fallback: export local state
      const state = StateManager.getState();
      downloadJsonFile(sanitizeLocalExportState(state), `pku-swm-420-local-export-${new Date().toISOString().slice(0, 10)}.json`);
      if (feedback) feedback.textContent = '✓ 本地数据已导出';
    }
  } catch (err) {
    if (feedback) feedback.textContent = '导出失败: ' + safeErrorMessage(err);
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

  const templates = [...getTemplates()];
  templates.push({
    name,
    subject: subjectInput?.value?.trim() || '',
    estimatedMinutes: 30,
    createdAt: new Date().toISOString(),
  });
  const saved = StateManager.setState('settings.custom_templates', templates);
  setSettingsFeedback(saved, '自定义任务模板已添加。');
  containerEl.innerHTML = render();
}

/**
 * Handle template deletion.
 */
function onTemplateDelete(e) {
  const btn = e.target.closest('.template-delete-btn');
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  const templates = [...getTemplates()];
  if (!Number.isInteger(idx) || idx < 0 || idx >= templates.length) return;
  if (!isTemplateObject(templates[idx])) return;
  templates.splice(idx, 1);
  const saved = StateManager.setState('settings.custom_templates', templates);
  setSettingsFeedback(saved, '自定义任务模板已删除。');
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
  settingsFeedback = null;
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
  settingsFeedback = null;
}

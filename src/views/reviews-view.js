/**
 * Reviews View — lazy-loaded view module for full review queue management.
 * Lists items grouped by status (due/deferred/stale), with pass/fail submission
 * and staleness confirmations.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 7.1, 7.5, 7.6, 7.7
 */

import {
  canSubmitPass,
  advanceOnPass,
  resetOnFail,
  sortDueItems,
  checkStaleness,
  INTERVALS,
} from '../domain/review-queue.js';
import { StateManager } from '../core/state-manager.js';
import { EventBus, EVENTS } from '../core/event-bus.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Group review items into due, deferred, and stale categories.
 */
function groupItems(items, today) {
  const due = [];
  const deferred = [];
  const stale = [];

  for (const item of items) {
    if (!item.nextDueAt) continue;
    const staleness = checkStaleness(item, today);
    if (staleness.isStale) {
      stale.push({ ...item, daysSinceDue: staleness.daysSinceDue });
    } else if (item.deferred) {
      deferred.push(item);
    } else if (item.nextDueAt <= today) {
      due.push(item);
    } else {
      deferred.push(item);
    }
  }

  return {
    due: sortDueItems(due),
    deferred: sortDueItems(deferred),
    stale: sortDueItems(stale),
  };
}

/**
 * Render a single review item row.
 */
function renderItem(item, groupType) {
  const intervalLabel = `D+${INTERVALS[item.intervalIndex] || 1}`;
  const today = getToday();
  const canPass = canSubmitPass(item, today);

  const staleWarning = groupType === 'stale'
    ? `<span class="stale-warning" style="color:var(--red);font-size:11px;">逾期 ${item.daysSinceDue || 7}+ 天，需确认重置</span>`
    : '';

  return `
    <article class="review-queue-item ${groupType === 'due' ? 'due' : ''}" data-topic-id="${item.topicId}">
      <div>
        <strong>${item.topicId || item.topic || '未命名'}</strong>
        <p>间隔: ${intervalLabel} | 连续失败: ${item.failStreak || 0}</p>
        <span>到期: ${item.nextDueAt}</span>
        ${staleWarning}
      </div>
      <div class="review-actions" style="display:flex;gap:6px;flex-wrap:wrap;">
        ${groupType === 'stale' ? `
          <button type="button" class="ghost-button stale-reset-btn" data-topic-id="${item.topicId}" aria-label="重置: ${item.topicId}">确认重置</button>
          <button type="button" class="ghost-button stale-keep-btn" data-topic-id="${item.topicId}" aria-label="保留进度: ${item.topicId}">保留进度</button>
        ` : `
          <button type="button" class="primary-button review-pass-btn" data-topic-id="${item.topicId}" ${!canPass ? 'disabled' : ''} aria-label="通过: ${item.topicId}">${canPass ? '通过' : '今日已通过'}</button>
          <button type="button" class="ghost-button review-fail-btn" data-topic-id="${item.topicId}" aria-label="未通过: ${item.topicId}">未通过</button>
        `}
      </div>
    </article>
  `;
}

/**
 * Render a group section.
 */
function renderGroup(title, items, groupType, emptyMsg) {
  const count = items.length;
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>${title} (${count})</h3>
          <p>${emptyMsg}</p>
        </div>
      </div>
      <div class="review-queue" role="list" aria-label="${title}">
        ${count === 0
          ? `<p class="muted" style="color:var(--muted);font-size:13px;">暂无项目</p>`
          : items.map(item => renderItem(item, groupType)).join('')}
      </div>
    </section>
  `;
}

/**
 * Main render.
 */
function render() {
  const today = getToday();
  const reviewItems = StateManager.getState('review_items') || [];
  const groups = groupItems(Array.isArray(reviewItems) ? reviewItems : [], today);

  return `
    <section class="view reviews-view active">
      ${renderGroup('今日到期', groups.due, 'due', '需要今日完成复习的项目')}
      ${renderGroup('延迟项目', groups.deferred, 'deferred', '未到期或已延迟的项目')}
      ${renderGroup('过期项目', groups.stale, 'stale', '逾期 ≥7 天，需确认处理方式')}
    </section>
  `;
}

/**
 * Handle pass/fail clicks.
 */
function onReviewAction(e) {
  const btn = e.target;
  const isPass = btn.classList.contains('review-pass-btn');
  const isFail = btn.classList.contains('review-fail-btn');
  if (!isPass && !isFail) return;

  const topicId = btn.dataset.topicId;
  const today = getToday();
  const reviewItems = StateManager.getState('review_items') || [];
  const idx = reviewItems.findIndex(r => r.topicId === topicId);
  if (idx === -1) return;

  const item = reviewItems[idx];

  if (isPass) {
    if (!canSubmitPass(item, today)) {
      btn.disabled = true;
      btn.textContent = '今日已通过';
      return;
    }
    reviewItems[idx] = advanceOnPass(item, today);
  } else {
    reviewItems[idx] = resetOnFail(item, today);
  }

  StateManager.setState('review_items', reviewItems);
  EventBus.emit(EVENTS.REVIEW_RESULT, { topicId, result: isPass ? 'pass' : 'fail' });
  rerender();
}

/**
 * Handle stale item confirmations.
 */
function onStaleAction(e) {
  const btn = e.target;
  const isReset = btn.classList.contains('stale-reset-btn');
  const isKeep = btn.classList.contains('stale-keep-btn');
  if (!isReset && !isKeep) return;

  const topicId = btn.dataset.topicId;
  const today = getToday();
  const reviewItems = StateManager.getState('review_items') || [];
  const idx = reviewItems.findIndex(r => r.topicId === topicId);
  if (idx === -1) return;

  const item = reviewItems[idx];
  const tomorrow = addDaysStr(today, 1);

  if (isReset) {
    reviewItems[idx] = { ...item, intervalIndex: 0, nextDueAt: tomorrow, failStreak: 0 };
  } else {
    // Keep progress, just reset due date
    reviewItems[idx] = { ...item, nextDueAt: tomorrow };
  }

  StateManager.setState('review_items', reviewItems);
  rerender();
}

function addDaysStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rerender() {
  if (containerEl) containerEl.innerHTML = render();
}

// ─── Public API ───────────────────────────────────────────────

export function mount(container) {
  containerEl = container;
  container.innerHTML = render();

  container.addEventListener('click', onReviewAction);
  container.addEventListener('click', onStaleAction);

  cleanupFns = [
    () => container.removeEventListener('click', onReviewAction),
    () => container.removeEventListener('click', onStaleAction),
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

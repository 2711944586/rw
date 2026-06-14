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
import { escapeAttr, escapeHTML } from '../utils/html.js';
import { nonNegativeNumber } from '../utils/number.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

/** @type {{status: 'success'|'error', message: string}|null} */
let reviewFeedback = null;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function reviewIndexFromButton(btn) {
  const index = Number(btn.dataset.reviewIndex);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeReviewText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
}

function reviewTopicId(item) {
  return safeReviewText(objectValue(item).topicId);
}

function reviewTopicLabel(item) {
  const review = objectValue(item);
  return reviewTopicId(review) || safeReviewText(review.topic) || '未命名';
}

function hasReviewIdentity(item) {
  const review = objectValue(item);
  return Boolean(reviewTopicId(review) || safeReviewText(review.topic));
}

/**
 * Group review items into due, deferred, and stale categories.
 */
function groupItems(items, today) {
  const due = [];
  const deferred = [];
  const stale = [];

  for (const [index, item] of items.entries()) {
    if (!item || item.done || ['done', 'failed'].includes(item.status)) continue;
    if (!isValidDateKey(item.nextDueAt)) continue;
    const indexedItem = { ...item, _reviewIndex: index };
    const staleness = checkStaleness(item, today);
    if (staleness.isStale) {
      stale.push({ ...indexedItem, daysSinceDue: staleness.daysSinceDue });
    } else if (indexedItem.deferred) {
      deferred.push(indexedItem);
    } else if (indexedItem.nextDueAt <= today) {
      due.push(indexedItem);
    } else {
      deferred.push(indexedItem);
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
  const topicId = reviewTopicId(item);
  const topicLabel = reviewTopicLabel(item);
  const reviewIndex = Number.isInteger(item._reviewIndex) && item._reviewIndex >= 0 ? item._reviewIndex : -1;
  const failStreak = Math.round(nonNegativeNumber(item.failStreak));
  const daysSinceDue = Math.round(nonNegativeNumber(item.daysSinceDue, 7));
  const dueDate = safeReviewText(item.nextDueAt);

  const staleWarning = groupType === 'stale'
    ? `<span class="stale-warning" style="color:var(--red);font-size:11px;">逾期 ${daysSinceDue}+ 天，需确认重置</span>`
    : '';

  return `
    <article class="review-queue-item ${groupType === 'due' ? 'due' : ''}" data-topic-id="${escapeAttr(topicId)}" data-review-index="${reviewIndex}">
      <div>
        <strong>${escapeHTML(topicLabel)}</strong>
        <p>间隔: ${escapeHTML(intervalLabel)} | 连续失败: ${failStreak}</p>
        <span>到期: ${escapeHTML(dueDate)}</span>
        ${staleWarning}
      </div>
      <div class="review-actions" style="display:flex;gap:6px;flex-wrap:wrap;">
        ${groupType === 'stale' ? `
          <button type="button" class="ghost-button stale-reset-btn" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" aria-label="重置: ${escapeAttr(topicLabel)}">确认重置</button>
          <button type="button" class="ghost-button stale-keep-btn" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" aria-label="保留进度: ${escapeAttr(topicLabel)}">保留进度</button>
        ` : `
          <button type="button" class="primary-button review-pass-btn" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" ${!canPass ? 'disabled' : ''} aria-label="通过: ${escapeAttr(topicLabel)}">${canPass ? '通过' : '今日已通过'}</button>
          <button type="button" class="ghost-button review-fail-btn" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" aria-label="未通过: ${escapeAttr(topicLabel)}">未通过</button>
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
          <h3>${escapeHTML(title)} (${count})</h3>
          <p>${escapeHTML(emptyMsg)}</p>
        </div>
      </div>
      <div class="review-queue" role="list" aria-label="${escapeAttr(title)}">
        ${count === 0
          ? `<p class="muted" style="color:var(--muted);font-size:13px;">暂无项目</p>`
          : items.map(item => renderItem(item, groupType)).join('')}
      </div>
    </section>
  `;
}

function renderFeedback() {
  if (!reviewFeedback) {
    return '<div class="review-action-feedback" aria-live="polite" hidden></div>';
  }

  return `
    <div class="review-action-feedback ${reviewFeedback.status}" aria-live="polite">
      ${escapeHTML(reviewFeedback.message)}
    </div>
  `;
}

function setReviewFeedback(saved, successMessage) {
  reviewFeedback = saved
    ? { status: 'success', message: successMessage }
    : {
      status: 'error',
      message: '复盘已保留在当前页面，本机缓存写入失败，请立即导出备份。',
    };
}

/**
 * Main render.
 */
function render() {
  const today = getToday();
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  const groups = groupItems(reviewItems, today);

  return `
    <section class="view reviews-view active">
      ${renderFeedback()}
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

  const reviewIndex = reviewIndexFromButton(btn);
  if (reviewIndex < 0) return;
  const today = getToday();
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  if (reviewIndex >= reviewItems.length) return;

  const item = objectValue(reviewItems[reviewIndex]);
  if (!hasReviewIdentity(item)) return;
  const topicId = reviewTopicId(item);
  const nextReviewItems = [...reviewItems];

  if (isPass) {
    if (!canSubmitPass(item, today)) {
      btn.disabled = true;
      btn.textContent = '今日已通过';
      return;
    }
    nextReviewItems[reviewIndex] = advanceOnPass(item, today);
  } else {
    nextReviewItems[reviewIndex] = resetOnFail(item, today);
  }

  const saved = StateManager.setState('review_items', nextReviewItems);
  setReviewFeedback(saved, isPass ? '复盘通过已保存，等待同步。' : '复盘失败已保存，已安排短间隔回炉。');
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

  const reviewIndex = reviewIndexFromButton(btn);
  if (reviewIndex < 0) return;
  const today = getToday();
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  if (reviewIndex >= reviewItems.length) return;

  const item = objectValue(reviewItems[reviewIndex]);
  if (!hasReviewIdentity(item)) return;
  const tomorrow = addDaysStr(today, 1);
  const nextReviewItems = [...reviewItems];

  if (isReset) {
    nextReviewItems[reviewIndex] = { ...item, intervalIndex: 0, nextDueAt: tomorrow, failStreak: 0 };
  } else {
    // Keep progress, just reset due date
    nextReviewItems[reviewIndex] = { ...item, nextDueAt: tomorrow };
  }

  const saved = StateManager.setState('review_items', nextReviewItems);
  setReviewFeedback(saved, isReset ? '过期复盘已重置到短间隔。' : '过期复盘已保留进度并顺延到明天。');
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
  reviewFeedback = null;
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
  reviewFeedback = null;
}

/**
 * Today View — lazy-loaded view module for daily plan, task completion,
 * record input, and review queue management.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 2.1, 3.3, 5.1, 5.3, 5.6, 9.1, 9.2, 9.5
 */

import { generateDailyPlan } from '../domain/plan-generator.js';
import { validateCompletion } from '../domain/task-contract.js';
import {
  canSubmitPass,
  advanceOnPass,
  resetOnFail,
  sortDueItems,
  INTERVALS,
} from '../domain/review-queue.js';
import { OfflineCache } from '../infrastructure/offline-cache.js';
import { EventBus, EVENTS } from '../core/event-bus.js';
import { StateManager } from '../core/state-manager.js';
import { escapeAttr, escapeHTML } from '../utils/html.js';
import { nonNegativeNumber, positiveNumber } from '../utils/number.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} Event listener cleanup registry */
let cleanupFns = [];

/** @type {{status: 'success'|'error', message: string}|null} */
let todayActionFeedback = null;

/** Today ISO date string */
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function safeNumber(value, fallback = 0) {
  return nonNegativeNumber(value, fallback);
}

function safeInteger(value, fallback = 0) {
  return Math.round(nonNegativeNumber(value, fallback));
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

function firstArrayValue(values) {
  return arrayValue(values).find(Array.isArray) || [];
}

function firstSafeInteger(values, fallback = 0) {
  for (const value of arrayValue(values)) {
    const type = typeof value;
    if (!['string', 'number', 'bigint'].includes(type)) continue;
    if (type === 'string' && value.trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return Math.round(Math.max(0, number));
  }
  return safeInteger(fallback);
}

function normalizedTaskContract(task) {
  const item = objectValue(task);
  const contract = objectValue(item.contract);
  return {
    required_artifacts: firstArrayValue([
      contract.required_artifacts,
      contract.requiredArtifacts,
      item.required_artifacts,
      item.requiredArtifacts,
    ]).map(value => safeText(value)).filter(Boolean),
    required_problem_count: firstSafeInteger([
      contract.required_problem_count,
      contract.requiredProblemCount,
      item.required_problem_count,
      item.requiredProblemCount,
    ])
  };
}

function reviewTopicId(item) {
  return safeText(objectValue(item).topicId);
}

function reviewTopicLabel(item) {
  const review = objectValue(item);
  return reviewTopicId(review) || safeText(review.topic) || '未命名';
}

function hasReviewIdentity(item) {
  const review = objectValue(item);
  return Boolean(reviewTopicId(review) || safeText(review.topic));
}

function taskLabelFor(task) {
  const item = objectValue(task);
  return safeText(item.title) || safeText(item.topicId) || safeText(item.topic) || '学习任务';
}

function taskIndexFromControl(control) {
  const index = Number(control?.dataset?.taskIndex);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

function reviewIndexFromButton(btn) {
  const index = Number(btn.dataset.reviewIndex);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}

function validDateKey(value) {
  const text = safeText(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

function reviewIsActive(item) {
  return item && !item.done && !['done', 'failed'].includes(item.status);
}

function isDueReviewItem(item, today) {
  const dueDate = validDateKey(item?.nextDueAt);
  return Boolean(reviewIsActive(item) && dueDate && dueDate <= today);
}

/**
 * Get the current density mode from state.
 * @returns {'focus'|'balanced'|'detail'}
 */
function getDensityMode() {
  return StateManager.getState('profile.density_mode') || 'focus';
}

/**
 * Build the plan input from current state for generateDailyPlan.
 */
function buildPlanInput() {
  const settings = objectValue(StateManager.getState('settings'));
  const records = objectValue(StateManager.getState('daily_records'));
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  const today = getToday();

  // Compute consecutive missed days
  const recordDates = Object.keys(records)
    .map(validDateKey)
    .filter(dateKey => dateKey && dateKey <= today)
    .sort()
    .reverse();
  let consecutiveMissedDays = 0;
  if (recordDates.length > 0) {
    const lastDate = new Date(recordDates[0] + 'T00:00:00Z');
    const now = new Date(today + 'T00:00:00Z');
    consecutiveMissedDays = Math.max(0, Math.round((now - lastDate) / (1000 * 60 * 60 * 24)));
  }

  // Due reviews
  const dueReviews = reviewItems
    .filter(item => isDueReviewItem(item, today))
    .map(item => ({
      ...item,
      category: 'review',
    }));

  // Available minutes
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const availableMinutes = isWeekend
    ? positiveNumber(settings.weekendMinutes, 360)
    : positiveNumber(settings.weekdayMinutes, 240);

  // Candidate topics from state
  const candidateTopics = arrayValue(StateManager.getState('candidate_topics'));
  const blockedTopics = arrayValue(StateManager.getState('blocked_topics'));

  // Compute 7-day history median
  const last7 = recordDates.slice(0, 7);
  let historyMedian = { taskCount: 4, minutes: availableMinutes };
  if (last7.length >= 3) {
    const minutesList = last7.map(d => {
      const r = objectValue(records[d]);
      return safeNumber(r.mathMin) + safeNumber(r.csMin) + safeNumber(r.engMin) + safeNumber(r.polMin) + safeNumber(r.projectMin);
    }).sort((a, b) => a - b);
    historyMedian.minutes = minutesList[Math.floor(minutesList.length / 2)];
  }
  const coreRatioTarget = Math.min(1, Math.max(0, nonNegativeNumber(settings.coreRatio, 65) / 100));

  return {
    availableMinutes,
    phase: settings.phase || 'foundation',
    coreRatioTarget,
    blockedTopics,
    dueReviews,
    historyMedian,
    consecutiveMissedDays,
    topicHistory: new Map(),
    candidateTopics,
  };
}

/**
 * Render the sync status indicator.
 */
function renderSyncStatus() {
  const lastSynced = StateManager.getState('profile.last_synced_at');
  const text = lastSynced
    ? `上次同步: ${new Date(lastSynced).toLocaleString('zh-CN')}`
    : '尚未同步';
  return `<div class="sync-indicator" aria-live="polite"><span>${escapeHTML(text)}</span></div>`;
}

function renderTodayActionFeedback() {
  if (!todayActionFeedback) {
    return '<div class="today-action-feedback" aria-live="polite" hidden></div>';
  }

  const role = todayActionFeedback.status === 'error' ? 'alert' : 'status';
  const live = todayActionFeedback.status === 'error' ? 'assertive' : 'polite';
  return `
    <div class="today-action-feedback ${todayActionFeedback.status}" role="${role}" aria-live="${live}">
      ${escapeHTML(todayActionFeedback.message)}
    </div>
  `;
}

function setTodayActionFeedback(saved, successMessage) {
  todayActionFeedback = saved
    ? { status: 'success', message: successMessage }
    : {
      status: 'error',
      message: '操作已保留在当前页面，本机缓存写入失败，请立即导出备份。',
    };
}

function updateTodayActionFeedbackElement() {
  const feedback = containerEl?.querySelector('.today-action-feedback');
  if (!feedback || !todayActionFeedback) return;
  feedback.hidden = false;
  feedback.className = `today-action-feedback ${todayActionFeedback.status}`;
  feedback.setAttribute('role', todayActionFeedback.status === 'error' ? 'alert' : 'status');
  feedback.setAttribute('aria-live', todayActionFeedback.status === 'error' ? 'assertive' : 'polite');
  feedback.textContent = todayActionFeedback.message;
}

/**
 * Render a single plan task card.
 */
function renderTaskCard(task, index) {
  const item = objectValue(task);
  const taskContract = normalizedTaskContract(item);
  const artifacts = taskContract.required_artifacts.map(escapeHTML).join(', ');
  const requiredProblems = taskContract.required_problem_count;
  const taskId = safeText(item.id, String(index));
  const taskLabel = taskLabelFor(item);

  return `
    <article class="plan-card" data-task-index="${index}" data-task-id="${escapeAttr(taskId)}" tabindex="0" role="listitem">
      <div class="plan-card-head">
        <label class="plan-card-check">
          <input type="checkbox" class="task-complete-check" data-task-index="${index}"
            aria-label="标记任务完成: ${escapeAttr(taskLabel)}" />
        </label>
        <div class="plan-card-info">
          <span class="plan-card-subject">${escapeHTML(safeText(item.subject))}</span>
          <strong class="plan-card-title">${escapeHTML(taskLabel)}</strong>
          <em class="plan-card-time">${safeNumber(item.estimatedMinutes)} 分钟</em>
        </div>
      </div>
      ${(artifacts || requiredProblems > 0) ? `
      <div class="plan-card-contract">
        ${requiredProblems > 0 ? `<span>需完成题目: ≥${requiredProblems}</span>` : ''}
        ${artifacts ? `<span>需提交: ${artifacts}</span>` : ''}
      </div>` : ''}
      <div class="plan-card-completion-form" data-task-index="${index}" style="display:none;">
        <label>实际题数 <input type="number" min="0" class="completion-problems" inputmode="numeric" /></label>
        <label>正确数 <input type="number" min="0" class="completion-correct" inputmode="numeric" /></label>
        <label>提交证据
          <select class="completion-artifacts" multiple aria-label="选择已完成的产出">
            <option value="题目数与正确率">题目数与正确率</option>
            <option value="推导过程图">推导过程图</option>
            <option value="代码或伪代码">代码或伪代码</option>
            <option value="错因笔记">错因笔记</option>
            <option value="公式默写">公式默写</option>
            <option value="数据结构图示">数据结构图示</option>
          </select>
        </label>
        <div class="completion-errors" role="alert" aria-live="assertive"></div>
        <button type="button" class="primary-button completion-submit-btn" data-task-index="${index}">确认完成</button>
      </div>
    </article>
  `;
}

/**
 * Render the daily plan section.
 */
function renderDailyPlan(tasks) {
  if (!tasks || tasks.length === 0) {
    return `
      <section class="panel today-plan-panel">
        <div class="panel-head">
          <div><h3>今日计划</h3><p>暂无任务，请配置候选知识点</p></div>
          <button class="primary-button" id="tv-generate-plan-btn" type="button" aria-label="重新生成计划">重新生成</button>
        </div>
      </section>
    `;
  }

  const taskCards = tasks.map((t, i) => renderTaskCard(t, i)).join('');
  return `
    <section class="panel today-plan-panel">
      <div class="panel-head">
        <div><h3>今日计划</h3><p>按优先级排序: 复习 → 核心 → 错题 → 其他</p></div>
        <button class="primary-button" id="tv-generate-plan-btn" type="button" aria-label="重新生成计划">重新生成</button>
      </div>
      <div class="daily-plan" role="list" aria-label="今日任务列表">
        ${taskCards}
      </div>
    </section>
  `;
}

/**
 * Render the minutes input (record entry) form.
 */
function renderRecordForm() {
  const today = getToday();
  return `
    <section class="panel today-entry-panel">
      <div class="panel-head">
        <div><h3>学习记录</h3><p>只填分钟数和题量</p></div>
        <input class="date-input" type="date" id="tv-entry-date" value="${escapeAttr(today)}" aria-label="记录日期" />
      </div>
      <div class="quick-row">
        <div class="quick-group" aria-label="今日节奏档位" role="group">
          <button type="button" class="quick-chip" data-preset="minimum" aria-label="底线日预设">底线日</button>
          <button type="button" class="quick-chip" data-preset="normal" aria-label="正常日预设">正常日</button>
          <button type="button" class="quick-chip" data-preset="strong" aria-label="加强日预设">加强日</button>
        </div>
      </div>
      <form class="entry-form" id="tv-entry-form" aria-label="学习记录表单">
        <label>数学分钟<input type="number" min="0" id="tv-mathMin" inputmode="numeric" /></label>
        <label>408 分钟<input type="number" min="0" id="tv-csMin" inputmode="numeric" /></label>
        <label>英语分钟<input type="number" min="0" id="tv-engMin" inputmode="numeric" /></label>
        <label>政治分钟<input type="number" min="0" id="tv-polMin" inputmode="numeric" /></label>
        <label>项目分钟<input type="number" min="0" id="tv-projectMin" inputmode="numeric" /></label>
        <label>数学题数<input type="number" min="0" id="tv-mathProblems" inputmode="numeric" /></label>
        <label>408 题数<input type="number" min="0" id="tv-csProblems" inputmode="numeric" /></label>
        <label>阅读篇数<input type="number" min="0" id="tv-readingCount" inputmode="numeric" /></label>
        <label>新增错题<input type="number" min="0" id="tv-newMistakes" inputmode="numeric" /></label>
        <label>回炉错题<input type="number" min="0" id="tv-fixedMistakes" inputmode="numeric" /></label>
        <label class="span-2">明日第一任务<input type="text" id="tv-nextTask" placeholder="例如：高数极限习题 20 道" /></label>
        <button type="submit" class="primary-button" id="tv-submit-record">保存今日记录</button>
      </form>
      <div class="tv-submit-feedback" aria-live="polite" style="display:none;"></div>
    </section>
  `;
}

/**
 * Render review items due today.
 */
function renderReviewQueue() {
  const today = getToday();
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  const dueItems = reviewItems
    .map((item, index) => ({ ...objectValue(item), _reviewIndex: index }))
    .filter(item => isDueReviewItem(item, today));
  const sorted = sortDueItems(dueItems);

  if (sorted.length === 0) {
    return `
      <section class="panel today-review-panel">
        <div class="panel-head"><div><h3>今日复盘队列</h3><p>无到期复习项</p></div></div>
      </section>
    `;
  }

  const items = sorted.map((item, i) => {
    const intervalLabel = `D+${INTERVALS[item.intervalIndex] || 1}`;
    const isDeferred = item.deferred;
    const deferredMark = isDeferred ? ' <em class="deferred-mark">延迟</em>' : '';
    const topicId = reviewTopicId(item);
    const topicLabel = reviewTopicLabel(item);
    const reviewIndex = Number.isInteger(item._reviewIndex) && item._reviewIndex >= 0 ? item._reviewIndex : i;
    const failStreak = safeNumber(item.failStreak);

    return `
      <article class="review-item" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" tabindex="0">
        <div class="review-item-info">
          <strong>${escapeHTML(topicLabel)}</strong>
          <span class="review-interval">${escapeHTML(intervalLabel)}</span>
          ${failStreak > 0 ? `<span class="review-fail-streak">连续失败: ${failStreak}</span>` : ''}
          ${deferredMark}
        </div>
        <div class="review-item-actions" role="group" aria-label="复习结果">
          <button type="button" class="review-pass-btn" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" aria-label="通过: ${escapeAttr(topicLabel)}">通过</button>
          <button type="button" class="review-fail-btn" data-review-index="${reviewIndex}" data-topic-id="${escapeAttr(topicId)}" aria-label="未通过: ${escapeAttr(topicLabel)}">未通过</button>
        </div>
      </article>
    `;
  }).join('');

  return `
    <section class="panel today-review-panel">
      <div class="panel-head"><div><h3>今日复盘队列</h3><p>D+1 / D+3 / D+7 / D+14 / D+30</p></div></div>
      <div class="review-queue" role="list" aria-label="到期复习列表">
        ${items}
      </div>
    </section>
  `;
}

/**
 * Main render function — builds the full today-view HTML.
 */
function render() {
  const planInput = buildPlanInput();
  const tasks = generateDailyPlan(planInput);
  const density = getDensityMode();

  // Store generated tasks in state for completion tracking
  const tasksSaved = StateManager.setState('today.tasks', tasks);
  if (!tasksSaved) {
    setTodayActionFeedback(false, '今日计划已保存。');
  }

  const focusOnly = density === 'focus';

  let html = `<section class="view today-view active">`;
  html += renderSyncStatus();
  html += renderTodayActionFeedback();
  html += renderDailyPlan(tasks);
  html += renderRecordForm();
  html += renderReviewQueue();

  if (!focusOnly) {
    html += `
      <section class="panel today-extras" data-density-hide="focus">
        <div class="panel-head"><div><h3>本周统计</h3><p>详情请切换至周视图</p></div></div>
        <p class="muted">切换至"平衡"或"详尽"模式查看更多</p>
      </section>
    `;
  }

  html += `</section>`;
  return html;
}

/**
 * Handle task completion checkbox toggle.
 */
function onTaskCheckboxChange(e) {
  const checkbox = e.target;
  if (!checkbox.classList.contains('task-complete-check')) return;

  const index = taskIndexFromControl(checkbox);
  if (index < 0) return;
  const formEl = containerEl.querySelector(`.plan-card-completion-form[data-task-index="${index}"]`);

  if (checkbox.checked && formEl) {
    formEl.style.display = 'block';
    const firstInput = formEl.querySelector('input');
    if (firstInput) firstInput.focus();
  } else if (formEl) {
    formEl.style.display = 'none';
  }
}

/**
 * Handle task completion submission with contract validation.
 */
function onCompletionSubmit(e) {
  const btn = e.target;
  if (!btn.classList.contains('completion-submit-btn')) return;

  const index = taskIndexFromControl(btn);
  if (index < 0) return;
  const tasks = arrayValue(StateManager.getState('today.tasks'));
  const rawTask = tasks[index];
  if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) return;
  const task = rawTask;

  const formEl = containerEl.querySelector(`.plan-card-completion-form[data-task-index="${index}"]`);
  if (!formEl) return;

  const problemsInput = formEl.querySelector('.completion-problems');
  const correctInput = formEl.querySelector('.completion-correct');
  const artifactsSelect = formEl.querySelector('.completion-artifacts');
  const errorsEl = formEl.querySelector('.completion-errors');

  const problemCount = safeInteger(problemsInput?.value);
  const correctCount = correctInput && correctInput.value !== '' ? safeInteger(correctInput.value) : undefined;
  const selectedArtifacts = artifactsSelect
    ? Array.from(artifactsSelect.selectedOptions).map(o => o.value)
    : [];

  // Build validation payload
  const payload = {
    problem_count: problemCount,
    correct_count: correctCount,
    artifacts: selectedArtifacts,
  };

  // Build task contract for validation
  const taskContract = normalizedTaskContract(task);

  const result = validateCompletion(taskContract, payload);

  if (!result.valid) {
    if (errorsEl) {
      errorsEl.textContent = result.errors.join('; ');
      errorsEl.style.display = 'block';
    }
    return;
  }

  // Validation passed — mark completed
  if (errorsEl) errorsEl.style.display = 'none';
  const card = containerEl.querySelector(`.plan-card[data-task-index="${index}"]`);
  if (card) {
    card.classList.add('completed');
    formEl.style.display = 'none';
  }

  // Emit task completion event
  const taskTopicId = safeText(task.topicId);
  EventBus.emit(EVENTS.TASK_COMPLETED, {
    taskId: safeText(task.id, String(index)),
    topicId: taskTopicId,
    subject: safeText(task.subject),
    payload,
  });

  // Add to review queue
  const reviewItems = arrayValue(StateManager.getState('review_items')).filter(item => item && typeof item === 'object');
  const today = getToday();
  if (taskTopicId && !reviewItems.find(r => reviewTopicId(r) === taskTopicId)) {
    const nextReviewItems = [...reviewItems, {
      topicId: taskTopicId,
      addedAt: today,
      nextDueAt: addDaysStr(today, 1),
      intervalIndex: 0,
      lastResult: null,
      failStreak: 0,
      lastSubmittedDate: null,
    }];
    const saved = StateManager.setState('review_items', nextReviewItems);
    setTodayActionFeedback(saved, '任务完成已保存，并加入复盘队列。');
    updateTodayActionFeedbackElement();
  } else {
    setTodayActionFeedback(true, '任务完成已记录。');
    updateTodayActionFeedbackElement();
  }
}

/**
 * Handle review pass/fail buttons.
 */
function onReviewAction(e) {
  const btn = e.target;
  const isPass = btn.classList.contains('review-pass-btn');
  const isFail = btn.classList.contains('review-fail-btn');
  if (!isPass && !isFail) return;

  const reviewIndex = reviewIndexFromButton(btn);
  const today = getToday();
  const reviewItems = arrayValue(StateManager.getState('review_items'));
  const itemIndex = reviewIndex >= 0 ? reviewIndex : reviewItems.findIndex(r => reviewTopicId(r) === btn.dataset.topicId);
  if (itemIndex === -1) return;

  const item = objectValue(reviewItems[itemIndex]);
  if (!hasReviewIdentity(item)) return;
  const topicId = reviewTopicId(item);

  if (isPass) {
    if (!canSubmitPass(item, today)) {
      // Same-day double-pass prevention
      btn.disabled = true;
      btn.textContent = '今日已通过';
      return;
    }
    reviewItems[itemIndex] = advanceOnPass(item, today);
  } else {
    reviewItems[itemIndex] = resetOnFail(item, today);
  }

  const saved = StateManager.setState('review_items', reviewItems);
  setTodayActionFeedback(saved, isPass ? '今日复盘通过已保存。' : '今日复盘失败已保存，已安排回炉。');
  EventBus.emit(EVENTS.REVIEW_RESULT, { topicId, result: isPass ? 'pass' : 'fail' });

  // Re-render review section
  const reviewPanel = containerEl.querySelector('.today-review-panel');
  if (reviewPanel) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderReviewQueue();
    reviewPanel.replaceWith(tempDiv.firstElementChild);
  }
  updateTodayActionFeedbackElement();
}

/**
 * Handle preset quick buttons.
 */
function onPresetClick(e) {
  const btn = e.target;
  if (!btn.dataset.preset) return;

  const presets = {
    minimum: { mathMin: 45, csMin: 45, engMin: 20, polMin: 0, projectMin: 0 },
    normal: { mathMin: 90, csMin: 90, engMin: 40, polMin: 30, projectMin: 30 },
    strong: { mathMin: 120, csMin: 120, engMin: 50, polMin: 45, projectMin: 45 },
  };

  const values = presets[btn.dataset.preset];
  if (!values) return;

  for (const [id, val] of Object.entries(values)) {
    const input = containerEl.querySelector(`#tv-${id}`);
    if (input) input.value = val;
  }
}

/**
 * Handle record form submission with optimistic update.
 */
function onRecordSubmit(e) {
  e.preventDefault();

  const dateInput = containerEl.querySelector('#tv-entry-date');
  const date = validDateKey(dateInput?.value) || getToday();

  const record = {
    date,
    mathMin: safeInteger(containerEl.querySelector('#tv-mathMin')?.value),
    csMin: safeInteger(containerEl.querySelector('#tv-csMin')?.value),
    engMin: safeInteger(containerEl.querySelector('#tv-engMin')?.value),
    polMin: safeInteger(containerEl.querySelector('#tv-polMin')?.value),
    projectMin: safeInteger(containerEl.querySelector('#tv-projectMin')?.value),
    mathProblems: safeInteger(containerEl.querySelector('#tv-mathProblems')?.value),
    csProblems: safeInteger(containerEl.querySelector('#tv-csProblems')?.value),
    readingCount: safeInteger(containerEl.querySelector('#tv-readingCount')?.value),
    newMistakes: safeInteger(containerEl.querySelector('#tv-newMistakes')?.value),
    fixedMistakes: safeInteger(containerEl.querySelector('#tv-fixedMistakes')?.value),
    nextTask: containerEl.querySelector('#tv-nextTask')?.value || '',
    createdAt: new Date().toISOString(),
  };

  const feedbackEl = containerEl.querySelector('.tv-submit-feedback');

  // Save to state
  const records = objectValue(StateManager.getState('daily_records'));
  const nextRecords = { ...records, [date]: record };
  const stateSaved = StateManager.setState('daily_records', nextRecords);
  const dirtySaved = StateManager.markDirty('daily_records', date);

  // Also write to offline cache for sync
  const offlineSaved = OfflineCache.setDirty('daily_records', date, record);
  const savedLocally = stateSaved && dirtySaved && offlineSaved;

  if (feedbackEl) {
    feedbackEl.textContent = savedLocally
      ? '✓ 记录已保存'
      : '记录已保留在当前页面，本机缓存写入失败，请立即导出备份。';
    feedbackEl.style.display = 'block';
    feedbackEl.className = savedLocally
      ? 'tv-submit-feedback success'
      : 'tv-submit-feedback error';
  }

  // Clear form
  const form = containerEl.querySelector('#tv-entry-form');
  if (form) form.reset();
  if (dateInput) dateInput.value = getToday();

  // Delayed sync status feedback
  setTimeout(() => {
    if (feedbackEl && savedLocally) {
      const hasPending = OfflineCache.hasPendingSync();
      feedbackEl.textContent = hasPending ? '排队同步中...' : '✓ 已同步';
    }
  }, 1500);
}

/**
 * Handle regenerate plan button.
 */
function onRegeneratePlan() {
  const planPanel = containerEl.querySelector('.today-plan-panel');
  if (!planPanel) return;

  const planInput = buildPlanInput();
  const tasks = generateDailyPlan(planInput);
  const saved = StateManager.setState('today.tasks', tasks);
  setTodayActionFeedback(saved, '今日计划已重新生成并保存。');

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = renderDailyPlan(tasks);
  planPanel.replaceWith(tempDiv.firstElementChild);
  updateTodayActionFeedbackElement();

  // Re-attach event listeners for new plan cards
  attachPlanListeners();

  EventBus.emit(EVENTS.PLAN_GENERATED, { tasks });
}

/**
 * Attach plan-specific listeners (task checkboxes, completion forms).
 */
function attachPlanListeners() {
  const planPanel = containerEl.querySelector('.today-plan-panel');
  if (!planPanel) return;

  planPanel.addEventListener('change', onTaskCheckboxChange);
  planPanel.addEventListener('click', onCompletionSubmit);
}

/**
 * Keyboard navigation: Enter on plan-card toggles checkbox.
 */
function onKeydown(e) {
  if (e.key === 'Enter' && e.target.classList.contains('plan-card')) {
    const checkbox = e.target.querySelector('.task-complete-check');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

/**
 * Helper: add days to ISO date string.
 */
function addDaysStr(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Mount the today view into the given container.
 * @param {HTMLElement} container - DOM element to render into
 */
export function mount(container) {
  containerEl = container;
  todayActionFeedback = null;
  container.innerHTML = render();

  // Attach event listeners
  attachPlanListeners();

  // Quick presets
  const quickRow = container.querySelector('.quick-row');
  if (quickRow) quickRow.addEventListener('click', onPresetClick);

  // Record form submit
  const form = container.querySelector('#tv-entry-form');
  if (form) form.addEventListener('submit', onRecordSubmit);

  // Review actions
  container.addEventListener('click', onReviewAction);

  // Regenerate plan
  const regenBtn = container.querySelector('#tv-generate-plan-btn');
  if (regenBtn) regenBtn.addEventListener('click', onRegeneratePlan);

  // Keyboard navigation
  container.addEventListener('keydown', onKeydown);

  // Track cleanup
  cleanupFns = [
    () => quickRow?.removeEventListener('click', onPresetClick),
    () => form?.removeEventListener('submit', onRecordSubmit),
    () => container.removeEventListener('click', onReviewAction),
    () => regenBtn?.removeEventListener('click', onRegeneratePlan),
    () => container.removeEventListener('keydown', onKeydown),
  ];
}

/**
 * Unmount the today view, cleaning up event listeners and references.
 */
export function unmount() {
  for (const fn of cleanupFns) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  cleanupFns = [];

  if (containerEl) {
    containerEl.innerHTML = '';
  }
  containerEl = null;
  todayActionFeedback = null;
}

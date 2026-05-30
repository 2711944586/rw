/**
 * Today View — lazy-loaded view module for daily plan, task completion,
 * record input, and review queue management.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 2.1, 3.3, 5.1, 5.3, 5.6, 9.1, 9.2, 9.5
 */

import { generateDailyPlan, computeCoreRatio } from '../domain/plan-generator.js';
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

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} Event listener cleanup registry */
let cleanupFns = [];

/** Today ISO date string */
function getToday() {
  return new Date().toISOString().slice(0, 10);
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
  const settings = StateManager.getState('settings') || {};
  const records = StateManager.getState('daily_records') || {};
  const reviewItems = StateManager.getState('review_items') || [];
  const today = getToday();

  // Compute consecutive missed days
  const recordDates = Object.keys(records).sort().reverse();
  let consecutiveMissedDays = 0;
  if (recordDates.length > 0) {
    const lastDate = new Date(recordDates[0] + 'T00:00:00Z');
    const now = new Date(today + 'T00:00:00Z');
    consecutiveMissedDays = Math.round((now - lastDate) / (1000 * 60 * 60 * 24));
  } else {
    consecutiveMissedDays = 0;
  }

  // Due reviews
  const dueReviews = (Array.isArray(reviewItems) ? reviewItems : [])
    .filter(item => item.nextDueAt && item.nextDueAt <= today)
    .map(item => ({
      ...item,
      category: 'review',
    }));

  // Available minutes
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const availableMinutes = isWeekend
    ? (settings.weekendMinutes || 360)
    : (settings.weekdayMinutes || 240);

  // Candidate topics from state
  const candidateTopics = StateManager.getState('candidate_topics') || [];
  const blockedTopics = StateManager.getState('blocked_topics') || [];

  // Compute 7-day history median
  const last7 = recordDates.slice(0, 7);
  let historyMedian = { taskCount: 4, minutes: availableMinutes };
  if (last7.length >= 3) {
    const minutesList = last7.map(d => {
      const r = records[d];
      return (r.mathMin || 0) + (r.csMin || 0) + (r.engMin || 0) + (r.polMin || 0) + (r.projectMin || 0);
    }).sort((a, b) => a - b);
    historyMedian.minutes = minutesList[Math.floor(minutesList.length / 2)];
  }

  return {
    availableMinutes,
    phase: settings.phase || 'foundation',
    coreRatioTarget: settings.coreRatio ? settings.coreRatio / 100 : 0.65,
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
  return `<div class="sync-indicator" aria-live="polite"><span>${text}</span></div>`;
}

/**
 * Render a single plan task card.
 */
function renderTaskCard(task, index) {
  const contract = task.contract || {};
  const artifacts = Array.isArray(contract.required_artifacts)
    ? contract.required_artifacts.join(', ')
    : '';
  const requiredProblems = contract.required_problem_count || 0;

  return `
    <article class="plan-card" data-task-index="${index}" data-task-id="${task.id || index}" tabindex="0" role="listitem">
      <div class="plan-card-head">
        <label class="plan-card-check">
          <input type="checkbox" class="task-complete-check" data-task-index="${index}"
            aria-label="标记任务完成: ${task.title || task.topicId || ''}" />
        </label>
        <div class="plan-card-info">
          <span class="plan-card-subject">${task.subject || ''}</span>
          <strong class="plan-card-title">${task.title || task.topicId || '学习任务'}</strong>
          <em class="plan-card-time">${task.estimatedMinutes || 0} 分钟</em>
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
        <input class="date-input" type="date" id="tv-entry-date" value="${today}" aria-label="记录日期" />
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
  const reviewItems = StateManager.getState('review_items') || [];
  const dueItems = (Array.isArray(reviewItems) ? reviewItems : [])
    .filter(item => item.nextDueAt && item.nextDueAt <= today);
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

    return `
      <article class="review-item" data-review-index="${i}" data-topic-id="${item.topicId}" tabindex="0">
        <div class="review-item-info">
          <strong>${item.topicId || item.topic || '未命名'}</strong>
          <span class="review-interval">${intervalLabel}</span>
          ${item.failStreak > 0 ? `<span class="review-fail-streak">连续失败: ${item.failStreak}</span>` : ''}
          ${deferredMark}
        </div>
        <div class="review-item-actions" role="group" aria-label="复习结果">
          <button type="button" class="review-pass-btn" data-topic-id="${item.topicId}" aria-label="通过: ${item.topicId}">通过</button>
          <button type="button" class="review-fail-btn" data-topic-id="${item.topicId}" aria-label="未通过: ${item.topicId}">未通过</button>
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
  StateManager.setState('today.tasks', tasks);

  const focusOnly = density === 'focus';

  let html = `<section class="view today-view active">`;
  html += renderSyncStatus();
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

  const index = parseInt(checkbox.dataset.taskIndex, 10);
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

  const index = parseInt(btn.dataset.taskIndex, 10);
  const tasks = StateManager.getState('today.tasks') || [];
  const task = tasks[index];
  if (!task) return;

  const formEl = containerEl.querySelector(`.plan-card-completion-form[data-task-index="${index}"]`);
  if (!formEl) return;

  const problemsInput = formEl.querySelector('.completion-problems');
  const correctInput = formEl.querySelector('.completion-correct');
  const artifactsSelect = formEl.querySelector('.completion-artifacts');
  const errorsEl = formEl.querySelector('.completion-errors');

  const problemCount = parseInt(problemsInput.value, 10) || 0;
  const correctCount = correctInput.value !== '' ? parseInt(correctInput.value, 10) : undefined;
  const selectedArtifacts = Array.from(artifactsSelect.selectedOptions).map(o => o.value);

  // Build validation payload
  const payload = {
    problem_count: problemCount,
    correct_count: correctCount,
    artifacts: selectedArtifacts,
  };

  // Build task contract for validation
  const taskContract = {
    required_artifacts: task.contract?.required_artifacts || task.required_artifacts || [],
    required_problem_count: task.contract?.required_problem_count || task.required_problem_count || 0,
  };

  const result = validateCompletion(taskContract, payload);

  if (!result.valid) {
    errorsEl.textContent = result.errors.join('; ');
    errorsEl.style.display = 'block';
    return;
  }

  // Validation passed — mark completed
  errorsEl.style.display = 'none';
  const card = containerEl.querySelector(`.plan-card[data-task-index="${index}"]`);
  if (card) {
    card.classList.add('completed');
    formEl.style.display = 'none';
  }

  // Emit task completion event
  EventBus.emit(EVENTS.TASK_COMPLETED, {
    taskId: task.id || index,
    topicId: task.topicId,
    subject: task.subject,
    payload,
  });

  // Add to review queue
  const reviewItems = StateManager.getState('review_items') || [];
  const today = getToday();
  if (task.topicId && !reviewItems.find(r => r.topicId === task.topicId)) {
    reviewItems.push({
      topicId: task.topicId,
      addedAt: today,
      nextDueAt: addDaysStr(today, 1),
      intervalIndex: 0,
      lastResult: null,
      failStreak: 0,
      lastSubmittedDate: null,
    });
    StateManager.setState('review_items', reviewItems);
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

  const topicId = btn.dataset.topicId;
  const today = getToday();
  const reviewItems = StateManager.getState('review_items') || [];
  const itemIndex = reviewItems.findIndex(r => r.topicId === topicId);
  if (itemIndex === -1) return;

  const item = reviewItems[itemIndex];

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

  StateManager.setState('review_items', reviewItems);
  EventBus.emit(EVENTS.REVIEW_RESULT, { topicId, result: isPass ? 'pass' : 'fail' });

  // Re-render review section
  const reviewPanel = containerEl.querySelector('.today-review-panel');
  if (reviewPanel) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderReviewQueue();
    reviewPanel.replaceWith(tempDiv.firstElementChild);
  }
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
  const date = dateInput ? dateInput.value : getToday();

  const record = {
    date,
    mathMin: parseInt(containerEl.querySelector('#tv-mathMin')?.value, 10) || 0,
    csMin: parseInt(containerEl.querySelector('#tv-csMin')?.value, 10) || 0,
    engMin: parseInt(containerEl.querySelector('#tv-engMin')?.value, 10) || 0,
    polMin: parseInt(containerEl.querySelector('#tv-polMin')?.value, 10) || 0,
    projectMin: parseInt(containerEl.querySelector('#tv-projectMin')?.value, 10) || 0,
    mathProblems: parseInt(containerEl.querySelector('#tv-mathProblems')?.value, 10) || 0,
    csProblems: parseInt(containerEl.querySelector('#tv-csProblems')?.value, 10) || 0,
    readingCount: parseInt(containerEl.querySelector('#tv-readingCount')?.value, 10) || 0,
    newMistakes: parseInt(containerEl.querySelector('#tv-newMistakes')?.value, 10) || 0,
    fixedMistakes: parseInt(containerEl.querySelector('#tv-fixedMistakes')?.value, 10) || 0,
    nextTask: containerEl.querySelector('#tv-nextTask')?.value || '',
    createdAt: new Date().toISOString(),
  };

  // Optimistic update — immediate visual feedback (< 200ms)
  const feedbackEl = containerEl.querySelector('.tv-submit-feedback');
  if (feedbackEl) {
    feedbackEl.textContent = '✓ 记录已保存';
    feedbackEl.style.display = 'block';
    feedbackEl.className = 'tv-submit-feedback success';
  }

  // Save to state
  const records = StateManager.getState('daily_records') || {};
  records[date] = record;
  StateManager.setState('daily_records', records);
  StateManager.markDirty('daily_records', date);

  // Also write to offline cache for sync
  OfflineCache.setDirty('daily_records', date, record);

  // Clear form
  const form = containerEl.querySelector('#tv-entry-form');
  if (form) form.reset();
  if (dateInput) dateInput.value = getToday();

  // Delayed sync status feedback
  setTimeout(() => {
    if (feedbackEl) {
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
  StateManager.setState('today.tasks', tasks);

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = renderDailyPlan(tasks);
  planPanel.replaceWith(tempDiv.firstElementChild);

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
}

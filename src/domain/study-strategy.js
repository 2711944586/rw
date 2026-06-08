const VALID_SUBJECTS = ['math', 'cs408', 'english', 'politics', 'review', 'project'];
const CORE_SUBJECTS = new Set(['math', 'cs408']);

export const DEFAULT_PLAN_CONTROLS = {
  planIntensity: 'normal',
  focusSubject: 'auto',
  experienceTrack: 'balanced',
  reviewLoad: 25,
  maxNewTopics: 3,
  rollingWindowDays: 30,
  enabledSubjects: ['math', 'cs408', 'english', 'politics', 'review', 'project'],
};

export const strategySources = [
  {
    title: '官方科目基准',
    source: '北大软微 2026 招生说明',
    use: '01-04 方向按政治、英语一、数学一、408 作为当前备考基准，2028 入学仍需当年复核。',
  },
  {
    title: '408 经验共识',
    source: '王道/天勤体系与公开经验帖综合',
    use: '跨考先补 C 与数据结构，随后计组、OS、计网；每章必须有题量、图示、伪代码和错题归档。',
  },
  {
    title: '数学经验共识',
    source: '张宇/武忠祥等数学规划与高分经验帖综合',
    use: '基础期重概念和基础题，强化期重题型，真题期严格限时；错题按识别信号回炉。',
  },
  {
    title: '英语经验共识',
    source: '唐迟等阅读方法与经验帖综合',
    use: '单词每天不断档，阅读以定位句、同义替换、干扰项原因和精读复盘为核心；低负荷日也保留 20 分钟微积累。',
  },
  {
    title: '政治经验共识',
    source: '肖秀荣/腿姐/徐涛等后期资料使用经验综合',
    use: '政治不宜过早挤占核心时间，暑期后启动选择题，考前再强化主观题和时政。',
  },
  {
    title: '学习科学依据',
    source: 'practice testing / distributed practice / retrieval practice',
    use: '计划默认用主动回忆、间隔复盘和可验收产出，而不是只把视频或阅读时长写进计划。',
  },
];

export const phaseStrategies = {
  A: {
    label: '启动与补前置',
    method: '低强度建立记录，数学预备、C 语言、单词不断档。',
    reviewRule: '只做轻量 D+1，避免刚启动就被复盘债务压住。',
  },
  B: {
    label: '暑假奠基',
    method: '高数基础、数据结构一轮、英语阅读入门同步推进。',
    reviewRule: '错题 D+1/D+3 必清，周末合并同类错因。',
  },
  C: {
    label: '第一轮主干',
    method: '数学三大模块和 408 四门建立完整框架，核心占比维持 65%+。',
    reviewRule: '复盘必须挂回考纲小节，过期 7 天视作未掌握。',
  },
  D: {
    label: '寒假闭合',
    method: '第一轮收口，补齐概率、OS、计网，形成知识图。',
    reviewRule: 'D+14 复盘要从题目回到章节框架。',
  },
  E: {
    label: '强化专题',
    method: '分章节真题和题型强化，弱项按 14 天趋势滚动补。',
    reviewRule: '错题回炉率低于 70% 时减少新题。',
  },
  F: {
    label: '真题套卷',
    method: '数学和 408 进入限时套卷，英语作文启动，政治选择题启动。',
    reviewRule: '套卷后 48 小时完成错题复盘和二次归因。',
  },
  G: {
    label: '报名校准',
    method: '核验招生信息，近 5 套全科均分决定是否准备稳妥梯队。',
    reviewRule: '只保留高频错题、公式链和大题表达规范。',
  },
  H: {
    label: '考前收束',
    method: '模拟、错题、背诵和手感维持，不再大规模开新内容。',
    reviewRule: 'D+30 月度回炉和考前清单合并执行。',
  },
};

export const syllabusFrameworks = {
  math: [
    ['高等数学', '极限连续、一元微积分、多元微积分、级数、微分方程', '先定义公式，后题型识别，最后证明与综合。'],
    ['线性代数', '行列式、矩阵、向量组、方程组、特征值、二次型', '围绕秩、线性相关和特征结构串联。'],
    ['概率统计', '随机事件、随机变量、数字特征、大数定律、参数估计', '先建模，再写分布和公式条件。'],
  ],
  cs408: [
    ['数据结构', '线性表、栈队列、树图、查找排序、算法复杂度', '每章输出伪代码、过程图和复杂度。'],
    ['计算机组成原理', '数据表示、运算器、指令、CPU、存储、I/O', '先画数据通路和地址字段，再做计算。'],
    ['操作系统', '进程线程、同步死锁、内存、文件、设备', '状态转换、PV、页表和调度必须手推。'],
    ['计算机网络', '体系结构、链路层、网络层、传输层、应用层', '协议解决什么问题、报文如何流动、代价是什么。'],
  ],
  english: [
    ['词汇与语法', '核心词、熟词僻义、长难句、翻译顺序', '每天不断档，在真题语境里复现。'],
    ['阅读理解', '定位、同义替换、题型、干扰项', '精读不是全文翻译，而是复盘证据句。'],
    ['写作与翻译', '小作文、大作文、翻译、新题型、完形', '后期模板定稿，限时写作和纠错同步。'],
  ],
  politics: [
    ['基础框架', '马原、毛中特、史纲、思修法基', '暑期后启动选择题，先理解框架。'],
    ['时政与当代', '年度会议、热点专题、官方表述', '当年材料发布后刷新，不提前押死。'],
    ['主观题', '关键词、材料定位、答题层次', '11-12 月集中背诵和默写。'],
  ],
};

export function normalizePlanControls(raw = {}) {
  const next = { ...DEFAULT_PLAN_CONTROLS, ...(raw || {}) };
  if (!['bottomline', 'normal', 'strong'].includes(next.planIntensity)) next.planIntensity = 'normal';
  if (!['auto', ...VALID_SUBJECTS].includes(next.focusSubject)) next.focusSubject = 'auto';
  if (!['balanced', 'mathHeavy', 'cs408Heavy', 'englishSteady', 'latePolitics'].includes(next.experienceTrack)) {
    next.experienceTrack = 'balanced';
  }
  next.reviewLoad = clampInt(next.reviewLoad, 15, 60);
  next.maxNewTopics = clampInt(next.maxNewTopics, 0, 4);
  next.rollingWindowDays = clampInt(next.rollingWindowDays, 7, 60);
  const enabled = Array.isArray(next.enabledSubjects) ? next.enabledSubjects : DEFAULT_PLAN_CONTROLS.enabledSubjects;
  next.enabledSubjects = [...new Set(enabled.filter((item) => VALID_SUBJECTS.includes(item)))];
  if (!next.enabledSubjects.some((item) => CORE_SUBJECTS.has(item))) {
    next.enabledSubjects.push('math', 'cs408');
  }
  if (!next.enabledSubjects.includes('review')) next.enabledSubjects.push('review');
  return next;
}

export function subjectKey(label = '') {
  const map = {
    '数学': 'math',
    '数学一': 'math',
    '408': 'cs408',
    '英语': 'english',
    '英语一': 'english',
    '政治': 'politics',
    '复盘': 'review',
    '补弱': 'review',
    '项目': 'project',
  };
  return map[label] || label;
}

export function subjectLabel(key = '') {
  return {
    math: '数学',
    cs408: '408',
    english: '英语',
    politics: '政治',
    review: '复盘',
    project: '项目',
  }[key] || key;
}

export function isSubjectEnabled(subject, controls = DEFAULT_PLAN_CONTROLS) {
  const normalized = normalizePlanControls(controls);
  return normalized.enabledSubjects.includes(subjectKey(subject));
}

export function getPhaseStrategy(phaseId, track = 'balanced') {
  const base = phaseStrategies[phaseId] || phaseStrategies.A;
  const trackText = {
    balanced: '四科均衡执行，数学和 408 保持主线。',
    mathHeavy: '数学优先，适合数学进度落后或目标 130+。',
    cs408Heavy: '408 优先，适合跨考补计算机体系。',
    englishSteady: '英语每日不断档，阅读精读优先。',
    latePolitics: '政治后置，暑期后再逐步加量。',
  }[track] || '';
  return { ...base, trackText };
}

export function subjectPlanWeights(phaseId, controls = DEFAULT_PLAN_CONTROLS) {
  const normalized = normalizePlanControls(controls);
  const politicsActive = ['F', 'G', 'H'].includes(phaseId);
  const weights = {
    math: phaseId === 'A' ? 0.35 : 0.33,
    cs408: phaseId === 'A' ? 0.35 : 0.35,
    english: phaseId === 'A' ? 0.16 : 0.14,
    politics: politicsActive ? 0.12 : 0,
    review: phaseId === 'A' ? 0.08 : 0.10,
    project: ['D', 'F'].includes(phaseId) ? 0.04 : 0,
  };

  if (normalized.experienceTrack === 'mathHeavy') weights.math += 0.08;
  if (normalized.experienceTrack === 'cs408Heavy') weights.cs408 += 0.08;
  if (normalized.experienceTrack === 'englishSteady') weights.english += 0.07;
  if (normalized.experienceTrack !== 'latePolitics') weights.english = Math.max(weights.english, phaseId === 'A' ? 0.16 : 0.12);
  if (normalized.experienceTrack === 'latePolitics' && !['G', 'H'].includes(phaseId)) weights.politics = 0;
  if (normalized.focusSubject !== 'auto' && weights[normalized.focusSubject] !== undefined) {
    weights[normalized.focusSubject] += normalized.focusSubject === 'review' ? 0.08 : 0.10;
  }

  for (const subject of Object.keys(weights)) {
    if (!normalized.enabledSubjects.includes(subject)) weights[subject] = 0;
  }
  if (weights.math === 0 && weights.cs408 === 0) {
    weights.math = 0.34;
    weights.cs408 = 0.34;
  }

  const total = Object.values(weights).reduce((sum, item) => sum + item, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total]));
}

export function applyPlanControls(tasks, context = {}) {
  const controls = normalizePlanControls(context.controls);
  const targetCount = clampInt(context.targetCount || 3, 1, 6);
  const budget = clampInt(context.budget || 0, 0, 1440);
  const focus = controls.focusSubject;
  let newCount = 0;

  const scored = (tasks || [])
    .filter((task) => task && isSubjectEnabled(task.subject, controls))
    .map((task, index) => {
      const key = subjectKey(task.subject);
      const isReview = key === 'review' || task.reviewItemId || task.source === 'carryover';
      const isNew = !isReview;
      let score = (task.priority || index + 1) * 10;
      if (task.source === 'carryover') score -= 100;
      if (task.reviewItemId) score -= 90;
      if (focus !== 'auto' && key === focus) score -= 35;
      if (CORE_SUBJECTS.has(key)) score -= 8;
      return { ...task, _strategyScore: score, _isNew: isNew };
    })
    .sort((a, b) => a._strategyScore - b._strategyScore);

  const selected = [];
  for (const task of scored) {
    if (selected.length >= targetCount) break;
    if (task._isNew && newCount >= controls.maxNewTopics) continue;
    selected.push(task);
    if (task._isNew) newCount += 1;
  }

  const withBudget = fitBudget(selected.length ? selected : scored.slice(0, targetCount), budget);
  return withBudget.map(({ _strategyScore, _isNew, ...task }, index) => ({ ...task, priority: index + 1 }));
}

export function buildRollingReviewWindows(reviewItems = [], today, options = {}) {
  const controls = normalizePlanControls(options.controls);
  const windows = [
    { key: 'overdue', label: '逾期', from: -9999, to: -1, count: 0, minutes: 0 },
    { key: 'today', label: '今日', from: 0, to: 0, count: 0, minutes: 0 },
    { key: 'soon', label: '1-3天', from: 1, to: 3, count: 0, minutes: 0 },
    { key: 'week', label: '4-7天', from: 4, to: 7, count: 0, minutes: 0 },
    { key: 'halfMonth', label: '8-14天', from: 8, to: 14, count: 0, minutes: 0 },
    { key: 'month', label: '15-30天', from: 15, to: controls.rollingWindowDays, count: 0, minutes: 0 },
  ];

  for (const item of reviewItems || []) {
    if (!item || item.done || item.status === 'done') continue;
    const due = item.dueDate || item.nextDueAt;
    if (!due) continue;
    const days = diffDays(due, today);
    const bucket = windows.find((window) => days >= window.from && days <= window.to);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.minutes += estimateReviewMinutes(item, controls.reviewLoad);
  }
  return windows;
}

export function reviewLoadSignal(reviewItems = [], today, controls = DEFAULT_PLAN_CONTROLS) {
  const windows = buildRollingReviewWindows(reviewItems, today, { controls });
  const due = windows.find((item) => item.key === 'today')?.count || 0;
  const overdue = windows.find((item) => item.key === 'overdue')?.count || 0;
  const next7 = windows.filter((item) => ['today', 'soon', 'week'].includes(item.key)).reduce((sum, item) => sum + item.count, 0);
  if (overdue > 0) return { level: 'risk', label: `${overdue} 项逾期`, action: '先清逾期复盘，今日减少新内容。' };
  if (due >= 4 || next7 >= 10) return { level: 'warn', label: `${next7} 项 7 天内`, action: '复盘债务偏高，建议把新考点上限调到 1-2。' };
  if (due > 0) return { level: 'ok', label: `${due} 项今日到期`, action: '先完成到期复盘，再开新内容。' };
  return { level: 'ok', label: '队列健康', action: '保持 D+1/D+3/D+7/D+14/D+30 滚动。' };
}

export function recommendPlanAdjustment(metrics = {}, controls = DEFAULT_PLAN_CONTROLS, phaseId = 'A') {
  const normalized = normalizePlanControls(controls);
  const phase = getPhaseStrategy(phaseId, normalized.experienceTrack);
  const activeDays = metrics.activeDays || 0;
  const coreRatio = metrics.coreRatio || 0;
  const mistakeRecovery = metrics.mistakeRecovery ?? 1;
  if (activeDays > 0 && activeDays <= 3) return '先降到底线日，连续恢复 3 天后再加量。';
  if (coreRatio > 0 && coreRatio < 0.6) return '数学和 408 占比偏低，下次计划把聚焦科目设为数学或 408。';
  if (mistakeRecovery < 0.7) return '错题回炉率偏低，把新考点上限降到 1-2，并优先复盘。';
  return phase.trackText || phase.method;
}

export function getSyllabusFramework(subject) {
  return syllabusFrameworks[subject] || [];
}

function estimateReviewMinutes(item, fallback) {
  const roundText = String(item.round || '');
  if (roundText.includes('30')) return Math.max(20, fallback);
  if (roundText.includes('14') || roundText.includes('7')) return Math.max(15, Math.round(fallback * 0.8));
  return Math.max(10, Math.round(fallback * 0.6));
}

function fitBudget(tasks, budget) {
  if (!budget) return tasks;
  let selected = [...tasks];
  while (selected.length > 1 && selected.reduce((sum, task) => sum + (task.minutes || 0), 0) > budget) {
    const removeIndex = selected.findLastIndex((task) => !task.reviewItemId && task.source !== 'carryover');
    selected.splice(removeIndex >= 0 ? removeIndex : selected.length - 1, 1);
  }
  return selected;
}

function diffDays(dateStr, baseStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const base = new Date(`${baseStr}T00:00:00Z`);
  return Math.round((date - base) / 86400000);
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

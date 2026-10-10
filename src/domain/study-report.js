/**
 * Weekly and monthly study reports.
 * Facts, experience-based advice, and unverified inferences stay separate.
 * Empty series are missing, never a zero score.
 */

function hours(minutes) {
  return Math.round((Number(minutes) || 0) / 6) / 10;
}

export function buildStudyReport({
  period = 'week',
  minutes = null,
  taskDelta = null,
  dueReviews = null,
  weakTopics = [],
  mockDelta = null,
} = {}) {
  const facts = [];
  if (minutes == null) facts.push('本周期有效学习分钟缺失，不记为 0。');
  else facts.push(`有效学习 ${hours(minutes)} 小时。`);
  if (taskDelta == null) facts.push('任务完成差额缺失。');
  else facts.push(`任务完成差额 ${taskDelta} 项。`);
  if (dueReviews == null) facts.push('到期复盘数量缺失。');
  else facts.push(`到期复盘 ${dueReviews} 项。`);
  if (mockDelta == null) facts.push('模考变化缺失，不把空数据当成 0 分。');
  else facts.push(`最近模考总分变化 ${mockDelta}。`);

  const weakest = Array.isArray(weakTopics) ? weakTopics.filter(Boolean).slice(0, 3) : [];
  const progress = minutes != null && minutes > 0 ? '本周期留下了可核对的学习分钟。' : '还没有足够分钟，先完成一次记录。';
  const problem = weakest[0]
    ? `薄弱考点集中在${weakest[0]}。`
    : (dueReviews > 0 ? '到期复盘还没有清完。' : '还没有足够错题样本指出一个薄弱考点。');
  const action = dueReviews > 0
    ? '下周期先清一项到期复盘，再加新内容。'
    : '下周期保持一项核心科目的闭卷练习。';

  return {
    period,
    progress,
    problem,
    action,
    facts,
    advice: [action],
    inferences: weakest.length ? [`薄弱列表来自已记录错题：${weakest.join('、')}。`] : [],
    missing: [minutes, taskDelta, dueReviews, mockDelta].filter((value) => value == null).length,
    evidenceLinks: ['#records', '#review', '#scores'],
  };
}

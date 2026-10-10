/**
 * Split study evidence into effort and outcome.
 * A chart must name its window and must not treat a missing score as 0.
 */

export function effortSnapshot(entries = []) {
  const rows = Array.isArray(entries) ? entries : [];
  const minutes = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const problems = rows.reduce((sum, row) => sum + (Number(row.mathProblems) || 0) + (Number(row.csProblems) || 0), 0);
  return {
    kind: 'effort',
    window: '所选记录',
    minutes,
    tasks: rows.length,
    problems,
    missing: rows.length === 0,
  };
}

export function outcomeSnapshot({ accuracy = null, retention = null, mockTotal = null } = {}) {
  return {
    kind: 'outcome',
    window: '已提交结果',
    accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    retention: Number.isFinite(Number(retention)) ? Number(retention) : null,
    mockTotal: Number.isFinite(Number(mockTotal)) ? Number(mockTotal) : null,
    missingStrategy: '缺失保持为空，不显示为 0 分。',
  };
}

export function weeklyDiagnosis({ improvement = '', problem = '', action = '', evidence = [] } = {}) {
  return {
    improvement: improvement || '本周还没有可对照的进步样本。',
    problem: problem || '本周还没有足够错因指出一个主要问题。',
    action: action || '下一周只增加一项可验收的核心练习。',
    evidence: Array.isArray(evidence) ? evidence : [],
    canOverride: true,
    rewritesLockedTasks: false,
  };
}

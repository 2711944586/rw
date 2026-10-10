/**
 * Optional on-device review prompt.
 * Disabled by default. It never calls a network and never invents an admission rule.
 */

function lines(mistakes) {
  return (Array.isArray(mistakes) ? mistakes : [])
    .map((item) => (typeof item?.summary === 'string' ? item.summary.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

export function localReviewPrompt({ enabled = false, mistakes = [] } = {}) {
  if (!enabled) {
    return {
      enabled: false,
      leavesDevice: false,
      refusesPolicy: true,
      text: '',
    };
  }
  const sample = lines(mistakes);
  const text = sample.length
    ? `本机整理：先重做这 ${sample.length} 条错题——${sample.join('；')}。这不是录取建议，也不会发到外部服务。`
    : '本机整理：还没有错题摘要。先记一条错因，再来看提示。';
  return {
    enabled: true,
    leavesDevice: false,
    refusesPolicy: true,
    text,
  };
}

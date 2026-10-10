import { describe, expect, it } from 'vitest';
import { createMistake, mistakesForTopic, transitionMistake } from '../../src/domain/mistake-record.js';

describe('mistake records', () => {
  it('keeps status history and can be found from a topic', () => {
    const created = createMistake({
      id: 'm1',
      subject: '数学',
      topicId: 'math/limit',
      summary: '左右极限漏了条件',
      errorType: '概念',
    }, new Date('2026-10-10T00:00:00.000Z'));
    const mastered = transitionMistake(created, 'mastered', new Date('2026-10-11T00:00:00.000Z'));
    expect(mastered.status).toBe('mastered');
    expect(mastered.history).toHaveLength(1);
    expect(mistakesForTopic([mastered, { topicId: 'other', status: 'needs-retry' }], 'math/limit')).toEqual([mastered]);
    expect(mistakesForTopic([transitionMistake(mastered, 'archived')], 'math/limit')).toEqual([]);
  });
});

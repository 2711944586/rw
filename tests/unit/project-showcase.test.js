import { describe, it, expect } from 'vitest';
import { desensitizeData, validateShowcaseItem } from '../../src/domain/project-showcase.js';

describe('project-showcase', () => {
  describe('desensitizeData', () => {
    it('returns empty object for null/undefined input', () => {
      expect(desensitizeData(null)).toEqual({});
      expect(desensitizeData(undefined)).toEqual({});
    });

    it('removes email, phone, and real_name', () => {
      const userData = {
        email: 'test@example.com',
        phone: '13800138000',
        real_name: '张三',
        study_hours: 100
      };
      const result = desensitizeData(userData);
      expect(result.email).toBeUndefined();
      expect(result.phone).toBeUndefined();
      expect(result.real_name).toBeUndefined();
      expect(result.study_hours).toBe(100);
    });

    it('does not mutate the original object', () => {
      const userData = { email: 'test@example.com', name: 'visible' };
      const original = { ...userData };
      desensitizeData(userData);
      expect(userData).toEqual(original);
    });

    it('drops circular references and redacts malformed row arrays safely', () => {
      const userData = {
        email: 'test@example.com',
        source_registry: [
          null,
          { claim_id: '1', notes: 'internal note', internal_notes: 'secret' }
        ],
        topic_progress: [
          'bad-row',
          { topicId: 't1', name: '导数定义', mastery_status: 'mastered' }
        ],
      };
      userData.self = userData;

      const result = desensitizeData(userData);

      expect(result.email).toBeUndefined();
      expect(result.self).toBeUndefined();
      expect(result.source_registry[0]).toBeNull();
      expect(result.source_registry[1]).toMatchObject({ claim_id: '1' });
      expect(result.source_registry[1].notes).toBeUndefined();
      expect(result.source_registry[1].internal_notes).toBeUndefined();
      expect(result.topic_progress[0]).toBe('bad-row');
      expect(result.topic_progress[1].name).toBeUndefined();
      expect(result.topic_progress[1].topicId).toBe('t1');
    });

    it('removes source_registry internal notes', () => {
      const userData = {
        source_registry: [
          { claim_id: '1', notes: 'internal note', internal_notes: 'secret' }
        ]
      };
      const result = desensitizeData(userData);
      expect(result.source_registry[0].notes).toBeUndefined();
      expect(result.source_registry[0].internal_notes).toBeUndefined();
      expect(result.source_registry[0].claim_id).toBe('1');
    });

    it('removes source_registry_notes field', () => {
      const userData = { source_registry_notes: 'some notes' };
      const result = desensitizeData(userData);
      expect(result.source_registry_notes).toBeUndefined();
    });

    it('removes conflicts table data', () => {
      const userData = {
        conflicts: [{ id: '1', loser_payload: {} }],
        study_hours: 50
      };
      const result = desensitizeData(userData);
      expect(result.conflicts).toBeUndefined();
      expect(result.study_hours).toBe(50);
    });

    it('redacts topic names', () => {
      const userData = {
        topics: [{ id: '1', name: '导数定义', mastery: 0.8 }]
      };
      const result = desensitizeData(userData);
      expect(result.topics[0].name).toBeUndefined();
      expect(result.topics[0].mastery).toBe(0.8);
    });

    it('redacts mistake/error content', () => {
      const userData = {
        mistakes: [{ id: '1', content: 'my mistake', topic_id: 't1' }]
      };
      const result = desensitizeData(userData);
      expect(result.mistakes[0].content).toBeUndefined();
      expect(result.mistakes[0].topic_id).toBe('t1');
    });

    it('redacts retrospective text', () => {
      const userData = {
        retrospectives: [{ id: '1', text: 'personal reflection', date: '2025-01-01' }]
      };
      const result = desensitizeData(userData);
      expect(result.retrospectives[0].text).toBeUndefined();
      expect(result.retrospectives[0].date).toBe('2025-01-01');
    });

    it('removes retro_text field', () => {
      const userData = { retro_text: 'my retro' };
      const result = desensitizeData(userData);
      expect(result.retro_text).toBeUndefined();
    });
  });

  describe('validateShowcaseItem', () => {
    it('returns invalid for null/undefined', () => {
      expect(validateShowcaseItem(null).valid).toBe(false);
      expect(validateShowcaseItem(undefined).valid).toBe(false);
    });

    it('returns valid when all 3 fields are filled', () => {
      const item = { artifact_type: 'code', item_date: '2025-01-01', output_link: 'https://x.com' };
      const result = validateShowcaseItem(item);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid when exactly 2 fields are filled', () => {
      expect(validateShowcaseItem({ artifact_type: 'code', item_date: '2025-01-01' }).valid).toBe(true);
      expect(validateShowcaseItem({ artifact_type: 'code', output_link: 'https://x.com' }).valid).toBe(true);
      expect(validateShowcaseItem({ item_date: '2025-01-01', output_link: 'https://x.com' }).valid).toBe(true);
    });

    it('rejects unsafe output links even when other fields are filled', () => {
      const unsafeLinks = [
        'javascript:alert(1)',
        '/relative/path',
        '//example.com/path',
        'ftp://example.com/file'
      ];

      for (const output_link of unsafeLinks) {
        const result = validateShowcaseItem({
          artifact_type: 'code',
          item_date: '2025-01-01',
          output_link
        });

        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('absolute http(s) URL');
      }
    });

    it('returns invalid when only 1 field is filled', () => {
      const result = validateShowcaseItem({ artifact_type: 'code' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns invalid when no fields are filled', () => {
      const result = validateShowcaseItem({});
      expect(result.valid).toBe(false);
    });

    it('treats empty string as not filled', () => {
      const result = validateShowcaseItem({ artifact_type: '', item_date: '', output_link: '' });
      expect(result.valid).toBe(false);
    });

    it('treats whitespace-only strings as not filled', () => {
      const result = validateShowcaseItem({ artifact_type: '  ', item_date: '\t', output_link: ' \n ' });
      expect(result.valid).toBe(false);
    });

    it('treats null values as not filled', () => {
      const result = validateShowcaseItem({ artifact_type: null, item_date: '2025-01-01', output_link: null });
      expect(result.valid).toBe(false);
    });

    it('does not count object-like fields as filled', () => {
      const result = validateShowcaseItem({
        artifact_type: { bad: true },
        item_date: { bad: true },
        output_link: { bad: true },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).not.toContain('[object Object]');
    });

    it('requires item_date to be a valid calendar date when present', () => {
      const invalid = validateShowcaseItem({ artifact_type: 'code', item_date: '2025-02-31' });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.join(' ')).toContain('valid YYYY-MM-DD date');

      const validDateObject = validateShowcaseItem({ artifact_type: 'code', item_date: new Date('2025-02-28T00:00:00Z') });
      expect(validDateObject.valid).toBe(true);

      const invalidDateObject = validateShowcaseItem({ artifact_type: 'code', item_date: new Date('bad-date') });
      expect(invalidDateObject.valid).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeVerificationStatus,
  filterDisplayableClaims,
  renderClaimHTML,
  isVerificationGateActive
} from '../../src/domain/source-registry.js';

describe('source-registry', () => {
  describe('computeVerificationStatus', () => {
    it('returns "verified" when gap < 90 days', () => {
      expect(computeVerificationStatus('2024-01-01', '2024-03-01')).toBe('verified');
    });

    it('returns "pending" when gap is 90-179 days', () => {
      expect(computeVerificationStatus('2024-01-01', '2024-05-01')).toBe('pending');
    });

    it('returns "outdated" when gap >= 180 days', () => {
      expect(computeVerificationStatus('2024-01-01', '2024-08-01')).toBe('outdated');
    });

    it('returns "verified" when same day', () => {
      expect(computeVerificationStatus('2024-06-15', '2024-06-15')).toBe('verified');
    });

    it('returns "pending" at exactly 90 days', () => {
      expect(computeVerificationStatus('2024-01-01', '2024-03-31')).toBe('pending');
    });

    it('returns "outdated" at exactly 180 days', () => {
      expect(computeVerificationStatus('2024-01-01', '2024-06-29')).toBe('outdated');
    });

    it('treats malformed verification dates as outdated', () => {
      expect(computeVerificationStatus('not-a-date', '2024-06-29')).toBe('outdated');
      expect(computeVerificationStatus('2024-02-31', '2024-06-29')).toBe('outdated');
      expect(computeVerificationStatus('2024-01-01', 'not-a-date')).toBe('outdated');
      expect(computeVerificationStatus(null, '2024-06-29')).toBe('outdated');
    });

    it('treats future verification dates as outdated', () => {
      expect(computeVerificationStatus('2024-07-01', '2024-06-29')).toBe('outdated');
    });
  });

  describe('filterDisplayableClaims', () => {
    it('returns claims with non-empty source_url', () => {
      const claims = [
        { claim_id: '1', source_url: 'https://example.com' },
        { claim_id: '2', source_url: '' },
        { claim_id: '3', source_url: 'https://pku.edu.cn' }
      ];
      const result = filterDisplayableClaims(claims);
      expect(result).toHaveLength(2);
      expect(result[0].claim_id).toBe('1');
      expect(result[1].claim_id).toBe('3');
    });

    it('excludes claims with null source_url', () => {
      const claims = [{ claim_id: '1', source_url: null }];
      expect(filterDisplayableClaims(claims)).toHaveLength(0);
    });

    it('excludes claims with undefined source_url', () => {
      const claims = [{ claim_id: '1' }];
      expect(filterDisplayableClaims(claims)).toHaveLength(0);
    });

    it('excludes claims with unsafe or non-absolute source_url values', () => {
      const claims = [
        { claim_id: '1', source_url: 'javascript:alert(1)' },
        { claim_id: '2', source_url: '/relative/path' },
        { claim_id: '3', source_url: '//example.com/path' },
        { claim_id: '4', source_url: 'data:text/html,<script>alert(1)</script>' },
        { claim_id: '5', source_url: ' https://example.com/fact ' },
        { claim_id: '6', source_url: 'http://example.com/fact' }
      ];

      const result = filterDisplayableClaims(claims);
      expect(result.map((claim) => claim.claim_id)).toEqual(['5', '6']);
    });

    it('returns empty array for empty input', () => {
      expect(filterDisplayableClaims([])).toHaveLength(0);
    });

    it('returns empty array for non-array input', () => {
      expect(filterDisplayableClaims(null)).toHaveLength(0);
      expect(filterDisplayableClaims({ source_url: 'https://example.com' })).toHaveLength(0);
    });
  });

  describe('renderClaimHTML', () => {
    it('includes source_publisher in output', () => {
      const claim = {
        claim_text: 'Test claim',
        source_publisher: '北京大学',
        last_verified_at: '2024-06-01'
      };
      const html = renderClaimHTML(claim);
      expect(html).toContain('北京大学');
    });

    it('includes formatted last_verified_at date in output', () => {
      const claim = {
        claim_text: 'Test claim',
        source_publisher: 'Publisher',
        last_verified_at: '2024-06-01'
      };
      const html = renderClaimHTML(claim);
      expect(html).toContain('2024');
    });

    it('escapes HTML in claim text', () => {
      const claim = {
        claim_text: '<script>alert("xss")</script>',
        source_publisher: 'Publisher',
        last_verified_at: '2024-06-01'
      };
      const html = renderClaimHTML(claim);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes publisher HTML and falls back for invalid dates', () => {
      const html = renderClaimHTML({
        claim_text: 'Test claim',
        source_publisher: '<img src=x onerror="window.__publisherXss=1">',
        last_verified_at: '<img src=x onerror="window.__dateXss=1">'
      });

      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img src=x onerror=&quot;window.__publisherXss=1&quot;&gt;');
      expect(html).toContain('未知');
      expect(html).not.toContain('Invalid Date');
    });

    it('renders missing publisher without throwing', () => {
      const html = renderClaimHTML({
        claim_text: 'Test claim',
        last_verified_at: 'not-a-date'
      });

      expect(html).toContain('未知');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('Invalid Date');
    });

    it('keeps object claim text and publisher out of rendered HTML', () => {
      const html = renderClaimHTML({
        claim_text: { bad: true },
        source_publisher: { bad: true },
        last_verified_at: '2024-06-01'
      });

      expect(html).toContain('未知');
      expect(html).not.toContain('[object Object]');
    });
  });

  describe('isVerificationGateActive', () => {
    const admissionClaims = [
      { claim_id: '1', claim_type: 'admission_subject' }
    ];

    it('returns true when today >= 2027-09-01 and admission claims exist', () => {
      expect(isVerificationGateActive('2027-09-01', admissionClaims)).toBe(true);
    });

    it('returns true for later dates with admission claims', () => {
      expect(isVerificationGateActive('2027-12-01', admissionClaims)).toBe(true);
    });

    it('returns false when today < 2027-09-01', () => {
      expect(isVerificationGateActive('2027-08-31', admissionClaims)).toBe(false);
    });

    it('returns false when no admission-type claims exist', () => {
      const generalClaims = [{ claim_id: '1', claim_type: 'general' }];
      expect(isVerificationGateActive('2027-09-01', generalClaims)).toBe(false);
    });

    it('returns false for empty claims array', () => {
      expect(isVerificationGateActive('2027-09-01', [])).toBe(false);
    });

    it('returns false for malformed dates or non-array claims', () => {
      expect(isVerificationGateActive('not-a-date', admissionClaims)).toBe(false);
      expect(isVerificationGateActive('2027-09-01', null)).toBe(false);
      expect(isVerificationGateActive('2027-09-01', { claim_type: 'admission_subject' })).toBe(false);
    });

    it('detects all admission claim types', () => {
      const types = ['admission_subject', 'admission_score_line', 'admission_deadline', 'retest_rule'];
      for (const type of types) {
        expect(isVerificationGateActive('2027-09-01', [{ claim_type: type }])).toBe(true);
      }
    });

    it('ignores malformed claim rows without throwing', () => {
      expect(isVerificationGateActive('2027-09-01', [
        null,
        {},
        { claim_type: 'constructor' },
        { claim_type: 'admission_deadline' },
      ])).toBe(true);
    });
  });
});

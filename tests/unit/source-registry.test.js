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

    it('returns empty array for empty input', () => {
      expect(filterDisplayableClaims([])).toHaveLength(0);
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

    it('detects all admission claim types', () => {
      const types = ['admission_subject', 'admission_score_line', 'admission_deadline', 'retest_rule'];
      for (const type of types) {
        expect(isVerificationGateActive('2027-09-01', [{ claim_type: type }])).toBe(true);
      }
    });
  });
});

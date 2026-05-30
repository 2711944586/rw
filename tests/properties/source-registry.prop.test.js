import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  computeVerificationStatus,
  filterDisplayableClaims,
  renderClaimHTML,
  isVerificationGateActive
} from '../../src/domain/source-registry.js';

/**
 * Property 1: Fact claim staleness classification
 * **Validates: Requirements 1.3, 1.4**
 *
 * For any lastVerifiedAt and today date, computeVerificationStatus returns
 * "verified" if gap < 90d, "pending" if 90-180d, "outdated" if ≥ 180d
 */
describe('Property 1: Fact claim staleness classification', () => {
  // Arbitrary: a base date and a non-negative day gap
  const arbBaseDate = fc.date({
    min: new Date('2020-01-01'),
    max: new Date('2030-01-01'),
    noInvalidDate: true
  });
  const arbGapDays = fc.nat({ max: 365 * 5 });

  test.prop([arbBaseDate, arbGapDays])(
    'returns "verified" when gap < 90 days',
    (baseDate, gapDays) => {
      fc.pre(gapDays < 90);
      const lastVerified = baseDate.toISOString();
      const today = new Date(baseDate.getTime() + gapDays * 86400000).toISOString();
      expect(computeVerificationStatus(lastVerified, today)).toBe('verified');
    }
  );

  test.prop([arbBaseDate, arbGapDays])(
    'returns "pending" when gap >= 90 and < 180 days',
    (baseDate, gapDays) => {
      fc.pre(gapDays >= 90 && gapDays < 180);
      const lastVerified = baseDate.toISOString();
      const today = new Date(baseDate.getTime() + gapDays * 86400000).toISOString();
      expect(computeVerificationStatus(lastVerified, today)).toBe('pending');
    }
  );

  test.prop([arbBaseDate, arbGapDays])(
    'returns "outdated" when gap >= 180 days',
    (baseDate, gapDays) => {
      fc.pre(gapDays >= 180);
      const lastVerified = baseDate.toISOString();
      const today = new Date(baseDate.getTime() + gapDays * 86400000).toISOString();
      expect(computeVerificationStatus(lastVerified, today)).toBe('outdated');
    }
  );
});

/**
 * Property 2: Fact claim render includes source metadata
 * **Validates: Requirements 1.2**
 *
 * For any claim with non-empty source_publisher and last_verified_at,
 * renderClaimHTML output contains both publisher name and formatted date.
 */
describe('Property 2: Fact claim render includes source metadata', () => {
  // Only use alphanumeric publishers to avoid HTML escaping issues in assertion
  const arbPublisher = fc.stringMatching(/^[a-zA-Z0-9 ]+$/, { minLength: 1, maxLength: 50 }).filter(
    (s) => s.trim().length > 0
  );
  const arbDate = fc.date({
    min: new Date('2020-01-01'),
    max: new Date('2030-12-31'),
    noInvalidDate: true
  });

  test.prop([arbPublisher, arbDate])(
    'rendered HTML contains publisher name and formatted date',
    (publisher, date) => {
      const claim = {
        claim_text: 'Some claim',
        source_publisher: publisher,
        last_verified_at: date.toISOString(),
        source_url: 'https://example.com'
      };

      const html = renderClaimHTML(claim);

      // Publisher should appear in the output
      expect(html).toContain(publisher);

      // Formatted date parts should appear (zh-CN format: YYYY/MM/DD)
      const formatted = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      expect(html).toContain(formatted);
    }
  );
});

/**
 * Property 3: Verification gate for admission-type claims
 * **Validates: Requirements 1.5**
 *
 * For any date >= 2027-09-01 and non-empty set of admission-type claims,
 * isVerificationGateActive returns true. For dates before or empty set, returns false.
 */
describe('Property 3: Verification gate for admission-type claims', () => {
  const admissionTypes = [
    'admission_subject',
    'admission_score_line',
    'admission_deadline',
    'retest_rule'
  ];

  const arbAdmissionClaim = fc.record({
    claim_id: fc.string({ minLength: 1 }),
    claim_type: fc.constantFrom(...admissionTypes),
    source_url: fc.string()
  });

  const arbNonAdmissionClaim = fc.record({
    claim_id: fc.string({ minLength: 1 }),
    claim_type: fc.constantFrom('general', 'other', 'note'),
    source_url: fc.string()
  });

  // Date on or after 2027-09-01
  const arbDateAfterGate = fc.date({
    min: new Date('2027-09-01'),
    max: new Date('2035-12-31'),
    noInvalidDate: true
  });

  // Date before 2027-09-01
  const arbDateBeforeGate = fc.date({
    min: new Date('2020-01-01'),
    max: new Date('2027-08-31'),
    noInvalidDate: true
  });

  test.prop([arbDateAfterGate, fc.array(arbAdmissionClaim, { minLength: 1, maxLength: 10 })])(
    'returns true when date >= 2027-09-01 and admission-type claims exist',
    (date, claims) => {
      expect(isVerificationGateActive(date.toISOString(), claims)).toBe(true);
    }
  );

  test.prop([arbDateBeforeGate, fc.array(arbAdmissionClaim, { minLength: 1, maxLength: 10 })])(
    'returns false when date < 2027-09-01 even with admission-type claims',
    (date, claims) => {
      expect(isVerificationGateActive(date.toISOString(), claims)).toBe(false);
    }
  );

  test.prop([arbDateAfterGate, fc.array(arbNonAdmissionClaim, { minLength: 0, maxLength: 10 })])(
    'returns false when date >= 2027-09-01 but no admission-type claims',
    (date, claims) => {
      expect(isVerificationGateActive(date.toISOString(), claims)).toBe(false);
    }
  );
});

/**
 * Property 4: URL-less claims filtered from display
 * **Validates: Requirements 1.6**
 *
 * For any set of claims, filterDisplayableClaims returns only those
 * with non-empty source_url string.
 */
describe('Property 4: URL-less claims filtered from display', () => {
  const arbClaimWithUrl = fc.record({
    claim_id: fc.string({ minLength: 1 }),
    claim_text: fc.string(),
    source_url: fc.string({ minLength: 1 }).filter((s) => s.length > 0)
  });

  const arbClaimWithoutUrl = fc.record({
    claim_id: fc.string({ minLength: 1 }),
    claim_text: fc.string(),
    source_url: fc.constantFrom('', null, undefined)
  });

  test.prop([fc.array(arbClaimWithUrl, { maxLength: 20 }), fc.array(arbClaimWithoutUrl, { maxLength: 20 })])(
    'returns only claims with non-empty source_url, filtering out empty/null/undefined',
    (withUrl, withoutUrl) => {
      const allClaims = fc.shuffledSubarray([...withUrl, ...withoutUrl], {
        minLength: withUrl.length + withoutUrl.length,
        maxLength: withUrl.length + withoutUrl.length
      });
      // Use a simpler approach: just interleave them
      const mixed = [...withUrl, ...withoutUrl];
      const result = filterDisplayableClaims(mixed);

      // All results should have non-empty source_url
      for (const claim of result) {
        expect(typeof claim.source_url).toBe('string');
        expect(claim.source_url.length).toBeGreaterThan(0);
      }

      // Count should match the claims that had valid URLs
      expect(result.length).toBe(withUrl.length);
    }
  );

  test.prop([fc.array(arbClaimWithUrl, { minLength: 1, maxLength: 20 })])(
    'claims all with valid URLs are all returned',
    (claims) => {
      const result = filterDisplayableClaims(claims);
      expect(result.length).toBe(claims.length);
    }
  );

  test.prop([fc.array(arbClaimWithoutUrl, { minLength: 1, maxLength: 20 })])(
    'claims all without URLs result in empty array',
    (claims) => {
      const result = filterDisplayableClaims(claims);
      expect(result.length).toBe(0);
    }
  );
});

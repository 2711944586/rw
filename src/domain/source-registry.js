/**
 * Source Registry Module
 *
 * Pure functions for fact claim status computation, staleness detection,
 * display filtering, and verification gating.
 */

/**
 * Computes the verification status of a fact claim based on the gap
 * between last_verified_at and today.
 *
 * @param {string|Date} lastVerifiedAt - ISO date string or Date of last verification
 * @param {string|Date} today - ISO date string or Date representing current date
 * @returns {'verified'|'pending'|'outdated'} verification status
 */
export function computeVerificationStatus(lastVerifiedAt, today) {
  const verifiedDate = new Date(lastVerifiedAt);
  const todayDate = new Date(today);
  const diffMs = todayDate.getTime() - verifiedDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 90) {
    return 'verified';
  } else if (diffDays < 180) {
    return 'pending';
  } else {
    return 'outdated';
  }
}

/**
 * Filters claims to only those with a non-empty source_url.
 * Claims with empty, null, or undefined source_url are excluded from display.
 *
 * @param {Array<Object>} claims - Array of fact claim objects
 * @returns {Array<Object>} Claims where source_url is a non-empty string
 */
export function filterDisplayableClaims(claims) {
  return claims.filter(
    (claim) => typeof claim.source_url === 'string' && claim.source_url.length > 0
  );
}

/**
 * Renders a fact claim as an HTML string, including the publisher name
 * and formatted verification date.
 *
 * @param {Object} claim - A fact claim object with source_publisher and last_verified_at
 * @returns {string} HTML string representing the claim
 */
export function renderClaimHTML(claim) {
  const verifiedDate = new Date(claim.last_verified_at);
  const formattedDate = verifiedDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return `<div class="fact-claim">
  <p class="claim-text">${escapeHTML(claim.claim_text || '')}</p>
  <div class="claim-meta">
    <span class="claim-publisher">${escapeHTML(claim.source_publisher)}</span>
    <span class="claim-verified-date">${formattedDate}</span>
  </div>
</div>`;
}

/**
 * Determines whether the verification gate is active, blocking calibration.
 * The gate is active when:
 *   1. today >= 2027-09-01, AND
 *   2. claims contains at least one with claim_type in
 *      {admission_subject, admission_score_line, admission_deadline, retest_rule}
 *
 * @param {string|Date} today - ISO date string or Date representing current date
 * @param {Array<Object>} claims - Array of fact claim objects with claim_type field
 * @returns {boolean} true if verification gate is active (calibration blocked)
 */
export function isVerificationGateActive(today, claims) {
  const todayDate = new Date(today);
  const gateDate = new Date('2027-09-01');

  if (todayDate < gateDate) {
    return false;
  }

  const admissionTypes = new Set([
    'admission_subject',
    'admission_score_line',
    'admission_deadline',
    'retest_rule'
  ]);

  return claims.some((claim) => admissionTypes.has(claim.claim_type));
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

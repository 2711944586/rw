/**
 * Source Registry Module
 *
 * Pure functions for fact claim status computation, staleness detection,
 * display filtering, and verification gating.
 */

import { safeExternalUrl } from '../utils/html.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(text);
  if (!match) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== match[1]) return null;
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Computes the verification status of a fact claim based on the gap
 * between last_verified_at and today.
 *
 * @param {string|Date} lastVerifiedAt - ISO date string or Date of last verification
 * @param {string|Date} today - ISO date string or Date representing current date
 * @returns {'verified'|'pending'|'outdated'} verification status
 */
export function computeVerificationStatus(lastVerifiedAt, today) {
  const verifiedDate = parseDate(lastVerifiedAt);
  const todayDate = parseDate(today);
  if (!verifiedDate || !todayDate) return 'outdated';

  const diffMs = todayDate.getTime() - verifiedDate.getTime();
  const diffDays = Math.floor(diffMs / MS_PER_DAY);
  if (diffDays < 0) return 'outdated';

  if (diffDays < 90) {
    return 'verified';
  } else if (diffDays < 180) {
    return 'pending';
  } else {
    return 'outdated';
  }
}

/**
 * Filters claims to only those with a safe absolute http(s) source_url.
 * Claims with empty, malformed, relative, or unsafe source_url values are excluded.
 *
 * @param {Array<Object>} claims - Array of fact claim objects
 * @returns {Array<Object>} Claims where source_url is safe to display
 */
export function filterDisplayableClaims(claims) {
  return (Array.isArray(claims) ? claims : []).filter(
    (claim) => typeof claim?.source_url === 'string'
      && claim.source_url.trim().length > 0
      && safeExternalUrl(claim.source_url) !== '#'
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
  const formattedDate = formatClaimDate(claim?.last_verified_at);
  const claimText = safeText(claim?.claim_text);
  const publisher = safeText(claim?.source_publisher, '未知');

  return `<div class="fact-claim">
  <p class="claim-text">${escapeHTML(claimText)}</p>
  <div class="claim-meta">
    <span class="claim-publisher">${escapeHTML(publisher)}</span>
    <span class="claim-verified-date">${escapeHTML(formattedDate)}</span>
  </div>
</div>`;
}

function formatClaimDate(value) {
  const verifiedDate = parseDate(value);
  if (!verifiedDate) return '未知';
  return verifiedDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function safeText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
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
  const todayDate = parseDate(today);
  if (!todayDate) return false;

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

  return (Array.isArray(claims) ? claims : []).some((claim) => admissionTypes.has(claim?.claim_type));
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

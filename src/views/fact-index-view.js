/**
 * Fact Index View — lazy-loaded view module listing all Fact_Claims
 * grouped by verification_status with source metadata and staleness indicators.
 *
 * Exports: mount(container), unmount()
 *
 * Addresses Requirements: 1.2, 1.3, 1.4, 1.7
 */

import {
  computeVerificationStatus,
  filterDisplayableClaims,
} from '../domain/source-registry.js';
import { StateManager } from '../core/state-manager.js';
import { escapeAttr, escapeHTML, safeExternalUrl } from '../utils/html.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function parseVerifiedDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(text);
  if (!match) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === match[1] ? date : null;
}

function formatVerifiedDate(value, today) {
  const date = parseVerifiedDate(value);
  const todayDate = parseVerifiedDate(today);
  if (!date || !todayDate || date > todayDate) return '未知';
  return date.toLocaleDateString('zh-CN');
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeText(value, fallback = '') {
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return fallback;
  const text = String(value);
  return text || fallback;
}

/**
 * Group claims by computed verification status.
 */
function groupClaims(claims, today) {
  const groups = { verified: [], pending: [], outdated: [] };

  for (const row of claims) {
    const claim = objectValue(row);
    const status = claim.last_verified_at
      ? computeVerificationStatus(claim.last_verified_at, today)
      : 'outdated';
    groups[status].push(claim);
  }

  return groups;
}

/**
 * Render a single claim card with source metadata.
 */
function renderClaimCard(rawClaim, status, today) {
  const claim = objectValue(rawClaim);
  const verifiedDate = formatVerifiedDate(claim.last_verified_at, today);
  const claimType = safeText(claim.claim_type, 'general');
  const claimText = safeText(claim.claim_text);
  const publisher = safeText(claim.source_publisher, '未知');
  const sourceUrl = safeText(claim.source_url);

  const borderColor = status === 'pending'
    ? 'var(--amber)'
    : status === 'outdated'
      ? 'var(--red)'
      : 'var(--line)';

  return `
    <article class="source-card" style="border-left:3px solid ${borderColor};">
      <span>${escapeHTML(claimType)}</span>
      <strong>${escapeHTML(claimText)}</strong>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted);">
        <span>来源: ${escapeHTML(publisher)}</span>
        <span>验证: ${escapeHTML(verifiedDate)}</span>
        ${sourceUrl ? `<a href="${escapeAttr(safeExternalUrl(sourceUrl))}" target="_blank" rel="noopener noreferrer" aria-label="查看来源链接">链接</a>` : ''}
      </div>
    </article>
  `;
}

/**
 * Render a group section.
 */
function renderGroup(title, claims, status, description) {
  const statusLabels = { verified: '已验证', pending: '待验证', outdated: '已过期' };
  const statusColors = { verified: 'var(--green)', pending: 'var(--amber)', outdated: 'var(--red)' };
  const safeStatus = statusColors[status] ? status : 'outdated';

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head">
        <div>
          <h3 style="display:flex;gap:8px;align-items:center;">
            ${escapeHTML(title)}
            <span style="font-size:12px;padding:2px 8px;border-radius:999px;background:${statusColors[safeStatus]}20;color:${statusColors[safeStatus]};">${claims.length}</span>
          </h3>
          <p>${escapeHTML(description)}</p>
        </div>
      </div>
      <div class="source-grid" style="grid-template-columns:1fr;gap:10px;">
        ${claims.length === 0
          ? '<p style="color:var(--muted);font-size:13px;">暂无项目</p>'
          : claims.map(c => renderClaimCard(c, status, getToday())).join('')}
      </div>
    </section>
  `;
}

function render() {
  const today = getToday();
  const allClaims = arrayValue(StateManager.getState('source_registry'));
  const displayable = filterDisplayableClaims(allClaims);
  const groups = groupClaims(displayable, today);

  return `
    <section class="view fact-index-view active">
      ${renderGroup('已验证', groups.verified, 'verified', '< 90天内验证，信息可信')}
      ${renderGroup('待验证', groups.pending, 'pending', '90~180天未验证，建议核实')}
      ${renderGroup('已过期', groups.outdated, 'outdated', '≥ 180天未验证，可能失效')}
    </section>
  `;
}

// ─── Public API ───────────────────────────────────────────────

export function mount(container) {
  containerEl = container;
  container.innerHTML = render();
  cleanupFns = [];
}

export function unmount() {
  for (const fn of cleanupFns) {
    try { fn(); } catch (_) { /* ignore */ }
  }
  cleanupFns = [];
  if (containerEl) containerEl.innerHTML = '';
  containerEl = null;
}

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
  renderClaimHTML,
} from '../domain/source-registry.js';
import { StateManager } from '../core/state-manager.js';

/** @type {HTMLElement|null} */
let containerEl = null;

/** @type {Function[]} */
let cleanupFns = [];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Group claims by computed verification status.
 */
function groupClaims(claims, today) {
  const groups = { verified: [], pending: [], outdated: [] };

  for (const claim of claims) {
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
function renderClaimCard(claim, status) {
  const verifiedDate = claim.last_verified_at
    ? new Date(claim.last_verified_at).toLocaleDateString('zh-CN')
    : '未知';

  const borderColor = status === 'pending'
    ? 'var(--amber)'
    : status === 'outdated'
      ? 'var(--red)'
      : 'var(--line)';

  return `
    <article class="source-card" style="border-left:3px solid ${borderColor};">
      <span>${escapeHTML(claim.claim_type || 'general')}</span>
      <strong>${escapeHTML(claim.claim_text || '')}</strong>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted);">
        <span>来源: ${escapeHTML(claim.source_publisher || '未知')}</span>
        <span>验证: ${verifiedDate}</span>
        ${claim.source_url ? `<a href="${escapeHTML(claim.source_url)}" target="_blank" rel="noopener" aria-label="查看来源链接">链接</a>` : ''}
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

  return `
    <section class="panel" style="margin-bottom:14px;">
      <div class="panel-head">
        <div>
          <h3 style="display:flex;gap:8px;align-items:center;">
            ${title}
            <span style="font-size:12px;padding:2px 8px;border-radius:999px;background:${statusColors[status]}20;color:${statusColors[status]};">${claims.length}</span>
          </h3>
          <p>${description}</p>
        </div>
      </div>
      <div class="source-grid" style="grid-template-columns:1fr;gap:10px;">
        ${claims.length === 0
          ? '<p style="color:var(--muted);font-size:13px;">暂无项目</p>'
          : claims.map(c => renderClaimCard(c, status)).join('')}
      </div>
    </section>
  `;
}

function render() {
  const today = getToday();
  const allClaims = StateManager.getState('source_registry') || [];
  const displayable = filterDisplayableClaims(Array.isArray(allClaims) ? allClaims : []);
  const groups = groupClaims(displayable, today);

  return `
    <section class="view fact-index-view active">
      ${renderGroup('已验证', groups.verified, 'verified', '< 90天内验证，信息可信')}
      ${renderGroup('待验证', groups.pending, 'pending', '90~180天未验证，建议核实')}
      ${renderGroup('已过期', groups.outdated, 'outdated', '≥ 180天未验证，可能失效')}
    </section>
  `;
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

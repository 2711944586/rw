import { escapeHTML, escapeAttr } from "../utils/html.js";
import {
  resourceGovernanceRules,
  resourceStageControl,
  resourceSubjectGovernance
} from "../data/study-plan-governance.js";

const WEEK_THEMES = [
  "建立基线与连续性",
  "数列、数组与函数",
  "极限、指针与结构体",
  "极限计算、线性结构与月审"
];

function shortDate(date) {
  return escapeHTML(String(date || "").slice(5).replace("-", "/"));
}

export function renderStartupCalendarTemplate(plan, selectedWeek = 0) {
  const weeks = Array.from({ length: 4 }, (_, index) => plan.slice(index * 7, index * 7 + 7));
  const safeWeek = Math.min(weeks.length - 1, Math.max(0, Number(selectedWeek) || 0));
  const days = weeks[safeWeek] || [];
  if (!days.length) return '<div class="empty-state">首月日历尚未配置。</div>';

  return `
    <nav class="startup-week-tabs" aria-label="首月周次切换">
      ${weeks.map((week, index) => `
        <button type="button" data-startup-week="${index}" aria-pressed="${index === safeWeek}" class="${index === safeWeek ? "active" : ""}">
          <span>第 ${index + 1} 周</span><small>${shortDate(week[0]?.date)} - ${shortDate(week.at(-1)?.date)}</small>
        </button>
      `).join("")}
    </nav>
    <section class="startup-week" data-week="${safeWeek + 1}">
      <header>
        <div><span>W${safeWeek + 1}</span><strong>${shortDate(days[0].date)} - ${shortDate(days.at(-1).date)}</strong></div>
        <p>${escapeHTML(WEEK_THEMES[safeWeek])}</p>
      </header>
      <div class="startup-day-list">
        ${days.map((day) => `
          <article class="startup-day-row">
            <div class="startup-day-date"><span>D${day.day}</span><strong>${shortDate(day.date)}</strong><em>${escapeHTML(day.load)} · 缓冲 ${Number(day.bufferMinutes) || 0}m</em></div>
            <div class="startup-day-tasks">
              ${day.blocks.map(([subject, minutes, action, output]) => `<p><strong>${escapeHTML(subject)} ${Number(minutes) || 0}m</strong><span>${escapeHTML(action)}</span><em>${escapeHTML(output)}</em></p>`).join("")}
            </div>
            <div class="startup-day-control"><p><strong>复盘</strong>${escapeHTML(day.review)}</p><p><strong>停手</strong>${escapeHTML(day.stopRule)}</p>${day.recoveryWindow ? `<p><strong>恢复</strong>${escapeHTML(day.recoveryWindow)}</p>` : ""}</div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderSubjectTabs(stacks, selectedKey, attribute = "data-resource-dossier-subject") {
  return stacks.map((stack) => `
    <button type="button" ${attribute}="${escapeAttr(stack.key)}" aria-pressed="${stack.key === selectedKey}" class="${stack.key === selectedKey ? "active" : ""}">${escapeHTML(stack.subject)}</button>
  `).join("");
}

export function renderResourceDossierTemplate(stacks, selectedKey) {
  const stack = stacks.find((item) => item.key === selectedKey) || stacks[0];
  if (!stack) return '<div class="empty-state">资料矩阵尚未配置。</div>';
  const governance = resourceSubjectGovernance[stack.key] || resourceSubjectGovernance.math;

  return `
    <div class="resource-dossier-toolbar">
      <div><span>当前审计科目</span><strong>${escapeHTML(stack.subject)}</strong></div>
      <div class="resource-dossier-tabs" role="group" aria-label="完整资料矩阵科目切换">
        ${renderSubjectTabs(stacks, stack.key)}
      </div>
    </div>
    <section class="resource-governance-summary" aria-label="资料治理摘要">
      <article><span>官方锚点</span><p>${escapeHTML(governance.officialAnchor)}</p></article>
      <article><span>启用前置</span><p>${escapeHTML(governance.prerequisite)}</p></article>
      <article><span>购买规则</span><p>${escapeHTML(governance.acquisition)}</p></article>
      <article><span>冲突检查</span><p>${escapeHTML(governance.conflict)}</p></article>
    </section>
    <section class="resource-file">
      <header>
        <div><span>唯一主线</span><h4>${escapeHTML(stack.subject)}</h4></div>
        <div><p>${escapeHTML(stack.primary)}</p><em>${escapeHTML(stack.reservePolicy)}</em></div>
      </header>
      <div class="resource-stage-table">
        ${stack.stages.map((stage, index) => {
          const control = resourceStageControl(stack.key, stage);
          return `
            <article class="resource-stage-row">
              <div class="resource-stage-identity"><span>${String(index + 1).padStart(2, "0")} · ${escapeHTML(stage.window)}</span><strong>${escapeHTML(stage.stage)}</strong><em>${escapeHTML(stage.role)}</em></div>
              <div class="resource-stage-core"><strong>${escapeHTML(stage.material)}</strong><p>${escapeHTML(stage.session)}</p></div>
              <div class="resource-stage-evidence"><span>证据</span><p>${escapeHTML(stage.evidence)}</p><span>停用 / 切换</span><p>${escapeHTML(stage.switchRule)}</p></div>
              <details class="resource-stage-control"><summary>启用、频率与版本检查</summary><dl><div><dt>启用门</dt><dd>${escapeHTML(control.activation)}</dd></div><div><dt>频率</dt><dd>${escapeHTML(control.cadence)}</dd></div><div><dt>周审</dt><dd>${escapeHTML(control.audit)}</dd></div><div><dt>版本</dt><dd>${escapeHTML(control.version)}</dd></div><div><dt>候补</dt><dd>${escapeHTML(stage.reserve)}</dd></div></dl></details>
            </article>
          `;
        }).join("")}
      </div>
    </section>
    <details class="resource-governance-rules">
      <summary>查看跨科资料治理规则</summary>
      <div>${resourceGovernanceRules.map(([label, rule]) => `<article><strong>${escapeHTML(label)}</strong><p>${escapeHTML(rule)}</p></article>`).join("")}</div>
    </details>
  `;
}

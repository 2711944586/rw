import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { PLAN_START_DATE, TARGET_TOTAL_HOURS } from "../../src/config/app-config.js";
import { firstMonthActions, monthlyPlan, phases, rampBudgets, scoreTargets, taskBlueprints } from "../../src/data/study-content.js";

describe("study workflow content", () => {
  it("keeps the executable study workflow visible", () => {
    const app = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const content = fs.readFileSync(new URL("../../src/data/study-content.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const workflow = `${app}\n${content}`;

    expect(workflow).toContain("日审");
    expect(workflow).toContain("周审");
    expect(workflow).toContain("月审");
    expect(workflow).toContain("最低");
    expect(workflow).toContain("高质量");
    expect(workflow).toContain("资料使用规则");
    expect(workflow).toContain("learningCurveSnapshot");
    expect(workflow).toContain("英语不断档");
    expect(workflow).toContain("英语细水长流");
    expect(workflow).toContain("topicMatchesQuery");
    expect(workflow).toContain("reviewRoundGuide");
    expect(html).toContain("14 天学习曲线");
    expect(html).toContain("学习科学协议");
    expect(html).toContain("搜索考点");
    expect(html).toContain("备考拆解");
  });

  it("anchors the clean-start workflow on 2026-10-15", () => {
    const app = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const sync = fs.readFileSync(new URL("../../src/infrastructure/supabase-sync.js", import.meta.url), "utf8");
    const config = fs.readFileSync(new URL("../../src/config/app-config.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const schema = fs.readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

    expect(config).toContain('export const PLAN_START_DATE = "2026-10-15"');
    expect(config).toContain('export const CLEAN_START_VERSION = "2026-10-15-from-zero-v4"');
    expect(config).toContain('export const DEFAULT_EXAM_DATE = "2027-12-19"');
    expect(app).toContain("filterTaskStateFromStart");
    expect(app).toContain("filterDeletedFromStart");
    expect(app).toContain("早于起点的数据仅归档，不再参与计划、统计和复盘");
    expect(sync).toContain('PLAN_START_DATE');
    expect(sync).toContain('gte("study_date", PLAN_START_DATE)');
    expect(sync).toContain('gte("task_date", PLAN_START_DATE)');
    expect(sync).toContain('gte("due_date", PLAN_START_DATE)');
    expect(sync).toContain('gte("mock_date", PLAN_START_DATE)');
    expect(html).toContain("2026-10-15 开始");
    expect(schema).toContain("4.0-aug31-operating-plan-2026-08-31");
    const planDoc = fs.readFileSync(new URL("../../docs/STUDY_PLAN.md", import.meta.url), "utf8");
    expect(planDoc).toContain("| 10-15 D1 |");
    expect(planDoc).toContain("| 11-11 D28 |");
    expect(planDoc).not.toContain("| 10-14 D1 |");
  });

  it("keeps detail mode materially more informative than balanced mode", () => {
    const app = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const content = fs.readFileSync(new URL("../../src/data/study-content.js", import.meta.url), "utf8");
    const density = fs.readFileSync(new URL("../../src/ui/density-controller.js", import.meta.url), "utf8");

    for (const label of ["目标", "前置", "执行步骤", "交付物", "验收线", "时间预算", "复盘窗口", "资料使用", "方法依据"]) {
      expect(app).toContain(label);
    }
    for (const field of ["prerequisite", "resource", "basis"]) {
      expect(content).toContain(`${field}:`);
    }
    expect(density).not.toContain("level: 'action'");
    expect(density).toContain("level: 'execution'");
    expect(density).toContain("level: 'diagnostic'");
    expect(density).toContain("expand: Object.freeze(['detail'])");
  });

  it("keeps the revised plan continuous and fully specified", () => {
    expect(phases[0].start).toBe(PLAN_START_DATE);
    expect(rampBudgets[0].start).toBe(PLAN_START_DATE);
    expect(monthlyPlan[0][0]).toBe("2026-10");
    expect(monthlyPlan.at(-1)[2]).toBe(TARGET_TOTAL_HOURS);
    expect(firstMonthActions.at(-1).week).toBe("11/10-11/11");
    expect(monthlyPlan.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(TARGET_TOTAL_HOURS);

    for (let index = 1; index < phases.length; index += 1) {
      const previousEnd = new Date(`${phases[index - 1].end}T00:00:00Z`);
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      expect(previousEnd.toISOString().slice(0, 10)).toBe(phases[index].start);
    }

    for (const blueprint of Object.values(taskBlueprints)) {
      expect(blueprint.steps).toHaveLength(3);
      expect(blueprint.prerequisite).toBeTruthy();
      expect(blueprint.resource).toBeTruthy();
      expect(blueprint.basis).toBeTruthy();
    }
  });

  it("sets math and 408 score targets to 140 and 130", () => {
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const app = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const bySubject = Object.fromEntries(scoreTargets.map(([subject, target]) => [subject, target]));

    expect(bySubject["数学一"]).toBe(140);
    expect(bySubject["408"]).toBe(130);
    expect(html).toContain("75 / 80 / 140 / 130");
    expect(html).not.toContain("75 / 80 / 130 / 135");
    expect(app).toContain("scoreTargets.map");
    expect(app).not.toContain("130 - avg.math");
    expect(app).not.toContain("135 - avg.cs408");
  });
});

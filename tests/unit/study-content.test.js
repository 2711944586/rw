import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("study workflow content", () => {
  it("keeps the executable study workflow visible", () => {
    const app = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(app).toContain("日审");
    expect(app).toContain("周审");
    expect(app).toContain("月审");
    expect(app).toContain("最低");
    expect(app).toContain("高质量");
    expect(app).toContain("资料使用规则");
    expect(app).toContain("learningCurveSnapshot");
    expect(app).toContain("英语不断档");
    expect(app).toContain("英语细水长流");
    expect(app).toContain("topicMatchesQuery");
    expect(app).toContain("reviewRoundGuide");
    expect(html).toContain("14 天学习曲线");
    expect(html).toContain("学习科学协议");
    expect(html).toContain("搜索考点");
    expect(html).toContain("备考拆解");
  });

  it("anchors the clean-start workflow on 2026-06-08", () => {
    const app = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
    const sync = fs.readFileSync(new URL("../../src/supabaseSync.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const schema = fs.readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

    expect(app).toContain('const PLAN_START_DATE = "2026-06-08"');
    expect(app).toContain('const CLEAN_START_VERSION = "2026-06-08-from-zero-v1"');
    expect(app).toContain("filterTaskStateFromStart");
    expect(app).toContain("filterDeletedFromStart");
    expect(app).toContain("早于起点的数据仅归档，不再参与计划、统计和复盘");
    expect(sync).toContain('const PLAN_START_DATE = "2026-06-08"');
    expect(sync).toContain('gte("study_date", PLAN_START_DATE)');
    expect(sync).toContain('gte("task_date", PLAN_START_DATE)');
    expect(sync).toContain('gte("due_date", PLAN_START_DATE)');
    expect(sync).toContain('gte("mock_date", PLAN_START_DATE)');
    expect(html).toContain("2026-06-08 从头开始");
    expect(schema).toContain("3.6-jun8-clean-start-2026-06-08");
  });
});

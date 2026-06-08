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
});

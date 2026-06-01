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
    expect(html).toContain("14 天学习曲线");
  });
});

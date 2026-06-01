import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("app imports", () => {
  it("does not shadow the built-in Map constructor with the lucide icon", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toContain("Map as MapIcon");
    expect(source).not.toMatch(/\bMap,\s*\n\s*RefreshCw/);
  });

  it("keeps account controls available in recovery mode", () => {
    const source = fs.readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");

    expect(source).toContain("function bindRecoveryAuthControls()");
    expect(source).toContain('document.getElementById("authOpenBtn")?.addEventListener("click"');
    expect(source).toContain('document.getElementById("resetLocalBtn")?.addEventListener("click", resetLocalData)');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../../src/app.js", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");

const secondStack = [
  "core/state-manager.js",
  "core/router.js",
  "infrastructure/sync-service.js",
  "views/today-view.js"
];

describe("production authority", () => {
  it("keeps router, store, and sync inside app.js", () => {
    for (const specifier of secondStack) {
      expect(appSource.includes(specifier), `app.js imports ${specifier}`).toBe(false);
      expect(mainSource.includes(specifier), `main.js imports ${specifier}`).toBe(false);
    }
    expect(appSource).toContain("function setRoute(");
    expect(appSource).toContain("function saveState(");
    expect(appSource).toContain("function queueCloudSync(");
    expect(appSource).not.toContain("initSyncService(");
    expect(mainSource).not.toContain("initSyncService(");
  });
});

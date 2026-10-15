import { describe, expect, it } from "vitest";
import { planCapacityMessage } from "../../src/domain/plan-capacity.js";
import { appendPlanVersion, createPlanVersion, undoPlanVersion } from "../../src/domain/plan-version.js";

describe("plan capacity", () => {
  it("stays quiet when the day fits the available time", () => {
    const result = planCapacityMessage({ planned: 180, available: 180 });
    expect(result.conflict).toBe(false);
    expect(result.message).toBe("");
  });

  it("names the overflow and does not invent a shorter plan", () => {
    const result = planCapacityMessage({ planned: 240, available: 180 });
    expect(result.conflict).toBe(true);
    expect(result.overflow).toBe(60);
    expect(result.message).toContain("240");
    expect(result.message).toContain("180");
    expect(result.message).toContain("不会悄悄缩短");
  });
});

describe("plan versions", () => {
  it("keeps the previous task list so one regenerate can be undone", () => {
    const before = [{ id: "math-1", subject: "数学", text: "极限", minutes: 50, locked: true, status: "todo" }];
    const version = createPlanVersion({
      date: "2026-10-10",
      reason: "重新生成",
      changedTaskIds: ["english-1"],
      previousVersionId: "",
      beforeTasks: before,
      createdAt: "2026-10-10T01:00:00.000Z"
    });
    const stored = appendPlanVersion([], version);
    const undone = undoPlanVersion(stored);
    expect(version.changedTaskIds).toEqual(["english-1"]);
    expect(version.previousVersionId).toBe("");
    expect(undone.version.beforeTasks).toEqual([
      expect.objectContaining({ id: "math-1", minutes: 50, locked: true })
    ]);
    expect(undone.versions).toEqual([]);
    expect(stored).toHaveLength(1);
  });

  it("drops the oldest version after twenty regenerations", () => {
    const versions = Array.from({ length: 21 }, (_, index) => createPlanVersion({
      date: "2026-10-10",
      reason: `第 ${index} 次`,
      beforeTasks: [{ id: `task-${index}`, subject: "数学", text: "题", minutes: 30 }],
      createdAt: `2026-10-10T01:${String(index).padStart(2, "0")}:00.000Z`
    }));
    const stored = versions.reduce((list, version) => appendPlanVersion(list, version), []);
    expect(stored).toHaveLength(20);
    expect(stored[0].reason).toBe("第 1 次");
    expect(stored.at(-1).reason).toBe("第 20 次");
  });
});

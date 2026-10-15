import { describe, expect, it } from "vitest";
import { capacityOrderDailyTasks } from "../../src/domain/capacity-daily-plan.js";

const tasks = [
  { id: "review-1", subject: "复盘", minutes: 25, priority: 1, reviewItemId: "r1", text: "回炉" },
  { id: "math-1", subject: "数学", minutes: 80, priority: 2, text: "极限" },
  { id: "cs-1", subject: "408", minutes: 80, priority: 3, text: "树" },
  { id: "english-1", subject: "英语", minutes: 40, priority: 4, text: "阅读" },
  { id: "locked-1", subject: "政治", minutes: 50, priority: 5, locked: true, text: "史纲" }
];

describe("capacity daily plan", () => {
  it("keeps a locked task when the open tasks already fill the day", () => {
    const ordered = capacityOrderDailyTasks(tasks, {
      availableMinutes: 120,
      phaseId: "B",
      historyMedian: { taskCount: 4, minutes: 180 }
    });
    expect(ordered.map((task) => task.id)).toContain("locked-1");
    expect(ordered.find((task) => task.id === "locked-1").minutes).toBe(50);
    expect(ordered.find((task) => task.id === "math-1").text).toBe("极限");
    expect(ordered.map((task) => task.id)).toContain("english-1");
  });

  it("puts a due review ahead of a new topic", () => {
    const ordered = capacityOrderDailyTasks(tasks, {
      availableMinutes: 240,
      phaseId: "A",
      historyMedian: { taskCount: 5, minutes: 240 }
    });
    const reviewIndex = ordered.findIndex((task) => task.id === "review-1");
    const topicIndex = ordered.findIndex((task) => task.id === "math-1");
    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    expect(reviewIndex).toBeLessThan(topicIndex);
  });

  it("returns the original tasks when the engine has no minutes to assign", () => {
    const ordered = capacityOrderDailyTasks(
      [{ id: "math-1", subject: "数学", minutes: 40, locked: true, text: "极限" }],
      { availableMinutes: 0, phaseId: "A" }
    );
    expect(ordered.map((task) => task.id)).toEqual(["math-1"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  collectCarryoverTasks,
  markCarriedSourceTasks
} from "../../src/domain/task-carryover.js";

describe("task-carryover", () => {
  it("rolls unfinished previous tasks into the target date with lineage", () => {
    const weekPlans = {
      "2026-05-27": [
        { id: "old-math", date: "2026-05-27", subject: "数学", text: "极限基础题 20 道", minutes: 80, status: "todo" },
        { id: "old-408", date: "2026-05-27", subject: "408", text: "顺序表代码实现", minutes: 70, status: "done" }
      ],
      "2026-05-28": [
        { id: "yesterday-eng", date: "2026-05-28", subject: "英语", text: "阅读精读 1 篇", minutes: 45, status: "todo" }
      ],
      "2026-05-29": []
    };

    const carried = collectCarryoverTasks(weekPlans, { "old-408": true }, "2026-05-29", { limit: 2 });

    expect(carried).toHaveLength(2);
    expect(carried.map((task) => task.sourceTaskId)).toEqual(["yesterday-eng", "old-math"]);
    expect(carried[0]).toMatchObject({
      date: "2026-05-29",
      source: "carryover",
      locked: true,
      status: "todo",
      carriedFrom: "2026-05-28"
    });
    expect(carried[0].text).toContain("顺延：");
  });

  it("marks carried source tasks as shifted instead of deleting evidence", () => {
    const weekPlans = {
      "2026-05-28": [
        { id: "old-math", date: "2026-05-28", status: "todo" },
        { id: "done-task", date: "2026-05-28", status: "done" }
      ]
    };
    const shifted = markCarriedSourceTasks(weekPlans, [
      { sourceTaskId: "old-math", date: "2026-05-29" },
      { sourceTaskId: "done-task", date: "2026-05-29" }
    ], { "done-task": true });

    expect(shifted).toEqual(["old-math"]);
    expect(weekPlans["2026-05-28"][0]).toMatchObject({ status: "shifted", shiftedTo: "2026-05-29" });
    expect(weekPlans["2026-05-28"][1].status).toBe("done");
  });

  it("does not duplicate carryover already present on target date", () => {
    const weekPlans = {
      "2026-05-28": [
        { id: "old-math", date: "2026-05-28", subject: "数学", text: "极限", minutes: 80, status: "todo" }
      ],
      "2026-05-29": [
        { id: "2026-05-29-carry-old-math", sourceTaskId: "old-math", source: "carryover" }
      ]
    };

    expect(collectCarryoverTasks(weekPlans, {}, "2026-05-29")).toEqual([]);
  });

  it("caps carried task minutes to keep the next day executable", () => {
    const weekPlans = {
      "2026-06-02": [
        { id: "huge-math", date: "2026-06-02", subject: "数学", text: "补完一整章", minutes: 180, status: "todo" }
      ],
      "2026-06-03": []
    };

    const carried = collectCarryoverTasks(weekPlans, {}, "2026-06-03", { limit: 1, maxMinutes: 75 });

    expect(carried).toHaveLength(1);
    expect(carried[0].minutes).toBe(75);
  });
});

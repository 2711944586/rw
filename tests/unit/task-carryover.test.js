import { describe, expect, it } from "vitest";
import {
  activeTasks,
  collectCarryoverTasks,
  isTaskDone,
  markCarriedSourceTasks
} from "../../src/domain/task-carryover.js";

describe("task-carryover", () => {
  it("detects done tasks without trusting blank task ids", () => {
    expect(isTaskDone({ id: "done-by-state", status: "todo" }, { "done-by-state": true })).toBe(true);
    expect(isTaskDone({ id: "", status: "todo" }, { "": true })).toBe(false);
    expect(isTaskDone(null, { "": true })).toBe(false);
  });

  it("returns active tasks only and tolerates malformed task lists", () => {
    expect(activeTasks(null)).toEqual([]);
    expect(activeTasks([
      { id: "todo", status: "todo" },
      { id: "done", status: "todo" },
      { id: "shifted", status: "shifted" },
      { id: "deleted", deleted: true }
    ], { done: true }).map((task) => task.id)).toEqual(["todo"]);
  });

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

  it("rejects object-coerced carryover limits and minutes", () => {
    const weekPlans = {
      "2026-06-01": [
        { id: "a", date: "2026-06-01", text: "A", minutes: { valueOf: () => 80 }, status: "todo" },
        { id: "b", date: "2026-06-01", text: "B", minutes: 40, status: "todo" },
        { id: "c", date: "2026-06-01", text: "C", minutes: 40, status: "todo" }
      ],
      "2026-06-02": []
    };

    const carried = collectCarryoverTasks(weekPlans, {}, "2026-06-02", {
      limit: { valueOf: () => 3 },
      minMinutes: { valueOf: () => 60 },
      maxMinutes: { valueOf: () => 60 }
    });

    expect(carried).toHaveLength(2);
    expect(carried[0].minutes).toBe(25);
    expect(carried.map((task) => task.sourceTaskId)).toEqual(["a", "b"]);
  });

  it("sanitizes malformed carryover data instead of producing broken tasks", () => {
    const weekPlans = {
      "not-a-date": [
        { id: "ignored-date", text: "不应进入", minutes: 30, status: "todo" }
      ],
      "2026-06-01": [
        { id: "a", date: "bad-date", text: "", minutes: Number.POSITIVE_INFINITY, status: "todo" },
        { id: null, date: "2026-06-01", text: "缺 id", minutes: 40, status: "todo" },
        { id: "b", date: "2026-06-01", title: "标题任务", minutes: -10, status: "todo" },
        { id: "c", date: "2026-06-01", text: "超出默认 limit", minutes: 20, status: "todo" }
      ],
      "2026-06-02": "bad-shape"
    };

    const carried = collectCarryoverTasks(weekPlans, null, "2026-06-02", {
      limit: null,
      minMinutes: "30",
      maxMinutes: "20"
    });

    expect(carried).toHaveLength(2);
    expect(carried.map((task) => task.sourceTaskId)).toEqual(["a", "b"]);
    expect(carried.every((task) => task.minutes === 30)).toBe(true);
    expect(carried[0]).toMatchObject({
      id: "2026-06-02-carry-a",
      date: "2026-06-02",
      text: "顺延：未命名任务",
      carriedFrom: ""
    });
    expect(carried[1].text).toBe("顺延：标题任务");
  });

  it("rejects object ids and text instead of creating object-string carryovers", () => {
    const weekPlans = {
      "2026-06-01": [
        { id: { bad: true }, date: "2026-06-01", text: "坏 id", minutes: 40, status: "todo" },
        { id: "safe-task", date: "2026-06-01", text: { bad: true }, title: { bad: true }, minutes: 40, status: "todo" }
      ],
      "2026-06-02": [
        { sourceTaskId: { bad: true }, carriedFrom: { bad: true } }
      ]
    };

    const carried = collectCarryoverTasks(weekPlans, {}, "2026-06-02", { limit: 3 });

    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({
      id: "2026-06-02-carry-safe-task",
      sourceTaskId: "safe-task",
      text: "顺延：未命名任务"
    });
    expect(JSON.stringify(carried)).not.toContain("[object Object]");
  });

  it("returns no carryover for malformed plan objects or target dates", () => {
    expect(collectCarryoverTasks(null, {}, "2026-06-02")).toEqual([]);
    expect(collectCarryoverTasks({ "2026-06-01": [] }, {}, "bad-date")).toEqual([]);
    expect(collectCarryoverTasks({ "2026-06-01": [] }, {}, "2026-06-02", { limit: Number.NEGATIVE_INFINITY })).toEqual([]);
  });

  it("does not duplicate sources already represented by carriedFrom", () => {
    const weekPlans = {
      "2026-06-01": [
        { id: "old-task", date: "2026-06-01", text: "旧任务", minutes: 30, status: "todo" }
      ],
      "2026-06-02": [
        { id: "manual-carry", carriedFrom: "old-task" }
      ]
    };

    expect(collectCarryoverTasks(weekPlans, {}, "2026-06-02")).toEqual([]);
  });

  it("marks carried numeric source ids and skips malformed day buckets", () => {
    const weekPlans = {
      "2026-06-01": [
        { id: 101, date: "2026-06-01", status: "todo" },
        { id: "done-task", date: "2026-06-01", status: "todo" }
      ],
      "2026-06-02": "bad-shape"
    };

    const shifted = markCarriedSourceTasks(weekPlans, [
      { sourceTaskId: "101", date: "bad-date" },
      { sourceTaskId: "done-task", date: "2026-06-02" }
    ], { "done-task": true });

    expect(shifted).toEqual(["101"]);
    expect(weekPlans["2026-06-01"][0]).toMatchObject({ status: "shifted", shiftedTo: "" });
    expect(weekPlans["2026-06-01"][1].status).toBe("todo");
    expect(markCarriedSourceTasks(null, null)).toEqual([]);
  });

  it("ignores object carried source ids when marking shifted tasks", () => {
    const weekPlans = {
      "2026-06-01": [
        { id: "safe-task", date: "2026-06-01", status: "todo" }
      ]
    };

    const shifted = markCarriedSourceTasks(weekPlans, [
      { sourceTaskId: { bad: true }, date: "2026-06-02" }
    ]);

    expect(shifted).toEqual([]);
    expect(weekPlans["2026-06-01"][0].status).toBe("todo");
  });
});

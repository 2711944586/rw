import { describe, expect, it } from "vitest";
import {
  applyCompletionEvidence,
  decodeLoadNote,
  diffPlan,
  dueOfficialChecks,
  encodeLoadNote,
  mergeRegeneratedTasks,
  presentSyncStatus,
  reviewGradeEffect,
  shouldUseBottomLine,
  validateCompletionEvidence,
  weeklyReviewPrompt
} from "../../src/domain/execution-loop.js";

describe("execution loop", () => {
  it("rejects incomplete task evidence", () => {
    expect(validateCompletionEvidence({ minutes: 0, problems: 1, mistake: "计算", nextTask: "明天" }).ok).toBe(false);
    expect(validateCompletionEvidence({ minutes: 40, problems: 8, mistake: "", nextTask: "明天" }).ok).toBe(false);
    const valid = validateCompletionEvidence({
      minutes: 40,
      problems: 8,
      mistake: "等价无穷小条件漏了",
      nextTask: "闭卷重做两道变式"
    });
    expect(valid.ok).toBe(true);
    expect(valid.evidence.minutes).toBe(40);
  });

  it("adds minutes and problems without overwriting an existing note line", () => {
    const { entry, impact } = applyCompletionEvidence(
      { math: 20, mathProblems: 4, note: "已有卡点", quality: 3 },
      { subject: "数学", date: "2026-10-09" },
      { minutes: 35, problems: 6, mistake: "左右极限", nextTask: "画图 4 题" }
    );
    expect(entry.math).toBe(55);
    expect(entry.mathProblems).toBe(10);
    expect(entry.nextTask).toBe("画图 4 题");
    expect(entry.note).toContain("左右极限");
    expect(impact.changes).toEqual([
      { field: "math", before: 20, after: 55 },
      { field: "mathProblems", before: 4, after: 10 }
    ]);
  });

  it("flags bottom-line days from completion and sleep", () => {
    const low = shouldUseBottomLine([
      { plannedMinutes: 100, doneMinutes: 40 },
      { plannedMinutes: 100, doneMinutes: 50 },
      { plannedMinutes: 100, doneMinutes: 30 }
    ]);
    expect(low.active).toBe(true);
    expect(low.lowCompletion).toBe(true);

    const sleepy = shouldUseBottomLine([
      { plannedMinutes: 100, doneMinutes: 90, sleepHours: 6 },
      { plannedMinutes: 100, doneMinutes: 95, sleepHours: 6.5 }
    ]);
    expect(sleepy.shortSleep).toBe(true);
    expect(shouldUseBottomLine([{ plannedMinutes: 100, doneMinutes: 80, sleepHours: 7.5 }]).active).toBe(false);
  });

  it("previews kept and replaced tasks and protects locked work", () => {
    const current = [
      { id: "a", text: "旧题", minutes: 30, locked: true, status: "todo" },
      { id: "b", text: "会变", minutes: 20, status: "todo" }
    ];
    const next = [
      { id: "a", text: "新题", minutes: 40, status: "todo" },
      { id: "b", text: "会变", minutes: 25, status: "todo" },
      { id: "c", text: "新增", minutes: 15, status: "todo" }
    ];
    const diff = diffPlan(current, next);
    expect(diff.kept.map((item) => item.id)).toEqual(["a"]);
    expect(diff.replaced.map((item) => item.reason)).toEqual(["内容更新", "新增"]);
    const merged = mergeRegeneratedTasks(current, next);
    expect(merged.find((task) => task.id === "a").text).toBe("旧题");
    expect(merged.some((task) => task.id === "c")).toBe(true);
  });

  it("shortens failed reviews and marks a leech on the third miss", () => {
    expect(reviewGradeEffect("again", 2)).toMatchObject({ passed: false, leech: true, rescheduleDays: 1, quality: 1 });
    expect(reviewGradeEffect("good", 2)).toMatchObject({ passed: true, failStreak: 0, quality: 4 });
    expect(reviewGradeEffect("easy").quality).toBe(5);
  });

  it("collapses sync internals into five learner-facing states", () => {
    expect(presentSyncStatus({ status: "local" }, { signedIn: false }).label).toBe("仅本机");
    expect(presentSyncStatus({ status: "pending" }, { signedIn: true }).label).toBe("等待上传");
    expect(presentSyncStatus({ status: "synced", lastSyncAt: "2026-10-09T01:02:03.000Z" }, { signedIn: true }).label).toBe("已同步");
    expect(presentSyncStatus({ status: "paused", cloudPaused: true }, { signedIn: true }).label).toBe("同步暂停");
    expect(presentSyncStatus({ status: "error", lastError: "duplicate key value" }, { signedIn: true }).label).toBe("冲突待处理");
  });

  it("round-trips load signals through the daily note", () => {
    const encoded = encodeLoadNote("左右极限还不稳定", { loadTier: "bottomline", sleepHours: 6.5, fatigue: 4 });
    expect(encoded).toContain("[负荷 bottomline]");
    expect(encoded).toContain("[睡眠 6.5h]");
    const decoded = decodeLoadNote(encoded);
    expect(decoded).toMatchObject({ loadTier: "bottomline", sleepHours: 6.5, fatigue: 4, note: "左右极限还不稳定" });
    expect(encodeLoadNote("普通笔记", {})).toBe("普通笔记");
    expect(encodeLoadNote("普通笔记", { fatigue: null, sleepHours: 0, loadTier: "" })).not.toContain("[疲劳");
  });

  it("shows the Sunday single-variable prompt and overdue official checks", () => {
    const sunday = new Date(2026, 9, 11);
    const monday = new Date(2026, 9, 12);
    expect(sunday.getDay()).toBe(0);
    expect(weeklyReviewPrompt(monday)).toBeNull();
    expect(weeklyReviewPrompt(sunday).choices).toHaveLength(4);
    expect(dueOfficialChecks("2027-09-20", []).map((item) => item.id)).toEqual(["brochure-2027-09"]);
    expect(dueOfficialChecks("2027-09-20", ["brochure-2027-09"])).toEqual([]);
  });
});

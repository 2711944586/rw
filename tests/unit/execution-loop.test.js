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
  weeklyReviewPrompt,
  reviewPosture,
  formatRatioPercent,
  rescheduleReviewFamily,
  REVIEW_RESULTS
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
    expect(shouldUseBottomLine([], { dueCount: 4 })).toMatchObject({ active: true, reviewDebt: true });
    expect(shouldUseBottomLine([], { dueCount: 3 }).reviewDebt).toBe(false);
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

  it("uses one review posture for the banner and the weekly tiles", () => {
    const backlog = reviewPosture({ dueCount: 4, activeDays: 6, mistakeRatio: 1, weekHours: 20, weeklyTarget: 14, coreRatio: 0.7 });
    expect(backlog.status).toBe("先清复盘");
    expect(backlog.load).toBe("先清复盘再加量");
    expect(backlog.action).toContain("到期复盘");
    const quiet = reviewPosture({ dueCount: 0, activeDays: 6, mistakeRatio: 1, weekHours: 14, weeklyTarget: 14, coreRatio: 0.7 });
    expect(quiet.status).toBe("维持节奏");
    expect(quiet.load).toBe("可小幅加难度");
    const empty = reviewPosture({ dueCount: 0, activeDays: 0, mistakeRatio: null, weekHours: 0, weeklyTarget: 24, coreRatio: null });
    expect(empty.status).toBe("还没有样本");
    expect(empty.action).toContain("先记一天");
    const noMistakes = reviewPosture({ dueCount: 0, activeDays: 5, mistakeRatio: null, weekHours: 10, weeklyTarget: 14, coreRatio: 0.7 });
    expect(noMistakes.status).not.toBe("先修复错因");
  });

  it("lengthens the next checkpoint after a pass and shortens it after a fail", () => {
    const item = { id: "task-r1", sourceTaskId: "task", round: "D+1", dueDate: "2026-10-10" };
    const sibling = { id: "task-r3", sourceTaskId: "task", round: "D+3", dueDate: "2026-10-12", done: false, status: "due" };
    const passed = rescheduleReviewFamily({
      item,
      siblings: [item, sibling],
      today: "2026-10-10",
      passed: true,
      failStreak: 0
    });
    expect(passed.needsShortReview).toBe(false);
    expect(passed.changed).toMatchObject({ id: "task-r3", dueDate: "2026-10-13" });

    const failed = rescheduleReviewFamily({
      item,
      siblings: [item, sibling],
      today: "2026-10-10",
      passed: false,
      failStreak: 3
    });
    expect(failed.needsShortReview).toBe(false);
    expect(failed.changed).toMatchObject({ id: "task-r3", dueDate: "2026-10-11", failStreak: 3, leech: true });

    const alone = rescheduleReviewFamily({
      item,
      siblings: [item],
      today: "2026-10-10",
      passed: false,
      failStreak: 1
    });
    expect(alone.needsShortReview).toBe(true);
    expect(alone.changed).toBeNull();
  });

  it("does not turn a zero denominator into 100 percent", () => {
    expect(formatRatioPercent(0, 0)).toBe("无样本");
    expect(formatRatioPercent(0, -1)).toBe("无样本");
    expect(formatRatioPercent(1, 2)).toBe("50%");
    expect(formatRatioPercent(3, 4)).toBe("75%");
  });

  it("keeps review grades inside the cloud result vocabulary", () => {
    expect(REVIEW_RESULTS).toEqual(expect.arrayContaining(["pass", "fail", "delay", "again", "hard", "good", "easy"]));
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

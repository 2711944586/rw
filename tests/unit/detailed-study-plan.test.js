import { describe, expect, it } from "vitest";
import {
  adaptiveAdjustmentRules,
  dailyLoadTemplates,
  dailyOperatingSchedule,
  dailyStudyProtocols,
  detailedPhasePlans,
  learningScienceRules,
  planChain,
  startup28DayPlan,
  subjectResourceStacks,
  weeklyStudyCycle
} from "../../src/data/detailed-study-plan.js";
import { sourceRegistry } from "../../src/data/reference-data.js";

describe("detailed study plan", () => {
  it("keeps all eight phases continuous and operational", () => {
    expect(detailedPhasePlans.map((phase) => phase.id)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(planChain).toEqual(["阶段", "周目标", "每日任务", "资料章节", "时间预算", "交付物", "验收线", "复盘日期", "调整规则"]);

    for (let index = 0; index < detailedPhasePlans.length - 1; index += 1) {
      const [, end] = detailedPhasePlans[index].range.split(" - ");
      const [nextStart] = detailedPhasePlans[index + 1].range.split(" - ");
      const expectedNext = new Date(`${end}T00:00:00Z`);
      expectedNext.setUTCDate(expectedNext.getUTCDate() + 1);
      expect(nextStart).toBe(expectedNext.toISOString().slice(0, 10));
    }

    for (const phase of detailedPhasePlans) {
      for (const field of ["range", "duration", "weeklyHours", "entryGate", "mission", "weeklyGoal"]) {
        expect(phase[field], `${phase.id}.${field}`).toBeTruthy();
      }
      expect(phase.exitGate.length, `${phase.id}.exitGate`).toBeGreaterThanOrEqual(3);
      expect(phase.adjustment.length, `${phase.id}.adjustment`).toBeGreaterThanOrEqual(3);
      expect(phase.subjects.length, `${phase.id}.subjects`).toBeGreaterThanOrEqual(3);
    }
  });

  it("requires every phase subject to end in evidence and a review decision", () => {
    const requiredFields = ["subject", "hours", "resource", "scope", "dailyTask", "output", "pass", "review"];
    for (const phase of detailedPhasePlans) {
      for (const subject of phase.subjects) {
        for (const field of requiredFields) {
          expect(subject[field], `${phase.id}.${subject.subject}.${field}`).toBeTruthy();
        }
        expect(subject.review).toContain("D+1");
        expect(subject.review).toContain("失败");
      }
    }
  });

  it("defines complete weekly, daily, resource, and adjustment protocols", () => {
    expect(weeklyStudyCycle).toHaveLength(7);
    for (const day of weeklyStudyCycle) {
      for (const field of ["core", "support", "review", "buffer", "stopRule", "output"]) {
        expect(day[field], `${day.label}.${field}`).toBeTruthy();
      }
    }

    expect(dailyLoadTemplates.map((item) => item.key)).toEqual(["bottomline", "normal", "strong"]);
    for (const template of dailyLoadTemplates) {
      for (const field of ["total", "allocation", "buffer", "trigger", "stopRule"]) {
        expect(template[field], `${template.key}.${field}`).toBeTruthy();
      }
    }

    expect(dailyOperatingSchedule).toHaveLength(7);
    for (const step of dailyOperatingSchedule) {
      for (const field of ["key", "label", "window", "action", "output"]) {
        expect(step[field], `${step.key}.${field}`).toBeTruthy();
      }
    }

    expect(Object.keys(dailyStudyProtocols).sort()).toEqual(["408", "复盘", "政治", "数学", "英语"].sort());
    for (const protocol of Object.values(dailyStudyProtocols)) {
      expect(protocol.blocks.length).toBeGreaterThanOrEqual(4);
      expect(protocol.volume).toBeTruthy();
    }

    expect(subjectResourceStacks.map((stack) => stack.key).sort()).toEqual(["cs408", "english", "math", "politics"]);
    for (const stack of subjectResourceStacks) {
      expect(stack.decision).toBeTruthy();
      expect(stack.primary).toBeTruthy();
      expect(stack.reservePolicy).toBeTruthy();
      expect(stack.stages.length).toBeGreaterThanOrEqual(5);
      for (const stage of stack.stages) {
        for (const field of ["stage", "window", "role", "material", "session", "evidence", "switchRule", "reserve"]) {
          expect(stage[field], `${stack.key}.${stage.stage}.${field}`).toBeTruthy();
        }
      }
    }
    expect(adaptiveAdjustmentRules.map(([label]) => label)).toEqual(["加量", "保持", "减量", "退阶", "换资料", "风险校准"]);
  });

  it("defines a continuous and executable first 28 days", () => {
    expect(startup28DayPlan).toHaveLength(28);
    expect(startup28DayPlan[0].date).toBe("2026-08-31");
    expect(startup28DayPlan.at(-1).date).toBe("2026-09-27");

    for (let index = 0; index < startup28DayPlan.length; index += 1) {
      const day = startup28DayPlan[index];
      expect(day.day).toBe(index + 1);
      expect(day.bufferMinutes).toBeGreaterThanOrEqual(15);
      expect(day.blocks.length).toBeGreaterThanOrEqual(3);
      expect(day.review).toBeTruthy();
      expect(day.stopRule).toBeTruthy();
      for (const [subject, minutes, task, output] of day.blocks) {
        expect(subject).toBeTruthy();
        expect(minutes).toBeGreaterThan(0);
        expect(task).toBeTruthy();
        expect(output).toBeTruthy();
      }
      if (index > 0) {
        const expected = new Date(`${startup28DayPlan[index - 1].date}T00:00:00Z`);
        expected.setUTCDate(expected.getUTCDate() + 1);
        expect(day.date).toBe(expected.toISOString().slice(0, 10));
      }
    }
  });

  it("states that spacing checkpoints are adaptive rather than a universal forgetting curve", () => {
    const spacing = learningScienceRules.find((rule) => rule.key === "spacing");
    expect(spacing.action).toContain("默认检查点");
    expect(spacing.action).toContain("失败后缩短");
    expect(spacing.guardrail).toContain("不存在适合所有知识和所有人的固定遗忘曲线");
  });

  it("registers the requested post, cross-check posts, and learning evidence", () => {
    const urls = sourceRegistry.map((source) => source.url);
    for (const expected of [
      "https://www.bilibili.com/opus/1188009441856847876",
      "https://www.bilibili.com/read/cv49067592",
      "https://www.bilibili.com/read/cv41089117",
      "https://blog.csdn.net/lee1hong/article/details/115488142",
      "https://journals.sagepub.com/doi/10.1177/1529100612453266",
      "https://www.science.org/doi/10.1126/science.1152408",
      "https://doi.org/10.1037/0033-2909.132.3.354",
      "https://doi.org/10.1037/bul0000209",
      "https://doi.org/10.5664/jcsm.4758"
    ]) {
      expect(urls).toContain(expected);
    }
  });
});

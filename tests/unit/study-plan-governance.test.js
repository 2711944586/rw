import { describe, expect, it } from "vitest";
import { subjectResourceStacks } from "../../src/data/detailed-study-plan.js";
import {
  oversightFeatureRoadmap,
  resourceGovernanceRules,
  resourceStageControl,
  resourceSubjectGovernance,
  studyCapacityPolicy,
  studyPlanCorrections
} from "../../src/data/study-plan-governance.js";
import {
  renderResourceDossierTemplate,
  renderStartupCalendarTemplate
} from "../../src/ui/study-plan-templates.js";
import { startup28DayPlan } from "../../src/data/detailed-study-plan.js";

describe("study plan governance", () => {
  it("treats hours as reference capacity and records the major plan corrections", () => {
    expect(studyCapacityPolicy.referenceHours).toBe(2200);
    expect(studyCapacityPolicy.label).toContain("不是必须");
    expect(studyCapacityPolicy.decisionWindow).toContain("14 天");
    expect(studyPlanCorrections.length).toBeGreaterThanOrEqual(6);
    expect(studyPlanCorrections.map((item) => item.issue).join(" ")).toContain("固定月份");
  });

  it("gives every subject and stage an activation, version, cadence, and audit contract", () => {
    expect(resourceGovernanceRules.length).toBeGreaterThanOrEqual(7);
    for (const stack of subjectResourceStacks) {
      const governance = resourceSubjectGovernance[stack.key];
      for (const field of ["officialAnchor", "prerequisite", "acquisition", "version", "conflict"]) {
        expect(governance?.[field], `${stack.key}.${field}`).toBeTruthy();
      }
      for (const stage of stack.stages) {
        const control = resourceStageControl(stack.key, stage);
        for (const field of ["activation", "cadence", "audit", "version"]) {
          expect(control[field], `${stack.key}.${stage.stage}.${field}`).toBeTruthy();
        }
      }
    }
  });

  it("keeps oversight suggestions actionable and prioritized", () => {
    expect(oversightFeatureRoadmap.length).toBeGreaterThanOrEqual(8);
    expect(oversightFeatureRoadmap.filter((item) => item.priority === "P0")).toHaveLength(3);
    for (const feature of oversightFeatureRoadmap) {
      expect(feature.name).toBeTruthy();
      expect(feature.value).toBeTruthy();
      expect(feature.acceptance).toBeTruthy();
    }
  });

  it("renders one readable startup week while preserving all four selectors", () => {
    const html = renderStartupCalendarTemplate(startup28DayPlan, 2);
    expect((html.match(/data-startup-week=/g) || [])).toHaveLength(4);
    expect((html.match(/class="startup-day-row"/g) || [])).toHaveLength(7);
    expect(html).toContain("data-week=\"3\"");
  });

  it("renders one subject dossier with access to every subject", () => {
    const html = renderResourceDossierTemplate(subjectResourceStacks, "cs408");
    expect((html.match(/data-resource-dossier-subject=/g) || [])).toHaveLength(4);
    expect((html.match(/class="resource-file"/g) || [])).toHaveLength(1);
    expect((html.match(/class="resource-stage-row"/g) || [])).toHaveLength(subjectResourceStacks.find((item) => item.key === "cs408").stages.length);
    expect(html).toContain("启用、频率与版本检查");
  });
});

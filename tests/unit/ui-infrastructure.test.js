import { describe, expect, it, vi } from "vitest";
import { navIconName } from "../../src/ui/icon-registry.js";
import { createViewRenderCoordinator } from "../../src/ui/view-render-coordinator.js";

describe("UI infrastructure", () => {
  it("keeps navigation icon names behind one registry", () => {
    expect(navIconName("home")).toBe("layout-dashboard");
    expect(navIconName("settings")).toBe("settings");
    expect(navIconName("unknown")).toBe("circle-gauge");
  });

  it("renders shared state and only the requested page", () => {
    const shared = vi.fn();
    const dashboard = vi.fn();
    const today = vi.fn();
    const settings = vi.fn();
    const after = vi.fn();
    const coordinator = createViewRenderCoordinator({
      renderShared: shared,
      renderers: { dashboard, today, settings },
      renderAfter: after
    });

    expect(coordinator.render("today")).toBe(true);
    expect(shared).toHaveBeenCalledWith("today");
    expect(today).toHaveBeenCalledTimes(1);
    expect(settings).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledWith("today");
    expect(coordinator.has("settings")).toBe(true);
    expect(coordinator.render("dashboard")).toBe(true);
    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(today).toHaveBeenCalledTimes(1);
  });

  it("rejects a coordinator without a shared renderer", () => {
    expect(() => createViewRenderCoordinator({ renderers: {} })).toThrow(TypeError);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { PrimaryNav } from "./PrimaryNav";
import type { MetricFilter } from "@/lib/filters/types";

// Stub usePathname so PrimaryNav (a client component) renders deterministically
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

function makeFilter(): MetricFilter {
  return {
    scope: { level: "repo", ids: ["my-repo"] },
    time: {
      range_days: 30,
      compare_days: 0,
      start_date: undefined,
      end_date: undefined,
    },
    who: {},
    what: {},
    why: {},
    how: {},
  };
}

describe("PrimaryNav — section composition", () => {
  it("renders the 'Cognitive Load' nav item exactly once (regression: CHAOS-1747)", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    // CHAOS-1747: the entry was duplicated under both Observe and Investigate.
    // Cognitive Load is a wellbeing/focus surface and belongs only under Observe.
    const cognitiveLoadLinks = screen.getAllByRole("link", {
      name: /cognitive load/i,
    });
    expect(cognitiveLoadLinks).toHaveLength(1);
    expect(cognitiveLoadLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/cognitive-load")
    );
  });

  it("preserves canonical section ordering: Cockpit, Observe, Investigate, TestOps", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const sectionHeadings = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => /cockpit|observe|investigate|testops/i.test(t));

    // Quick sanity that the four primary sections exist and are ordered correctly.
    // Loose match — exact heading text may include counts/icons.
    const indexOf = (label: string) =>
      sectionHeadings.findIndex((h) => new RegExp(label, "i").test(h));

    const cockpitIdx = indexOf("cockpit");
    const observeIdx = indexOf("observe");
    const investigateIdx = indexOf("investigate");
    const testopsIdx = indexOf("testops");

    expect(cockpitIdx).toBeGreaterThanOrEqual(0);
    expect(observeIdx).toBeGreaterThan(cockpitIdx);
    expect(investigateIdx).toBeGreaterThan(observeIdx);
    expect(testopsIdx).toBeGreaterThan(investigateIdx);
  });
});

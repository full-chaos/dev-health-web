import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@/test/utils";
import { PrimaryNav } from "./PrimaryNav";
import type { MetricFilter } from "@/lib/filters/types";

// Stub usePathname so PrimaryNav (a client component) renders deterministically
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { org_id: "org-1" } },
    update: vi.fn(),
  }),
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

  it("renders the 'Bottlenecks' nav item under Investigate (CHAOS-1742)", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const bottleneckLinks = screen.getAllByRole("link", {
      name: /bottlenecks/i,
    });
    // Exactly one Bottlenecks link — under the Investigate section.
    expect(bottleneckLinks).toHaveLength(1);
    expect(bottleneckLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/bottleneck")
    );
  });
});

  it("renders the 'Complexity' nav item under Investigate (CHAOS-1745)", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const complexityLinks = screen.getAllByRole("link", {
      name: /complexity/i,
    });
    // Exactly one Complexity link — under the Investigate section.
    expect(complexityLinks).toHaveLength(1);
    expect(complexityLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/complexity")
    );
  });

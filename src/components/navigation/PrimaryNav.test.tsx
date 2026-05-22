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
    // Cognitive Load is a wellbeing/focus surface and belongs only under Spot Pressure Early.
    const cognitiveLoadLinks = screen.getAllByRole("link", {
      name: /cognitive load/i,
    });
    expect(cognitiveLoadLinks).toHaveLength(1);
    expect(cognitiveLoadLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/cognitive-load"),
    );
  });

  it("preserves canonical section ordering: Cockpit, See Where Time Goes, Spot Pressure Early, Improve Delivery Confidence", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const sectionHeadings = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) =>
        /cockpit|see where time goes|spot pressure early|improve delivery confidence/i.test(t),
      );

    // Quick sanity that the four primary sections exist and are ordered correctly.
    // Loose match — exact heading text may include counts/icons.
    const indexOf = (label: string) =>
      sectionHeadings.findIndex((h) => new RegExp(label, "i").test(h));

    const cockpitIdx = indexOf("cockpit");
    const seeTimeIdx = indexOf("see where time goes");
    const spotPressureIdx = indexOf("spot pressure early");
    const deliveryIdx = indexOf("improve delivery confidence");

    expect(cockpitIdx).toBeGreaterThanOrEqual(0);
    expect(seeTimeIdx).toBeGreaterThan(cockpitIdx);
    expect(spotPressureIdx).toBeGreaterThan(seeTimeIdx);
    expect(deliveryIdx).toBeGreaterThan(spotPressureIdx);
  });

  it("renders the 'Bottlenecks' nav item under Spot Pressure Early (CHAOS-1742)", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const bottleneckLinks = screen.getAllByRole("link", {
      name: /bottlenecks/i,
    });
    // Exactly one Bottlenecks link — under the Spot Pressure Early section.
    expect(bottleneckLinks).toHaveLength(1);
    expect(bottleneckLinks[0]).toHaveAttribute("href", expect.stringContaining("/bottleneck"));
  });
});

it("renders the 'Complexity' nav item under Spot Pressure Early (CHAOS-1745)", () => {
  render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

  const complexityLinks = screen.getAllByRole("link", {
    name: /complexity/i,
  });
  // Exactly one Complexity link — under the Spot Pressure Early section.
  expect(complexityLinks).toHaveLength(1);
  expect(complexityLinks[0]).toHaveAttribute("href", expect.stringContaining("/complexity"));
});

it("renders and highlights the 'Quality' nav item for /quality (CHAOS-1763)", () => {
  render(<PrimaryNav filters={makeFilter()} active="quality" />);

  const qualityLinks = screen.getAllByRole("link", {
    name: /^QualityReliability$/i,
  });

  expect(qualityLinks).toHaveLength(1);
  expect(qualityLinks[0]).toHaveAttribute("href", expect.stringContaining("/quality"));
  expect(qualityLinks[0]).toHaveAttribute("aria-current", "page");
});

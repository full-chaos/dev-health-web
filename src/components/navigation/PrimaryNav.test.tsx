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
  it("keeps the collapsed IA to six primary sections with one AI Workflows entry", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const sectionHeadings = screen
      .getAllByRole("button")
      .map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim());

    expect(sectionHeadings).toHaveLength(6);
    expect(sectionHeadings).toEqual([
      "Cockpit",
      "Diagnose",
      "Improve",
      "Govern",
      "Reports",
      "Admin",
    ]);

    const aiLinks = screen.getAllByRole("link", { name: /^AI Workflows$/i });
    expect(aiLinks).toHaveLength(1);
    expect(aiLinks[0]).toHaveAttribute("href", expect.stringContaining("/ai"));
  });

  it("renders the 'Cognitive Load' nav item exactly once (regression: CHAOS-1747)", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    // CHAOS-1747: the entry was duplicated under both Observe and Investigate.
    // Cognitive Load is a wellbeing/focus surface and belongs only under Diagnose.
    const cognitiveLoadLinks = screen.getAllByRole("link", {
      name: /cognitive load/i,
    });
    expect(cognitiveLoadLinks).toHaveLength(1);
    expect(cognitiveLoadLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("/cognitive-load"),
    );
  });

  it("preserves canonical section ordering: Cockpit, Diagnose, Improve, Govern", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const sectionHeadings = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((t) => /cockpit|diagnose|improve|govern/i.test(t));

    // Quick sanity that the four primary sections exist and are ordered correctly.
    // Loose match — exact heading text may include counts/icons.
    const indexOf = (label: string) =>
      sectionHeadings.findIndex((h) => new RegExp(label, "i").test(h));

    const cockpitIdx = indexOf("cockpit");
    const diagnoseIdx = indexOf("diagnose");
    const improveIdx = indexOf("improve");
    const governIdx = indexOf("govern");

    expect(cockpitIdx).toBeGreaterThanOrEqual(0);
    expect(diagnoseIdx).toBeGreaterThan(cockpitIdx);
    expect(improveIdx).toBeGreaterThan(diagnoseIdx);
    expect(governIdx).toBeGreaterThan(improveIdx);
  });

  it("renders the 'Bottlenecks' nav item under Diagnose (CHAOS-1742)", () => {
    render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

    const bottleneckLinks = screen.getAllByRole("link", {
      name: /bottlenecks/i,
    });
    // Exactly one Bottlenecks link — under the Diagnose section.
    expect(bottleneckLinks).toHaveLength(1);
    expect(bottleneckLinks[0]).toHaveAttribute("href", expect.stringContaining("/bottleneck"));
  });
});

it("renders the 'Complexity' nav item under Diagnose (CHAOS-1745)", () => {
  render(<PrimaryNav filters={makeFilter()} active="dashboard" />);

  const complexityLinks = screen.getAllByRole("link", {
    name: /complexity/i,
  });
  // Exactly one Complexity link — under the Diagnose section.
  expect(complexityLinks).toHaveLength(1);
  expect(complexityLinks[0]).toHaveAttribute("href", expect.stringContaining("/complexity"));
});

it("renders and highlights the 'Quality' nav item for /quality (CHAOS-1763)", () => {
  render(<PrimaryNav filters={makeFilter()} active="quality" />);

  const qualityLinks = screen.getAllByRole("link", {
    name: /^Quality$/i,
  });

  expect(qualityLinks).toHaveLength(1);
  expect(qualityLinks[0]).toHaveAttribute("href", expect.stringContaining("/quality"));
  expect(qualityLinks[0]).toHaveAttribute("aria-current", "page");
});

it.each([
  { active: "home", label: /^Home$/i, href: "/dashboard" },
  { active: "work", label: /^Work$/i, href: "/work" },
  { active: "ai-workflows", label: /^AI Workflows$/i, href: "/ai" },
  { active: "testops", label: /^TestOps$/i, href: "/testops" },
  { active: "reports", label: /^Report Center$/i, href: "/reports" },
  { active: "admin", label: /^Settings$/i, href: "/admin" },
])(
  "highlights $active as the active nav item for representative routes",
  ({ active, label, href }) => {
    render(<PrimaryNav filters={makeFilter()} active={active} />);

    const link = screen.getByRole("link", { name: label });
    expect(link).toHaveAttribute("href", expect.stringContaining(href));
    expect(link).toHaveAttribute("aria-current", "page");
  },
);

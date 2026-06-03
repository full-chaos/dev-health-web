import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@/test/utils";
import { PrimaryNav } from "./PrimaryNav";
import type { MetricFilter } from "@/lib/filters/types";

// Stub usePathname so PrimaryNav (a client component) renders deterministically
const navigationMock = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
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

beforeEach(() => {
  navigationMock.pathname = "/dashboard";
});

function currentPageLinks() {
  return screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
}

describe("PrimaryNav — collapsed decision-area surface (CHAOS-2073)", () => {
  it("renders exactly six decision-area links and nothing else navigable", () => {
    render(<PrimaryNav filters={makeFilter()} active="home" />);

    const linkNames = screen
      .getAllByRole("link")
      .map((link) => (link.textContent ?? "").replace(/\s+/g, " ").trim());

    expect(linkNames).toEqual(["Cockpit", "Diagnose", "Improve", "Govern", "Reports", "Admin"]);
  });

  it("renders no collapsible group buttons (no expand/collapse machinery)", () => {
    render(<PrimaryNav filters={makeFilter()} active="home" />);
    // The previous IA rendered six group <button> headers; the collapsed surface
    // has none — areas are direct links, not toggles.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it.each([
    /^Work$/i,
    /^Metrics$/i,
    /^People$/i,
    /^Code$/i,
    /^Complexity$/i,
    /^Cognitive Load$/i,
    /^Bottlenecks$/i,
    /^Capacity Planning$/i,
    /^AI Workflows$/i,
    /^Operating Review$/i,
    /^Pipelines$/i,
    /^Tests$/i,
    /^Quality$/i,
    /^Coverage$/i,
    /^Delivery Risk$/i,
    /^Incident Correlation$/i,
    /^Security$/i,
    /^Feature Flags$/i,
    /^Compounding Risk$/i,
    /^Report Center$/i,
  ])("does not list the leaf destination %s flat in the sidebar", (leaf) => {
    render(<PrimaryNav filters={makeFilter()} active="home" />);
    expect(screen.queryByRole("link", { name: leaf })).toBeNull();
  });

  it("collapses Diagnose and Govern so neither renders 8–10 individual items", () => {
    navigationMock.pathname = "/work";
    render(<PrimaryNav filters={makeFilter()} active="work" />);
    // Exactly one Diagnose row and one Govern row — not the old 8/10 flat lists.
    expect(screen.getAllByRole("link", { name: /^Diagnose$/i })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /^Govern$/i })).toHaveLength(1);
  });

  it("links each area to its landing route", () => {
    render(<PrimaryNav filters={makeFilter()} active="home" />);

    const expectations: Array<[RegExp, string]> = [
      [/^Cockpit$/i, "/dashboard"],
      [/^Diagnose$/i, "/work"],
      [/^Improve$/i, "/opportunities"],
      [/^Govern$/i, "/testops"],
      [/^Reports$/i, "/reports"],
      [/^Admin$/i, "/admin"],
    ];

    for (const [name, href] of expectations) {
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "href",
        expect.stringContaining(href),
      );
    }
  });
});

describe("PrimaryNav — active-area resolution (A10: one selected at a time)", () => {
  it.each([
    { pathname: "/dashboard", active: "home", area: /^Cockpit$/i },
    {
      pathname: "/operating-review",
      active: "operating-review",
      area: /^Cockpit$/i,
    },
    { pathname: "/work", active: "work", area: /^Diagnose$/i },
    { pathname: "/metrics", active: "metrics", area: /^Diagnose$/i },
    { pathname: "/people", active: "people", area: /^Diagnose$/i },
    { pathname: "/complexity", active: "complexity", area: /^Diagnose$/i },
    { pathname: "/bottleneck", active: "bottleneck", area: /^Diagnose$/i },
    {
      pathname: "/explore/landscape",
      active: "landscape",
      area: /^Diagnose$/i,
    },
    { pathname: "/opportunities", active: "opportunities", area: /^Improve$/i },
    {
      pathname: "/capacity-planning",
      active: "capacity-planning",
      area: /^Improve$/i,
    },
    { pathname: "/ai/impact", active: "ai-workflows", area: /^Improve$/i },
    { pathname: "/testops", active: "testops", area: /^Govern$/i },
    { pathname: "/testops/risk", active: "risk", area: /^Govern$/i },
    { pathname: "/quality", active: "quality", area: /^Govern$/i },
    { pathname: "/security", active: "security", area: /^Govern$/i },
    {
      pathname: "/risk/compounding",
      active: "risk-compounding",
      area: /^Govern$/i,
    },
    { pathname: "/reports", active: "reports", area: /^Reports$/i },
    { pathname: "/admin", active: "admin", area: /^Admin$/i },
  ])("highlights the owning area for leaf route $pathname", ({ pathname, active, area }) => {
    navigationMock.pathname = pathname;
    render(<PrimaryNav filters={makeFilter()} active={active} />);

    expect(screen.getByRole("link", { name: area })).toHaveAttribute("aria-current", "page");
    expect(currentPageLinks()).toHaveLength(1);
  });

  it("uses the longest pathname match and ignores a stale active prop", () => {
    // /testops/risk belongs to Govern; the stale active="people" (Diagnose) must lose.
    navigationMock.pathname = "/testops/risk";
    render(<PrimaryNav filters={makeFilter()} active="people" />);

    expect(screen.getByRole("link", { name: /^Govern$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Diagnose$/i })).not.toHaveAttribute("aria-current");
    expect(currentPageLinks()).toHaveLength(1);
  });

  it("falls back to the active prop's area when no pathname prefix matches", () => {
    // Evidence/detail routes (e.g. /prs/[id]) are not owned by any area prefix.
    navigationMock.pathname = "/prs/123";
    render(<PrimaryNav filters={makeFilter()} active="people" />);

    expect(screen.getByRole("link", { name: /^Diagnose$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(currentPageLinks()).toHaveLength(1);
  });
});

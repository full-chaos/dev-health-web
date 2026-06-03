import { describe, it, expect } from "vitest";
import { navAreas, getAreaById, selectedAreaIdForPathname, type NavAreaId } from "../areas";

/**
 * Snapshot of the pre-collapse PrimaryNav leaf destinations (CHAOS-2043 state).
 * CHAOS-2073 removes these from the sidebar, but every one MUST stay reachable
 * via an area landing route or that area's AreaHub drill-down. This test fails
 * loudly if any future edit drops a destination on the floor.
 */
const LEGACY_LEAVES: ReadonlyArray<{ id: string; href: string }> = [
  { id: "home", href: "/dashboard" },
  { id: "operating-review", href: "/operating-review" },
  { id: "work", href: "/work" },
  { id: "metrics", href: "/metrics?tab=dora" },
  { id: "people", href: "/people" },
  { id: "code", href: "/code" },
  { id: "landscape", href: "/explore/landscape" },
  { id: "complexity", href: "/complexity" },
  { id: "cognitive-load", href: "/cognitive-load" },
  { id: "bottleneck", href: "/bottleneck" },
  { id: "opportunities", href: "/opportunities" },
  { id: "capacity-planning", href: "/capacity-planning" },
  { id: "ai-workflows", href: "/ai" },
  { id: "testops", href: "/testops" },
  { id: "pipelines", href: "/testops/pipelines" },
  { id: "tests", href: "/testops/tests" },
  { id: "quality", href: "/quality" },
  { id: "coverage", href: "/testops/coverage" },
  { id: "risk", href: "/testops/risk" },
  { id: "incident-correlation", href: "/incident-correlation" },
  { id: "security", href: "/security" },
  { id: "feature-flags", href: "/feature-flags" },
  { id: "risk-compounding", href: "/risk/compounding" },
  { id: "reports", href: "/reports" },
  { id: "admin", href: "/admin" },
];

const basePath = (href: string) => href.split("?")[0].split("#")[0];

describe("navAreas — decision-area surface", () => {
  it("declares exactly six areas in canonical order", () => {
    expect(navAreas.map((a) => a.id)).toEqual([
      "cockpit",
      "diagnose",
      "improve",
      "govern",
      "reports",
      "admin",
    ]);
  });

  it("keeps the main spine to four areas and the utility tray to two", () => {
    expect(navAreas.filter((a) => a.placement === "main").map((a) => a.id)).toEqual([
      "cockpit",
      "diagnose",
      "improve",
      "govern",
    ]);
    expect(navAreas.filter((a) => a.placement === "utility").map((a) => a.id)).toEqual([
      "reports",
      "admin",
    ]);
  });
});

describe("navAreas — leaf reachability (no orphaned routes)", () => {
  const areaLandingPaths = new Set(navAreas.map((a) => basePath(a.href)));
  const hubItemPaths = new Set(
    navAreas.flatMap((a) => a.hubItems.map((item) => basePath(item.href))),
  );

  it.each(LEGACY_LEAVES)(
    "keeps the legacy leaf '$id' reachable via an area landing or hub",
    ({ href }) => {
      const path = basePath(href);
      expect(areaLandingPaths.has(path) || hubItemPaths.has(path)).toBe(true);
    },
  );

  it("does not list a leaf both as an area landing and as a hub item", () => {
    for (const item of navAreas.flatMap((a) => a.hubItems)) {
      expect(areaLandingPaths.has(basePath(item.href))).toBe(false);
    }
  });

  it("has unique hub item ids across all areas", () => {
    const ids = navAreas.flatMap((a) => a.hubItems.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("selectedAreaIdForPathname", () => {
  const cases: Array<{ pathname: string; expected: NavAreaId }> = [
    { pathname: "/dashboard", expected: "cockpit" },
    { pathname: "/operating-review", expected: "cockpit" },
    { pathname: "/work", expected: "diagnose" },
    { pathname: "/metrics", expected: "diagnose" },
    { pathname: "/people/abc", expected: "diagnose" },
    { pathname: "/explore/landscape", expected: "diagnose" },
    { pathname: "/opportunities", expected: "improve" },
    { pathname: "/capacity-planning", expected: "improve" },
    { pathname: "/ai/impact", expected: "improve" },
    { pathname: "/testops", expected: "govern" },
    { pathname: "/testops/risk", expected: "govern" },
    { pathname: "/quality", expected: "govern" },
    { pathname: "/security/repos/123", expected: "govern" },
    { pathname: "/risk/compounding", expected: "govern" },
    { pathname: "/feature-flags", expected: "govern" },
    { pathname: "/reports/new", expected: "reports" },
    { pathname: "/admin/users", expected: "admin" },
    { pathname: "/settings", expected: "admin" },
  ];

  it.each(cases)("resolves $pathname to $expected", ({ pathname, expected }) => {
    expect(selectedAreaIdForPathname(navAreas, pathname)).toBe(expected);
  });

  it("prefers the longest prefix and ignores a stale fallback", () => {
    // /testops/risk is Govern; a stale Diagnose fallback must not win.
    expect(selectedAreaIdForPathname(navAreas, "/testops/risk", "people")).toBe("govern");
  });

  it("falls back to the area owning the active id when no path matches", () => {
    expect(selectedAreaIdForPathname(navAreas, "/prs/123", "people")).toBe("diagnose");
    expect(selectedAreaIdForPathname(navAreas, "/issues/9", "security")).toBe("govern");
  });

  it("returns undefined when neither path nor fallback resolves", () => {
    expect(selectedAreaIdForPathname(navAreas, "/prs/123")).toBeUndefined();
    expect(selectedAreaIdForPathname(navAreas, "/prs/123", "nonexistent")).toBeUndefined();
  });

  it("does not match a sibling prefix by string-prefix accident", () => {
    // "/capacity" must not swallow "/capacity-planning" and vice versa.
    expect(selectedAreaIdForPathname(navAreas, "/capacity-planning")).toBe("improve");
  });
});

describe("getAreaById", () => {
  it("returns the matching area", () => {
    expect(getAreaById("govern")?.label).toBe("Govern");
  });
});

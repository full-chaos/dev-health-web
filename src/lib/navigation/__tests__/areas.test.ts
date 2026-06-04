import { describe, it, expect } from "vitest";
import {
  navAreas,
  getAreaById,
  selectedAreaIdForPathname,
  selectedChildForPathname,
  navTrailForPathname,
  navTitleForPathname,
  type NavAreaId,
} from "../areas";

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
    // Operating Review moved Cockpit → Improve (CHAOS-2075).
    { pathname: "/operating-review", expected: "improve" },
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

// ── Two-level sidebar route tree (CHAOS-2075) ─────────────────────────────────

const areaById = (id: NavAreaId) => {
  const area = getAreaById(id);
  if (!area) throw new Error(`missing area ${id}`);
  return area;
};

describe("navArea.children — sidebar route tree", () => {
  it("Cockpit has no expandable children (single destination)", () => {
    expect(areaById("cockpit").children).toHaveLength(0);
  });

  it("every navVisible child path resolves to a real, app-owned route", () => {
    // navVisible children must point at routes the app actually serves — phantom
    // routes are `preview` and excluded from this guarantee.
    for (const area of navAreas) {
      for (const child of area.children.filter((c) => c.navVisible)) {
        expect(selectedAreaIdForPathname(navAreas, basePath(child.path))).toBe(area.id);
      }
    }
  });

  it("has unique child ids across all areas", () => {
    const ids = navAreas.flatMap((a) => a.children.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the Tests · Quality · Coverage cluster as one row owning three paths", () => {
    const cluster = areaById("govern").children.find((c) => c.isCluster);
    expect(cluster?.label).toBe("Tests · Quality · Coverage");
    expect(cluster?.ownedPaths).toEqual(["/testops/tests", "/quality", "/testops/coverage"]);
    // Pipelines is a sibling row, never folded into the cluster.
    expect(areaById("govern").children.some((c) => c.id === "pipelines" && !c.isCluster)).toBe(
      true,
    );
  });
});

describe("selectedChildForPathname — active child (A10: exactly one)", () => {
  // The issue's active-state matrix: the destination → which child lights up.
  const cases: Array<{ areaId: NavAreaId; pathname: string; childId: string | undefined }> = [
    { areaId: "cockpit", pathname: "/dashboard", childId: undefined },
    { areaId: "diagnose", pathname: "/work", childId: "work" },
    { areaId: "diagnose", pathname: "/metrics", childId: "metrics" },
    { areaId: "improve", pathname: "/ai", childId: "ai-workflows" },
    { areaId: "improve", pathname: "/ai/impact", childId: "ai-workflows" },
    { areaId: "improve", pathname: "/operating-review", childId: "operating-review" },
    { areaId: "govern", pathname: "/testops", childId: "testops" },
    { areaId: "govern", pathname: "/testops/pipelines", childId: "pipelines" },
    { areaId: "govern", pathname: "/testops/coverage", childId: "tests-quality-coverage" },
    { areaId: "govern", pathname: "/quality", childId: "tests-quality-coverage" },
    { areaId: "govern", pathname: "/testops/tests", childId: "tests-quality-coverage" },
    { areaId: "govern", pathname: "/testops/risk", childId: "risk" },
    { areaId: "reports", pathname: "/reports", childId: "report-center" },
    { areaId: "admin", pathname: "/admin/settings", childId: "settings" },
    { areaId: "admin", pathname: "/admin/integrations", childId: "connections" },
    { areaId: "admin", pathname: "/data-health", childId: "data-confidence" },
  ];

  it.each(cases)("$pathname → child $childId", ({ areaId, pathname, childId }) => {
    expect(selectedChildForPathname(areaById(areaId), pathname)?.id).toBe(childId);
  });

  it("lights the cluster child on ALL of its owned paths and nothing else", () => {
    const govern = areaById("govern");
    for (const path of ["/testops/coverage", "/quality", "/testops/tests"]) {
      const child = selectedChildForPathname(govern, path);
      expect(child?.id).toBe("tests-quality-coverage");
      expect(child?.isCluster).toBe(true);
    }
  });

  it("prefers the more specific sibling over the area Overview", () => {
    // /testops/pipelines must beat /testops (Overview), not fall through to it.
    expect(selectedChildForPathname(areaById("govern"), "/testops/pipelines")?.id).toBe(
      "pipelines",
    );
  });

  it("never selects a preview (navVisible:false) child", () => {
    // A preview child is excluded from resolution entirely: hitting its phantom
    // path resolves to a navVisible ancestor (Report Center), never the preview
    // row itself — so a preview destination can never light up in the sidebar.
    const reports = areaById("reports");
    const previewIds = new Set(reports.children.filter((c) => !c.navVisible).map((c) => c.id));
    for (const path of ["/reports/weekly", "/reports/executive", "/reports/exports"]) {
      const selectedId = selectedChildForPathname(reports, path)?.id;
      expect(previewIds.has(selectedId ?? "")).toBe(false);
    }
  });

  it("returns undefined for an owned area route with no matching child", () => {
    // /admin/users is Admin-owned but is not one of the navVisible children.
    expect(selectedChildForPathname(areaById("admin"), "/admin/users")).toBeUndefined();
  });
});

describe("navTitleForPathname / navTrailForPathname (A6: labels agree)", () => {
  it("titles a child page with the child's sidebar label", () => {
    expect(navTitleForPathname("/metrics")).toBe("Metrics");
    expect(navTitleForPathname("/admin/settings")).toBe("Settings");
    expect(navTitleForPathname("/operating-review")).toBe("Operating Review");
    // Cluster page is titled by the cluster row label across every owned path.
    expect(navTitleForPathname("/quality")).toBe("Tests · Quality · Coverage");
    expect(navTitleForPathname("/testops/tests")).toBe("Tests · Quality · Coverage");
  });

  it("titles an area-landing route (== a child's route) with the AREA name", () => {
    // /work is the Diagnose landing AND a child route → the area name wins (A6:
    // the page is "Diagnose", not the borrowed "Work" leaf).
    expect(navTitleForPathname("/work")).toBe("Diagnose");
    expect(navTitleForPathname("/testops")).toBe("Govern");
    // /reports is both the Reports landing and the Report Center child route →
    // the area name ("Reports") wins, not the child label.
    expect(navTitleForPathname("/reports")).toBe("Reports");
  });

  it("builds an Area → Child trail whose last crumb label === the child label", () => {
    const trail = navTrailForPathname("/admin/settings");
    expect(trail.map((c) => c.label)).toEqual(["Admin", "Settings"]);
    // Area crumb links to its landing; the child crumb is the current page (no href).
    expect(trail[0]?.href).toBe(areaById("admin").href);
    expect(trail[trail.length - 1]?.href).toBeUndefined();
    // Crumb label is verbatim the sidebar child label (A6).
    const settingsChild = areaById("admin").children.find((c) => c.id === "settings");
    expect(trail[trail.length - 1]?.label).toBe(settingsChild?.label);
  });

  it("collapses an area-landing route to a single, link-less area crumb", () => {
    const trail = navTrailForPathname("/work");
    expect(trail).toEqual([{ label: "Diagnose" }]);
  });

  it("returns an empty trail/title for routes no area owns", () => {
    expect(navTrailForPathname("/prs/123")).toEqual([]);
    expect(navTitleForPathname("/prs/123")).toBe("");
  });
});

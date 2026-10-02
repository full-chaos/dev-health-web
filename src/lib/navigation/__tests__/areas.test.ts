import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
    isNavChildVisible,
    navAreas,
    getAreaById,
    selectedAreaIdForPathname,
    selectedChildForPathname,
    navTrailForPathname,
    navTitleForPathname,
    type NavAreaId,
} from "../areas";

const basePath = (href: string) => href.split("?")[0].split("#")[0];

const areaById = (id: NavAreaId) => {
    const area = getAreaById(id);
    if (!area) throw new Error(`missing area ${id}`);
    return area;
};

const routePageExists = (routePath: string) => {
    const segments = basePath(routePath).split("/").filter(Boolean);
    return [
        join(process.cwd(), "src/app/(app)", ...segments, "page.tsx"),
        join(process.cwd(), "src/app", ...segments, "page.tsx"),
    ].some((candidate) => existsSync(candidate));
};

describe("navAreas — locked 8-area decision surface", () => {
    it("declares exactly eight areas in canonical order", () => {
        expect(navAreas.map((a) => a.id)).toEqual([
            "cockpit",
            "diagnose",
            "plan",
            "improve",
            "govern",
            "ai",
            "reports",
            "admin",
        ]);
    });

    it("keeps the main spine to six areas and the utility tray to two", () => {
        expect(navAreas.filter((a) => a.placement === "main").map((a) => a.id)).toEqual([
            "cockpit",
            "diagnose",
            "plan",
            "improve",
            "govern",
            "ai",
        ]);
        expect(navAreas.filter((a) => a.placement === "utility").map((a) => a.id)).toEqual([
            "reports",
            "admin",
        ]);
    });
});

describe("navArea.children — locked child navigation", () => {
    it("matches CHAOS-2079 locked child labels verbatim", () => {
        expect(
            Object.fromEntries(
                navAreas.map((area) => [area.label, area.children.map((child) => child.label)]),
            ),
        ).toEqual({
            Home: [],
            Diagnose: [
                "Overview",
                "Flow",
                "Investment",
                "Landscape",
                "Work Graph",
                "Complexity",
                "Cognitive Load",
                "Bottlenecks",
                // CHAOS-3524 (chris's ruling): Ask Dev removed as a
                // left-nav destination — one ingress only, the in-context
                // trigger/window path.
                "People",
                "Code",
            ],
            Plan: ["Overview", "Completion Forecast", "Backlog Risk", "Operating Review"],
            Improve: ["Overview", "Opportunities", "Experiments", "Automations"],
            Govern: [
                "Overview",
                "TestOps",
                "Quality",
                "Delivery Risk",
                "Incident Correlation",
                "Security",
                "Feature Flags",
                "Compounding Risk",
            ],
            // CHAOS-2197: Test Gaps + Evidence are tabs inside Governance Risk
            // (decision recorded on the ticket); their child rows are retired.
            AI: [
                "Overview",
                "Impact",
                "Attribution",
                "Review Load",
                "Governance Risk",
                "Automations",
            ],
            Reports: ["Report Center", "Weekly Review", "Executive Summary", "Export History"],
            // CHAOS-7967: "Platform" and "Platform billing" are listed only for platform admins.
            Admin: [
                "Organization",
                "Connections",
                "Data Confidence",
                "Settings",
                "Platform",
                "Platform billing",
                "Billing",
            ],
        });
    });

    it("lists the platform admin destinations only for a platform admin (CHAOS-7967)", () => {
        const admin = navAreas.find((area) => area.id === "admin")!;
        const listed = (isPlatformAdmin: boolean) =>
            admin.children
                .filter((child) => isNavChildVisible(child, {}, { isPlatformAdmin }))
                .map((child) => child.label);
        expect(listed(false)).toEqual([
            "Organization",
            "Connections",
            "Data Confidence",
            "Settings",
        ]);
        expect(listed(true)).toEqual([
            "Organization",
            "Connections",
            "Data Confidence",
            "Settings",
            "Platform",
            "Platform billing",
        ]);
        // No viewer given: not a platform admin.
        expect(
            admin.children.filter((child) => isNavChildVisible(child, {})).map((c) => c.label),
        ).toEqual(listed(false));
    });

    it("has unique child ids across all areas", () => {
        const ids = navAreas.flatMap((a) => a.children.map((c) => c.id));
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("marks every hidden child as preview-only", () => {
        for (const child of navAreas.flatMap((a) => a.children)) {
            if (!child.navVisible) expect(child.preview).toBe(true);
        }
    });

    it("does not expose a navVisible child without a real app page", () => {
        for (const area of navAreas) {
            for (const child of area.children.filter((c) => c.navVisible)) {
                expect(
                    routePageExists(child.path),
                    `${area.id}:${child.label} -> ${child.path}`,
                ).toBe(true);
            }
        }
    });
});

describe("selectedAreaIdForPathname", () => {
    const cases: Array<{ pathname: string; expected: NavAreaId }> = [
        { pathname: "/dashboard", expected: "cockpit" },
        { pathname: "/diagnose", expected: "diagnose" },
        { pathname: "/diagnose/work-graph", expected: "diagnose" },
        { pathname: "/metrics", expected: "diagnose" },
        { pathname: "/investment", expected: "diagnose" },
        { pathname: "/people/abc", expected: "diagnose" },
        { pathname: "/landscape", expected: "diagnose" },
        { pathname: "/explore", expected: "diagnose" },
        { pathname: "/agent-context/context-packet", expected: "diagnose" },
        { pathname: "/plan", expected: "plan" },
        { pathname: "/plan/delivery-forecast", expected: "plan" },
        { pathname: "/capacity-planning", expected: "plan" },
        { pathname: "/operating-review", expected: "plan" },
        { pathname: "/opportunities", expected: "improve" },
        { pathname: "/ai/impact", expected: "ai" },
        { pathname: "/ai/review-load", expected: "ai" },
        { pathname: "/govern", expected: "govern" },
        { pathname: "/testops", expected: "govern" },
        { pathname: "/testops/risk", expected: "govern" },
        { pathname: "/quality", expected: "govern" },
        { pathname: "/security/repos/123", expected: "govern" },
        { pathname: "/risk/compounding", expected: "govern" },
        { pathname: "/feature-flags", expected: "govern" },
        { pathname: "/reports/new", expected: "reports" },
        { pathname: "/org/admin/users", expected: "admin" },
        { pathname: "/settings", expected: "admin" },
    ];

    it.each(cases)("resolves $pathname to $expected", ({ pathname, expected }) => {
        expect(selectedAreaIdForPathname(navAreas, pathname)).toBe(expected);
    });

    it("prefers the longest prefix and ignores a stale fallback", () => {
        expect(selectedAreaIdForPathname(navAreas, "/testops/risk", "people")).toBe("govern");
    });

    it("falls back to the area owning the active id when no path matches", () => {
        expect(selectedAreaIdForPathname(navAreas, "/demo", "people")).toBe("diagnose");
        expect(selectedAreaIdForPathname(navAreas, "/demo", "security")).toBe("govern");
    });

    it("returns undefined when neither path nor fallback resolves", () => {
        expect(selectedAreaIdForPathname(navAreas, "/demo")).toBeUndefined();
        expect(selectedAreaIdForPathname(navAreas, "/demo", "nonexistent")).toBeUndefined();
    });

    it("does not match a sibling prefix by string-prefix accident", () => {
        expect(selectedAreaIdForPathname(navAreas, "/capacity-planning")).toBe("plan");
    });
});

describe("getAreaById", () => {
    it("returns the matching area", () => {
        expect(getAreaById("govern")?.label).toBe("Govern");
    });
});

describe("Govern overview cards — the approved groups (QUALITY, RISK)", () => {
    const hubItems = areaById("govern").hubItems;

    it("groups TestOps and Quality under Quality, and the risk destinations under Risk, in the approved order", () => {
        const idsOf = (cluster: string) =>
            hubItems.filter((item) => item.cluster === cluster).map((item) => item.id);
        expect(idsOf("Quality")).toEqual(["testops", "quality"]);
        expect(idsOf("Risk")).toEqual([
            "security",
            "risk",
            "risk-compounding",
            "incident-correlation",
            "feature-flags",
        ]);
        expect(
            hubItems.every((item) => item.cluster === "Quality" || item.cluster === "Risk"),
        ).toBe(true);
    });

    it("draws no Govern card secondary: Feature Flags is a normal Risk card", () => {
        expect(hubItems.filter((item) => item.demoted === true).map((item) => item.id)).toEqual([]);
    });
});

describe("selectedChildForPathname — active child (A10: exactly one)", () => {
    const cases: Array<{
        areaId: NavAreaId;
        pathname: string;
        childId: string | undefined;
    }> = [
        { areaId: "cockpit", pathname: "/dashboard", childId: undefined },
        { areaId: "diagnose", pathname: "/diagnose", childId: "diagnose-overview" },
        {
            areaId: "diagnose",
            pathname: "/diagnose/work-graph",
            childId: "work-graph",
        },
        { areaId: "diagnose", pathname: "/metrics", childId: "flow" },
        { areaId: "diagnose", pathname: "/investment", childId: "investment" },
        { areaId: "diagnose", pathname: "/landscape", childId: "landscape" },
        // CHAOS-3524 (chris's ruling): Ask Dev is no longer a left-nav
        // destination — /dev resolves to Diagnose (see the
        // selectedAreaIdForPathname case above) but selects no CHILD row
        // anymore, covered by its own dedicated test below rather than a
        // case in this table.
        {
            areaId: "plan",
            pathname: "/plan",
            childId: "plan-overview",
        },
        {
            areaId: "plan",
            pathname: "/plan/delivery-forecast",
            childId: "plan-overview",
        },
        {
            areaId: "plan",
            pathname: "/plan/capacity",
            childId: "capacity",
        },
        {
            areaId: "plan",
            pathname: "/plan/backlog-risk",
            childId: "backlog-risk",
        },
        // NOTE: operating-review is hidden (navVisible: false, CHAOS-2181
        // follow-up) and therefore intentionally absent from selection cases.
        {
            areaId: "improve",
            pathname: "/opportunities",
            childId: "opportunities",
        },
        { areaId: "ai", pathname: "/ai", childId: "ai-overview" },
        { areaId: "ai", pathname: "/ai/impact", childId: "ai-impact" },
        { areaId: "ai", pathname: "/ai/review-load", childId: "ai-review-load" },
        { areaId: "govern", pathname: "/govern", childId: "govern-overview" },
        { areaId: "govern", pathname: "/testops", childId: "testops" },
        { areaId: "govern", pathname: "/testops/pipelines", childId: "testops" },
        { areaId: "govern", pathname: "/testops/coverage", childId: "testops" },
        { areaId: "govern", pathname: "/quality", childId: "quality" },
        { areaId: "govern", pathname: "/testops/tests", childId: "testops" },
        { areaId: "govern", pathname: "/testops/risk", childId: "risk" },
        { areaId: "reports", pathname: "/reports", childId: "report-center" },
        { areaId: "admin", pathname: "/org/admin", childId: "organization" },
        { areaId: "admin", pathname: "/org/admin/sync", childId: "connections" },
        { areaId: "admin", pathname: "/data-health", childId: "data-confidence" },
        { areaId: "admin", pathname: "/settings", childId: "settings" },
    ];

    it.each(cases)("$pathname → child $childId", ({ areaId, pathname, childId }) => {
        expect(selectedChildForPathname(areaById(areaId), pathname)?.id).toBe(childId);
    });

    it("resolves TestOps tab subroutes to the single cluster sidebar row", () => {
        expect(selectedChildForPathname(areaById("govern"), "/testops/pipelines")?.id).toBe(
            "testops",
        );
        expect(selectedChildForPathname(areaById("govern"), "/testops/tests")?.id).toBe("testops");
        expect(selectedChildForPathname(areaById("govern"), "/testops/coverage")?.id).toBe(
            "testops",
        );

        const testOps = areaById("govern").children.find((child) => child.id === "testops");
        expect(testOps?.label).toBe("TestOps");
        expect(testOps?.isCluster).toBe(true);
        expect(testOps?.ownedPaths).toEqual([
            "/testops",
            "/testops/pipelines",
            "/testops/tests",
            "/testops/coverage",
        ]);
    });

    it("never selects a preview (navVisible:false) child", () => {
        const previewPaths = navAreas.flatMap((area) =>
            area.children
                .filter((child) => !child.navVisible)
                .map((child) => [area.id, child.path] as const),
        );
        for (const [areaId, path] of previewPaths) {
            expect(selectedChildForPathname(areaById(areaId), path)?.navVisible).not.toBe(false);
        }
    });

    it("selects NO child on the route of a preview (navVisible:false) child: a visible sibling with a shorter prefix does not claim it", () => {
        // The case that was wrong: the AI Overview child (`/ai`) claimed
        // `/ai/attribution`, so the sidebar and the trail said "Overview" there.
        expect(selectedChildForPathname(areaById("ai"), "/ai/attribution")).toBeUndefined();
        expect(navTrailForPathname("/ai/attribution")).toEqual([{ label: "AI" }]);
        expect(navTitleForPathname("/ai/attribution")).toBe("AI");

        const previewPaths = navAreas.flatMap((area) =>
            area.children
                .filter((child) => !child.navVisible)
                .map((child) => [area.id, child.path] as const),
        );
        expect(previewPaths.length).toBeGreaterThan(0);
        for (const [areaId, path] of previewPaths) {
            expect(selectedChildForPathname(areaById(areaId), path), path).toBeUndefined();
        }
    });

    it("still selects the visible child with the longest prefix, and the area Overview on its own route", () => {
        expect(selectedChildForPathname(areaById("ai"), "/ai")?.id).toBe("ai-overview");
        expect(selectedChildForPathname(areaById("ai"), "/ai/impact")?.id).toBe("ai-impact");
        expect(selectedChildForPathname(areaById("ai"), "/ai/impact/evidence")?.id).toBe(
            "ai-impact",
        );
        expect(navTrailForPathname("/ai/impact/evidence")).toEqual([
            { label: "AI", href: "/ai" },
            { label: "Impact" },
        ]);
    });

    it("links Flow sidebar rows to the Flow metrics tab while keeping /metrics active", () => {
        const flowChild = areaById("diagnose").children.find((child) => child.id === "flow");
        expect(flowChild?.path).toBe("/metrics?tab=flow");
        expect(selectedChildForPathname(areaById("diagnose"), "/metrics")?.id).toBe("flow");
    });

    it("returns undefined for an owned area route with no matching child", () => {
        // Diagnose owns the artifact detail routes, but no child lists them (CHAOS-7747).
        expect(selectedChildForPathname(areaById("diagnose"), "/prs/1")).toBeUndefined();
    });

    // AD-1 option A: the old admin sidebar's pages are tabs of two Admin destinations.
    it.each([
        ["/org/admin", "organization"],
        ["/org/admin/users", "organization"],
        ["/org/admin/users/new", "organization"],
        ["/org/admin/teams/t1/edit", "organization"],
        ["/org/admin/identities", "organization"],
        ["/org/admin/audit-logs", "organization"],
        ["/org/admin/ip-allowlist", "organization"],
        ["/org/admin/retention", "organization"],
        ["/org/admin/ai/byo-llm", "organization"],
        ["/org/admin/settings", "organization"],
        ["/org/admin/sync", "connections"],
        ["/org/admin/sync/new", "connections"],
        ["/org/admin/sync/c1/runs/r1", "connections"],
        ["/org/admin/integrations", "connections"],
        ["/org/admin/integrations/github/sync", "connections"],
        ["/data-health", "data-confidence"],
        ["/data-health/connectors", "data-confidence"],
        ["/data-health/identity", "data-confidence"],
        ["/data-health/mapping", "data-confidence"],
        ["/settings", "settings"],
        ["/superadmin", "platform"],
        ["/superadmin/orgs/o1", "platform"],
        ["/superadmin/context-fabric/validation", "platform"],
        ["/superadmin/billing/plans", "platform-billing"],
        ["/superadmin/billing/audit", "platform-billing"],
    ])("selects the Admin destination of %s: %s", (pathname, childId) => {
        expect(selectedChildForPathname(areaById("admin"), pathname)?.id).toBe(childId);
    });
});

describe("navTitleForPathname / navTrailForPathname (A6: labels agree)", () => {
    it("titles child pages with the child sidebar label", () => {
        expect(navTitleForPathname("/diagnose")).toBe("Overview");
        expect(navTitleForPathname("/diagnose/work-graph")).toBe("Work Graph");
        expect(navTitleForPathname("/metrics")).toBe("Flow");
        expect(navTitleForPathname("/landscape")).toBe("Landscape");
        expect(navTitleForPathname("/agent-context/context-packet")).toBe("Diagnose");
        expect(navTitleForPathname("/plan")).toBe("Overview");
        expect(navTitleForPathname("/plan/delivery-forecast")).toBe("Overview");
        expect(navTitleForPathname("/plan/capacity")).toBe("Completion Forecast");
        expect(navTitleForPathname("/plan/backlog-risk")).toBe("Backlog Risk");
        // operating-review is hidden (navVisible: false) — title falls back to the area label.
        expect(navTitleForPathname("/operating-review")).toBe("Plan");
        expect(navTitleForPathname("/improve")).toBe("Overview");
        expect(navTitleForPathname("/opportunities")).toBe("Opportunities");
        expect(navTitleForPathname("/ai/impact")).toBe("Impact");
        expect(navTitleForPathname("/ai/review-load")).toBe("Review Load");
        expect(navTitleForPathname("/govern")).toBe("Overview");
        expect(navTitleForPathname("/testops")).toBe("TestOps");
        expect(navTitleForPathname("/testops/tests")).toBe("TestOps");
        expect(navTitleForPathname("/quality")).toBe("Quality");
        expect(navTitleForPathname("/settings")).toBe("Settings");
    });

    it("keeps Home as a single area crumb because it has no children", () => {
        expect(navTrailForPathname("/dashboard")).toEqual([{ label: "Home" }]);
        expect(navTitleForPathname("/dashboard")).toBe("Home");
    });

    it("builds an Area → Child trail whose last crumb label === the child label", () => {
        const trail = navTrailForPathname("/org/admin/sync");
        expect(trail.map((c) => c.label)).toEqual(["Admin", "Connections"]);
        expect(trail[0]?.href).toBe(areaById("admin").href);
        expect(trail[trail.length - 1]?.href).toBeUndefined();
        const child = areaById("admin").children.find((c) => c.id === "connections");
        expect(trail[trail.length - 1]?.label).toBe(child?.label);
    });

    it.each(["/prs/repo-1:42", "/issues/x-1", "/deployments/x-1"])(
        "%s: an artifact detail route belongs to Diagnose, with no destination and a trail that is the area only",
        (pathname) => {
            expect(selectedAreaIdForPathname(navAreas, pathname)).toBe("diagnose");
            expect(selectedChildForPathname(areaById("diagnose"), pathname)).toBeUndefined();
            expect(navTrailForPathname(pathname)).toEqual([{ label: "Diagnose" }]);
        },
    );

    it("returns an empty trail/title for routes no area owns", () => {
        expect(navTrailForPathname("/demo")).toEqual([]);
        expect(navTitleForPathname("/demo")).toBe("");
    });
});

describe("navTitleForPathname / navTrailForPathname — /explore (CHAOS-2096)", () => {
    it("titles /explore as 'Diagnose'", () => {
        expect(navTitleForPathname("/explore")).toBe("Diagnose");
    });

    it("builds /explore trail with Diagnose area only", () => {
        const trail = navTrailForPathname("/explore");
        expect(trail.map((c) => c.label)).toEqual(["Diagnose"]);
    });

    it("only Diagnose area claims /explore prefix (no conflicts)", () => {
        const exploreOwners = navAreas.filter((area) =>
            area.ownedPathPrefixes.some((prefix) => prefix === "/explore"),
        );
        expect(exploreOwners).toHaveLength(1);
        expect(exploreOwners[0]?.id).toBe("diagnose");
    });
});

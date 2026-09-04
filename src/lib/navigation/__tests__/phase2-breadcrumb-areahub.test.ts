import { describe, it, expect } from "vitest";
import { navTrailForPathname, navTitleForPathname, getAreaById } from "../areas";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * A crumb list has a duplicate child crumb when its last two entries share a
 * label — the exact shape of the "Improve / Automations / Automations" bug
 * (six pages appended a second hard-coded child crumb on top of the already-
 * complete Area → Child trail `navTrailForPathname` returns).
 */
function hasDuplicateFinalCrumb(trail: { label: string }[]): boolean {
    if (trail.length < 2) return false;
    return trail[trail.length - 1]?.label === trail[trail.length - 2]?.label;
}

describe("navTrailForPathname — operating-review (hidden Plan child, CHAOS-2181 follow-up)", () => {
    it("returns the Plan area crumb only while Operating Review is hidden", () => {
        const trail = navTrailForPathname("/operating-review");
        expect(trail).toHaveLength(1);
        expect(trail[0]?.label).toBe("Plan");
        expect(trail[0]?.href).toBeUndefined();
    });

    it("Operating Review is hidden from nav (navVisible: false, preview: true)", () => {
        const child = getAreaById("plan")?.children.find((c) => c.id === "operating-review");
        expect(child?.navVisible).toBe(false);
        expect(child?.preview).toBe(true);
    });

    it("area crumb label matches the Plan area label verbatim (A6)", () => {
        const trail = navTrailForPathname("/operating-review");
        expect(trail[0]?.label).toBe(getAreaById("plan")?.label);
    });

    it("title for /operating-review falls back to the area label while hidden", () => {
        expect(navTitleForPathname("/operating-review")).toBe("Plan");
    });
});

describe("navTrailForPathname — AI child pages", () => {
    const tabPaths = ["/ai/review-load", "/ai/automations", "/ai/risk"];

    it.each(tabPaths)("%s trail starts with AI area crumb", (pathname) => {
        const trail = navTrailForPathname(pathname);
        expect(trail.length).toBeGreaterThanOrEqual(1);
        expect(trail[0]?.label).toBe("AI");
        expect(trail[0]?.href).toBe(getAreaById("ai")?.href);
    });

    it.each(tabPaths)("%s trail second crumb is the AI child label", (pathname) => {
        const trail = navTrailForPathname(pathname);
        expect(trail[1]?.label).toBe(navTitleForPathname(pathname));
    });

    it.each(tabPaths)("%s trail does NOT start with 'Home'", (pathname) => {
        const trail = navTrailForPathname(pathname);
        expect(trail[0]?.label).not.toBe("Home");
    });
});

describe("breadcrumbs — no duplicate child crumb (regression, dup child crumb fix)", () => {
    // Simple child pages now pass navTrailForPathname() straight through as
    // their `breadcrumbs` prop (no more `[...trail, { label: title }]`
    // append) — improve/automations, ai/automations, ai/impact,
    // ai/review-load.
    const simpleChildPages = [
        "/improve/automations",
        "/ai/automations",
        "/ai/impact",
        "/ai/review-load",
    ];

    it.each(simpleChildPages)(
        "%s: navTrailForPathname() alone has no duplicate final crumb",
        (pathname) => {
            const trail = navTrailForPathname(pathname);
            expect(trail).toHaveLength(2);
            expect(hasDuplicateFinalCrumb(trail)).toBe(false);
            // The link-less current crumb already carries the page title —
            // this is what the removed second append duplicated.
            expect(trail[trail.length - 1]?.label).toBe(navTitleForPathname(pathname));
            expect(trail[trail.length - 1]?.href).toBeUndefined();
        },
    );

    it("sanity check: the helper DOES flag the old buggy construction", () => {
        // What the six pages did before the fix: re-derive an href for the
        // trail's link-less current crumb, then push a second, identical
        // child crumb on top.
        const buggyTrail = [
            ...navTrailForPathname("/improve/automations").map((c) => ({
                ...c,
                href: c.href ?? "/improve",
            })),
            { label: "Automations" },
        ];
        expect(hasDuplicateFinalCrumb(buggyTrail)).toBe(true);
    });

    it("/ai/risk overview: no duplicate final crumb", () => {
        const trail = navTrailForPathname("/ai/risk");
        expect(hasDuplicateFinalCrumb(trail)).toBe(false);
        expect(trail[trail.length - 1]?.label).toBe("Governance Risk");
    });

    it.each(["Test Gaps", "Evidence"])(
        "/ai/risk sub-tab (%s): parent crumb re-added as a link, no duplicate",
        (viewCrumb) => {
            // Mirrors ai/risk/page.tsx's non-overview breadcrumbs branch.
            const parentHref = withFilterParam("/ai/risk", defaultMetricFilter, undefined);
            const trail = [
                ...navTrailForPathname("/ai/risk").slice(0, -1),
                { label: "Governance Risk", href: parentHref },
                { label: viewCrumb },
            ];
            expect(hasDuplicateFinalCrumb(trail)).toBe(false);
            expect(trail.at(-2)).toEqual({ label: "Governance Risk", href: parentHref });
            expect(trail.at(-1)).toEqual({ label: viewCrumb });
        },
    );

    it("/ai/risk sub-tab: parent crumb link preserves an active team/role scope (not just the unscoped URL)", () => {
        // Regression for a codex-round finding (round 1, tip 492aa524): the
        // sub-tab breadcrumb previously hard-coded href: "/ai/risk", silently
        // dropping the active filter/role scope on click even though the
        // in-page tabs (AIGovernanceRiskTabs) preserve it via the same
        // withFilterParam helper for their own "Overview" link.
        const scopedFilter: MetricFilter = {
            ...defaultMetricFilter,
            scope: { level: "team", ids: ["team-42"] },
        };
        const role = "reviewer";
        const parentHref = withFilterParam("/ai/risk", scopedFilter, role);

        expect(parentHref).not.toBe("/ai/risk");
        expect(parentHref).toContain("role=reviewer");

        const trail = [
            ...navTrailForPathname("/ai/risk").slice(0, -1),
            { label: "Governance Risk", href: parentHref },
            { label: "Test Gaps" },
        ];
        expect(trail.at(-2)?.href).toBe(parentHref);
    });

    it("/ai/impact/evidence: Impact crumb re-added as a filter-preserving link, no duplicate", () => {
        // Mirrors ai/impact/evidence/page.tsx's breadcrumbs.
        const impactHref = withFilterParam("/ai/impact", defaultMetricFilter, undefined);
        const trail = [
            ...navTrailForPathname("/ai/impact").slice(0, -1),
            { label: "Impact", href: impactHref },
            { label: "PR Evidence" },
        ];
        expect(hasDuplicateFinalCrumb(trail)).toBe(false);
        expect(trail.at(-2)).toEqual({ label: "Impact", href: impactHref });
        expect(trail.at(-1)).toEqual({ label: "PR Evidence" });
    });
});

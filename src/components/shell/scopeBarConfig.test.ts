import { describe, expect, it } from "vitest";

import {
    type FilterBarView,
    resolveScopeLock,
    resolveVisibility,
} from "@/components/filters/filterBarConfig";

import { resolveScopeBarConfig } from "./scopeBarConfig";

const ALL_VIEWS: FilterBarView[] = [
    "people",
    "home",
    "metrics",
    "work",
    "investment",
    "code",
    "quality",
    "opportunities",
    "explore",
    "landscape",
    "testops",
    "security",
    "feature-flags",
    "capacity-planning",
    "complexity",
    "cognitive-load",
    "risk-compounding",
    "ai",
];

/** The page filter bar rendered only for a view with a page filter. */
const filterBarRendered = (view: FilterBarView, tab?: string) => {
    const visibility = resolveVisibility(view, tab);
    return Boolean(visibility.developer || visibility.workType || visibility.flowStage);
};

describe("resolveScopeBarConfig — scope lock", () => {
    it("locks the scope only where the page filter bar rendered and locked it", () => {
        for (const view of ALL_VIEWS) {
            const expected = filterBarRendered(view) ? resolveScopeLock(view) : null;
            expect(resolveScopeBarConfig(view).resolvedScopeLock, view).toBe(expected);
        }
    });

    it("does not lock the views that have no page filter: the organization control works there", () => {
        const noPageFilter: FilterBarView[] = [
            "complexity",
            "cognitive-load",
            "capacity-planning",
            "quality",
            "testops",
            "risk-compounding",
        ];
        for (const view of noPageFilter) {
            // Guard: these views are in the lock list, so the rule is what frees them.
            expect(resolveScopeLock(view), view).toBe("team");
            expect(resolveScopeBarConfig(view).resolvedScopeLock, view).toBeNull();
        }
    });

    it("keeps the team lock on the views that have page filters", () => {
        const locked: FilterBarView[] = [
            "home",
            "metrics",
            "work",
            "investment",
            "opportunities",
            "people",
            "ai",
        ];
        for (const view of locked) {
            expect(resolveScopeBarConfig(view).resolvedScopeLock, view).toBe("team");
        }
    });

    it("has no lock on a view that was never locked", () => {
        for (const view of ["code", "explore", "landscape"] as FilterBarView[]) {
            expect(resolveScopeBarConfig(view).resolvedScopeLock, view).toBeNull();
        }
    });
});

describe("resolveScopeBarConfig — default `f`", () => {
    it("writes the default `f` only where the page filter bar rendered and wrote it", () => {
        for (const view of ALL_VIEWS) {
            expect(resolveScopeBarConfig(view).writeDefaultFilter, view).toBe(
                filterBarRendered(view),
            );
        }
        expect(resolveScopeBarConfig("complexity").writeDefaultFilter).toBe(false);
        expect(resolveScopeBarConfig("cognitive-load").writeDefaultFilter).toBe(false);
        expect(resolveScopeBarConfig("home").writeDefaultFilter).toBe(true);
        expect(resolveScopeBarConfig("metrics", "flow").writeDefaultFilter).toBe(true);
    });

    it("the AI view keeps the lock, the default `f` and the work filter, as its filter bar had them", () => {
        const config = resolveScopeBarConfig("ai");

        expect(config.resolvedScopeLock).toBe("team");
        expect(config.writeDefaultFilter).toBe(true);
        expect(config.resolvedVisibility).toMatchObject({ developer: false, workType: true });
    });

    it("does not write it with pageFilters: false", () => {
        expect(resolveScopeBarConfig("home", undefined, false).writeDefaultFilter).toBe(false);
        expect(resolveScopeBarConfig(undefined, undefined, false).writeDefaultFilter).toBe(false);
    });
});

describe("resolveScopeBarConfig — visibility", () => {
    it("keeps scope, dates and repositories out of the drawer: they are in the row", () => {
        for (const view of ALL_VIEWS) {
            const { resolvedVisibility } = resolveScopeBarConfig(view);
            expect(resolvedVisibility.scope, view).toBe(false);
            expect(resolvedVisibility.date, view).toBe(false);
            expect(resolvedVisibility.repo, view).toBe(false);
        }
    });

    it("keeps the page filters of a view", () => {
        expect(resolveScopeBarConfig("home").resolvedVisibility).toMatchObject({
            developer: true,
            workType: true,
            flowStage: false,
        });
        expect(resolveScopeBarConfig("metrics", "flow").resolvedVisibility).toMatchObject({
            developer: true,
            flowStage: true,
        });
    });
});

describe("resolveScopeBarConfig — pageFilters: false", () => {
    it("has no page filter and no lock, for a view that has both by default", () => {
        const config = resolveScopeBarConfig("home", undefined, false);

        expect(config.resolvedScopeLock).toBeNull();
        expect(config.resolvedVisibility).toMatchObject({
            developer: false,
            workType: false,
            flowStage: false,
        });
    });

    it("has no page filter and no lock when the page gives no view", () => {
        // Guard: with no view the default has page filters.
        expect(resolveScopeBarConfig().resolvedVisibility.developer).toBe(true);

        const config = resolveScopeBarConfig(undefined, undefined, false);
        expect(config.resolvedScopeLock).toBeNull();
        expect(config.resolvedVisibility).toMatchObject({
            developer: false,
            workType: false,
            flowStage: false,
        });
    });
});

describe("resolveScopeBarConfig — AI pages (CHAOS-7744)", () => {
    it("lists the URL filters no AI query reads: developers, roles, flow stage, blocked, artifacts and issue type", () => {
        expect(resolveVisibility("ai").unreadFilters).toEqual([
            "developers",
            "roles",
            "flowStage",
            "blocked",
            "artifacts",
            "issueType",
        ]);
    });

    it("does not offer the Issue type filter on an AI page: no AI query reads it", () => {
        expect(resolveScopeBarConfig("ai").resolvedVisibility.unreadFilters).toContain("issueType");
        expect(resolveVisibility("ai").unreadFilters).toContain("issueType");
    });

    it("keeps the Issue type filter wherever it is offered today", () => {
        for (const view of ALL_VIEWS.filter((v) => v !== "ai")) {
            expect(resolveVisibility(view).unreadFilters, view).toEqual(["artifacts"]);
        }
    });

    it("keeps the Work control on an AI page: the AIScopeInput queries read it", () => {
        expect(resolveScopeBarConfig("ai").resolvedVisibility.workType).toBe(true);
    });
});

describe("resolveScopeBarConfig — Work is single-select on AI pages (CHAOS-7784)", () => {
    it("the AI queries take one work type, so the AI view is single-select", () => {
        expect(resolveScopeBarConfig("ai").resolvedVisibility.workTypeSingle).toBe(true);
    });

    it("every other view keeps multi-select", () => {
        for (const view of ALL_VIEWS.filter((v) => v !== "ai")) {
            expect(resolveVisibility(view).workTypeSingle, view).toBeUndefined();
        }
    });
});

describe("resolveVisibility — artifacts are read by no view (CHAOS-7795)", () => {
    it("lists artifacts as unread on every view, with and without a tab", () => {
        for (const view of ALL_VIEWS) {
            expect(resolveVisibility(view).unreadFilters, view).toContain("artifacts");
            expect(resolveScopeBarConfig(view).resolvedVisibility.unreadFilters, view).toContain(
                "artifacts",
            );
        }
        expect(resolveVisibility(undefined).unreadFilters).toContain("artifacts");
        expect(resolveVisibility("metrics", "flow").unreadFilters).toContain("artifacts");
    });

    it("lists artifacts once, also on the AI view", () => {
        const ai = resolveVisibility("ai").unreadFilters ?? [];
        expect(ai.filter((f) => f === "artifacts")).toHaveLength(1);
    });
});

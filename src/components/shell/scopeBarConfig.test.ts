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

import { describe, it, expect } from "vitest";
import {
    buildRemovedWorkTabRedirectTarget,
    REMOVED_WORK_TAB_REDIRECTS,
    resolveActiveView,
    resolveRemovedWorkTabRedirect,
    WORK_TABS,
} from "../workPageView";

// Unit tests for the work/page.tsx activeView resolution logic (CHAOS-2075,
// Codex review fix): legacy ?tab= deep links must resolve to "work", not
// silently fall through to "overview".

describe("resolveActiveView", () => {
    describe("explicit ?view= param", () => {
        it("returns 'overview' when view=overview", () => {
            expect(resolveActiveView("overview", undefined)).toBe("overview");
        });

        it("returns 'work' when view=work", () => {
            expect(resolveActiveView("work", undefined)).toBe("work");
        });

        it("?view=work wins even when a remaining tab param is also present", () => {
            expect(resolveActiveView("work", "flame")).toBe("work");
        });

        it("?view=overview wins even when a remaining tab param is also present", () => {
            expect(resolveActiveView("overview", "flame")).toBe("overview");
        });

        it("ignores an unknown view param and falls through to legacy-tab / default logic", () => {
            expect(resolveActiveView("unknown", "flame")).toBe("overview");
        });
    });

    describe("legacy ?tab= deep links (no view param)", () => {
        it.each(WORK_TABS)("resolves to 'work' when view is absent and tab=%s", (tab) => {
            expect(resolveActiveView(undefined, tab)).toBe("work");
        });

        it("registers the final Work workbench tab set in order", () => {
            expect(WORK_TABS).toEqual(["overview", "heatmap", "flame", "evidence", "graph"]);
        });

        it("resolves /work?tab=flame to 'work'", () => {
            expect(resolveActiveView(undefined, "flame")).toBe("work");
        });

        it("ignores an invalid tab value and returns 'overview'", () => {
            expect(resolveActiveView(undefined, "not-a-tab")).toBe("overview");
        });
    });

    describe("bare /work (no params)", () => {
        it("returns 'overview' when both view and tab are absent", () => {
            expect(resolveActiveView(undefined, undefined)).toBe("overview");
        });

        it("returns 'overview' when view is an empty string", () => {
            expect(resolveActiveView("", undefined)).toBe("overview");
        });
    });

    describe("removed Work tab redirects", () => {
        it.each([
            ["flow", "/metrics?tab=flow"],
            ["investment", "/investment"],
            ["landscape", "/landscape"],
            ["capacity", "/plan/capacity"],
        ] as const)("redirects /work?tab=%s to %s", (tab, target) => {
            expect(resolveRemovedWorkTabRedirect(tab)).toBe(target);
        });

        it("keeps the redirect map explicit for every retired Work tab", () => {
            expect(REMOVED_WORK_TAB_REDIRECTS).toEqual({
                flow: "/metrics?tab=flow",
                investment: "/investment",
                landscape: "/landscape",
                capacity: "/plan/capacity",
            });
        });

        it("merges preserved filter params into retired targets that already have a query string", () => {
            expect(
                buildRemovedWorkTabRedirectTarget("/metrics?tab=flow", {
                    tab: "flow",
                    f: "scope-team",
                    role: "engineering-manager",
                }),
            ).toBe("/metrics?tab=flow&f=scope-team&role=engineering-manager");
        });

        it("preserves repeated filter values while stripping retired tab and view params", () => {
            expect(
                buildRemovedWorkTabRedirectTarget("/metrics?tab=flow", {
                    tab: "flow",
                    view: "work",
                    f: ["scope-team", "date-window"],
                }),
            ).toBe("/metrics?tab=flow&f=scope-team&f=date-window");
        });

        it("does not redirect remaining Work tabs", () => {
            for (const tab of WORK_TABS) {
                expect(resolveRemovedWorkTabRedirect(tab)).toBeNull();
            }
        });
    });
});

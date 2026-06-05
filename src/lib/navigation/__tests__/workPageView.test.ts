import { describe, it, expect } from "vitest";
import { resolveActiveView, WORK_TABS } from "../workPageView";

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

        it("?view=work wins even when a tab param is also present", () => {
            expect(resolveActiveView("work", "flow")).toBe("work");
        });

        it("?view=overview wins even when a tab param is also present", () => {
            expect(resolveActiveView("overview", "flow")).toBe("overview");
        });

        it("ignores an unknown view param and falls through to legacy-tab / default logic", () => {
            // Unknown view + valid tab → legacy deep-link path → "work"
            expect(resolveActiveView("unknown", "flow")).toBe("overview");
        });
    });

    describe("legacy ?tab= deep links (no view param)", () => {
        it.each(WORK_TABS)("resolves to 'work' when view is absent and tab=%s", (tab) => {
            expect(resolveActiveView(undefined, tab)).toBe("work");
        });

        it("resolves /work?tab=flow to 'work' (primary Codex finding)", () => {
            expect(resolveActiveView(undefined, "flow")).toBe("work");
        });

        it("resolves /work?tab=investment to 'work'", () => {
            expect(resolveActiveView(undefined, "investment")).toBe("work");
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
});

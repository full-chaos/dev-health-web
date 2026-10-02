/**
 * Visibility of the page filters per view. The scope bar reads it (drawer
 * sections, scope lock). Moved from the tests of the deleted `FilterBarClient`
 * (CHAOS-1239); the cases are unchanged.
 */
import { describe, expect, it } from "vitest";

import { resolveVisibility } from "./filterBarConfig";

describe("resolveVisibility (pure)", () => {
    it("returns DEFAULT visibility for unknown/undefined view", () => {
        const v = resolveVisibility(undefined);
        expect(v).toEqual({
            scope: true,
            repo: true,
            developer: true,
            workType: true,
            flowStage: false,
            date: true,
            unreadFilters: ["artifacts"],
        });
    });

    it("returns METRICS_DEFAULT for view=metrics (no tab)", () => {
        const v = resolveVisibility("metrics");
        expect(v.repo).toBe(true);
        expect(v.developer).toBe(true);
        expect(v.flowStage).toBe(false);
        expect(v.workType).toBe(false);
    });

    it("returns METRICS_FLOW visibility for view=metrics tab=flow (developer + flowStage enabled)", () => {
        const v = resolveVisibility("metrics", "flow");
        expect(v.developer).toBe(true);
        expect(v.flowStage).toBe(true);
    });

    it("hides repo for view=work and view=investment (WORK_VISIBILITY)", () => {
        expect(resolveVisibility("work").repo).toBe(false);
        expect(resolveVisibility("work").workType).toBe(true);
        expect(resolveVisibility("investment").repo).toBe(false);
        expect(resolveVisibility("investment").workType).toBe(true);
    });

    it("hides scope for view=code (CODE_VISIBILITY)", () => {
        const v = resolveVisibility("code");
        expect(v.scope).toBe(false);
        expect(v.repo).toBe(true);
        expect(v.developer).toBe(true);
    });

    it("enables everything for view=explore (EXPLORE_VISIBILITY)", () => {
        const v = resolveVisibility("explore");
        expect(v.scope).toBe(true);
        expect(v.repo).toBe(true);
        expect(v.developer).toBe(true);
        expect(v.workType).toBe(true);
        expect(v.flowStage).toBe(true);
        expect(v.date).toBe(true);
    });

    it("hides ALL filters for view=security (managed externally)", () => {
        const v = resolveVisibility("security");
        expect(v.scope).toBe(false);
        expect(v.repo).toBe(false);
        expect(v.developer).toBe(false);
        expect(v.workType).toBe(false);
        expect(v.flowStage).toBe(false);
        expect(v.date).toBe(false);
    });

    it("keeps quality and testops global-only after the page FilterBar strips global fields", () => {
        expect(resolveVisibility("quality").developer).toBe(false);
        expect(resolveVisibility("testops").developer).toBe(false);
    });

    it("treats opportunities as WORK_VISIBILITY", () => {
        expect(resolveVisibility("opportunities")).toEqual(resolveVisibility("work"));
    });

    it("returns PEOPLE visibility (developer on, repo/workType off)", () => {
        const v = resolveVisibility("people");
        expect(v.developer).toBe(true);
        expect(v.repo).toBe(false);
        expect(v.workType).toBe(false);
    });

    it("enables repo for view=cognitive-load, still hides developer/workType/flowStage (CHAOS-2386)", () => {
        const v = resolveVisibility("cognitive-load");
        expect(v.scope).toBe(true);
        expect(v.repo).toBe(true);
        expect(v.developer).toBe(false);
        expect(v.workType).toBe(false);
        expect(v.flowStage).toBe(false);
        expect(v.date).toBe(true);
    });
});

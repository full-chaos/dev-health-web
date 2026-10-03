import { describe, expect, it } from "vitest";
import type { MetricFilter } from "@/lib/filters/types";
import { capacityForecastInput } from "@/components/work/capacityInput";
import { buildCapacityForecastVariables } from "../capacityHydration";

const baseFilters = (overrides: Partial<MetricFilter> = {}): MetricFilter => ({
    time: { range_days: 30, compare_days: 30 },
    scope: { level: "org", ids: ["acme"] },
    who: {},
    what: {},
    why: {},
    how: {},
    ...overrides,
});

describe("buildCapacityForecastVariables", () => {
    it("sends the selected team id as a one-item teamIds when filters are scoped to a team", () => {
        const vars = buildCapacityForecastVariables(
            baseFilters({
                time: { range_days: 60, compare_days: 30 },
                scope: { level: "team", ids: ["team-42"] },
            }),
            "org-1",
        );

        expect(vars).toEqual({
            orgId: "org-1",
            input: {
                teamIds: ["team-42"],
                historyDays: 60,
            },
        });
    });

    it("omits teamIds for non-team scopes while preserving historyDays", () => {
        const vars = buildCapacityForecastVariables(
            baseFilters({
                time: { range_days: 45, compare_days: 30 },
                scope: { level: "org", ids: ["acme"] },
            }),
            "org-1",
        );

        expect(vars.orgId).toBe("org-1");
        expect(vars.input.historyDays).toBe(45);
        expect(vars.input.teamIds).toBeUndefined();
        expect(vars.input.teamId).toBeUndefined();
    });

    it("produces a stable shape suitable as an urql cache key", () => {
        const vars1 = buildCapacityForecastVariables(
            baseFilters({
                time: { range_days: 90, compare_days: 30 },
                scope: { level: "team", ids: ["team-a"] },
            }),
            "org-1",
        );
        const vars2 = buildCapacityForecastVariables(
            baseFilters({
                time: { range_days: 90, compare_days: 30 },
                scope: { level: "team", ids: ["team-a"] },
            }),
            "org-1",
        );

        expect(JSON.stringify(vars1)).toBe(JSON.stringify(vars2));
    });
});

describe("buildCapacityForecastVariables parity with useCapacityForecast", () => {
    it("emits the exact shape that useCapacityForecast constructs (see hooks/useCapacityForecast.ts:52-58)", () => {
        const filters = baseFilters({
            time: { range_days: 30, compare_days: 30 },
            scope: { level: "team", ids: ["team-a"] },
        });

        const vars = buildCapacityForecastVariables(filters, "org-1");

        const expected = {
            orgId: "org-1",
            input: {
                teamIds: ["team-a"],
                historyDays: 30,
            },
        };

        expect(vars).toEqual(expected);
    });
});

describe("buildCapacityForecastVariables with several teams (CHAOS-7764)", () => {
    it("sends every selected team id, in order, and no singular teamId", () => {
        const vars = buildCapacityForecastVariables(
            baseFilters({ scope: { level: "team", ids: ["team-a", "team-b", "team-c"] } }),
            "org-1",
        );

        expect(vars.input.teamIds).toEqual(["team-a", "team-b", "team-c"]);
        expect("teamId" in vars.input).toBe(false);
    });

    it("sends a repeated id once", () => {
        const vars = buildCapacityForecastVariables(
            baseFilters({ scope: { level: "team", ids: ["team-a", "team-b", "team-a"] } }),
            "org-1",
        );

        expect(vars.input.teamIds).toEqual(["team-a", "team-b"]);
    });

    it("is the same input the view and the Refresh button send (one urql cache key)", () => {
        const filters = baseFilters({
            time: { range_days: 60, compare_days: 30 },
            scope: { level: "team", ids: ["team-a", "team-b"] },
        });

        expect(buildCapacityForecastVariables(filters, "org-1").input).toEqual(
            capacityForecastInput(filters),
        );
    });
});

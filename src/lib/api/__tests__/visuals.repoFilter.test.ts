import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/apiClient";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

import { getHeatmap, getQuadrant } from "../visuals";

const filters: MetricFilter = {
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["t1"] },
    what: { repos: ["r1", "r2"] },
};

const urlOf = (call: unknown[]) => {
    const [path, , build, candidates] = call as [
        string,
        unknown,
        (c: string) => Record<string, never>,
        string[],
    ];
    return new URL(apiClient.buildUrl(path, build(candidates[0])));
};

beforeEach(() => vi.restoreAllMocks());

describe("quadrant and heatmap requests send the filter (CHAOS-9097)", () => {
    it("getQuadrant sends repeated team_ids and repo_ids", async () => {
        const spy = vi.spyOn(apiClient, "fetchWithFallback").mockResolvedValue({} as never);
        await getQuadrant({
            type: "churn_throughput",
            scope_type: "team",
            scope_id: "t1",
            range_days: 30,
            bucket: "week",
            filters,
        });
        const url = urlOf(spy.mock.calls[0]);
        expect(url.searchParams.getAll("team_ids")).toEqual(["t1"]);
        expect(url.searchParams.getAll("repo_ids")).toEqual(["r1", "r2"]);
    });

    it("getHeatmap sends repeated team_ids and repo_ids", async () => {
        const spy = vi.spyOn(apiClient, "fetchWithFallback").mockResolvedValue({} as never);
        await getHeatmap({
            type: "risk",
            metric: "hotspot_risk",
            scope_type: "team",
            scope_id: "t1",
            range_days: 30,
            filters,
        });
        const url = urlOf(spy.mock.calls[0]);
        expect(url.searchParams.getAll("team_ids")).toEqual(["t1"]);
        expect(url.searchParams.getAll("repo_ids")).toEqual(["r1", "r2"]);
    });

    it("sends neither key without a filter", async () => {
        const spy = vi.spyOn(apiClient, "fetchWithFallback").mockResolvedValue({} as never);
        await getQuadrant({
            type: "churn_throughput",
            scope_type: "org",
            range_days: 30,
            bucket: "week",
        });
        const url = urlOf(spy.mock.calls[0]);
        expect(url.searchParams.has("team_ids")).toBe(false);
        expect(url.searchParams.has("repo_ids")).toBe(false);
    });
});

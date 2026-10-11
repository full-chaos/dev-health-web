import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telemetry", () => ({ trackTelemetryEvent: track }));

import {
    emitClientError,
    emitFeatureViewed,
    emitFilterChanges,
    errorClassOf,
    resetClientErrorBudgetForTests,
} from "../emitters";

const withRepos = (repos: string[]): MetricFilter => ({
    ...defaultMetricFilter,
    what: { ...defaultMetricFilter.what, repos },
});

describe("emitters", () => {
    beforeEach(() => {
        track.mockReset();
        resetClientErrorBudgetForTests();
    });

    it("feature_viewed: first segment as feature, once per call", () => {
        emitFeatureViewed("/people/[person_id]/metrics/[metric]");
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith("feature_viewed", {
            feature: "people",
            surface: "route",
            routePattern: "/people/[person_id]/metrics/[metric]",
        });
        track.mockClear();
        emitFeatureViewed("/");
        expect(track.mock.calls[0][1].feature).toBe("home");
    });

    it("filter_changed: only for a real change, counts only", () => {
        emitFilterChanges("metrics", defaultMetricFilter, defaultMetricFilter);
        expect(track).not.toHaveBeenCalled();

        emitFilterChanges("metrics", withRepos(["a"]), withRepos(["a"]));
        expect(track).not.toHaveBeenCalled();

        emitFilterChanges("metrics", withRepos(["a"]), withRepos(["b", "a"]));
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith("filter_changed", {
            view: "metrics",
            filterKey: "repo",
            valueCount: 2,
            isCustomDateRange: null,
        });
        expect(JSON.stringify(track.mock.calls)).not.toContain('"b"');
    });

    it("filter_changed: reorder is not a change; date change flags custom range", () => {
        emitFilterChanges("metrics", withRepos(["a", "b"]), withRepos(["b", "a"]));
        expect(track).not.toHaveBeenCalled();
        const next = {
            ...defaultMetricFilter,
            time: { ...defaultMetricFilter.time, range_days: 45 },
        };
        emitFilterChanges("metrics", defaultMetricFilter, next);
        expect(track).toHaveBeenCalledWith("filter_changed", {
            view: "metrics",
            filterKey: "date",
            valueCount: 1,
            isCustomDateRange: true,
        });
    });

    it("client_error: class only, digest kept, no message or stack", () => {
        const err = Object.assign(new TypeError("secret user@example.com"), { digest: "d1" });
        emitClientError("route", err);
        expect(track).toHaveBeenCalledTimes(1);
        const [name, payload] = track.mock.calls[0];
        expect(name).toBe("client_error");
        expect(payload).toMatchObject({ boundary: "route", digest: "d1", errorClass: "TypeError" });
        expect(JSON.stringify(payload)).not.toContain("secret");
    });

    it("errorClassOf: non-error and odd names fall back", () => {
        expect(errorClassOf("boom")).toBe("Error");
        const odd = new Error("x");
        odd.name = "a b/c?q=1";
        expect(errorClassOf(odd)).toBe("Error");
    });

    it("client_error: bounded per page load", () => {
        for (let i = 0; i < 50; i += 1) emitClientError("global", new Error("x"));
        expect(track).toHaveBeenCalledTimes(20);
    });

    it("never throws into the page", () => {
        track.mockImplementation(() => {
            throw new Error("boom");
        });
        expect(() => emitFeatureViewed("/x")).not.toThrow();
        expect(() => emitClientError("route", new Error("x"))).not.toThrow();
        expect(() => emitFilterChanges("v", withRepos([]), withRepos(["a"]))).not.toThrow();
    });
});

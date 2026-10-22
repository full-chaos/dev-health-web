import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

// The window the Cognitive Load page asks for: the one shared range (N full UTC days that end
// yesterday), for the cognitive-load query and the review-wait heatmap alike. The server reads
// both ends inclusive and keeps no clock for the GraphQL query, so the page decides the days.

const { cognitive, heatmap } = vi.hoisted(() => ({
    cognitive: vi.fn(),
    heatmap: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { id: "u1", org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/cognitiveLoadFetchers", () => ({
    getCognitiveLoadViaGraphQL: (...args: unknown[]) => cognitive(...args),
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: (...args: unknown[]) => heatmap(...args) }));

import CognitiveLoadPage from "./page";

const filterWith = (time: Partial<MetricFilter["time"]>): MetricFilter => ({
    ...defaultMetricFilter,
    time: { range_days: 30, compare_days: 30, ...time },
});

async function loadPage(filters: MetricFilter, tab?: string) {
    await CognitiveLoadPage({
        searchParams: Promise.resolve({ f: encodeFilterParam(filters), ...(tab ? { tab } : {}) }),
    });
}

const askedWindow = () => {
    const [params] = cognitive.mock.calls.at(-1) as unknown as [
        { sinceDate: string; untilDate: string },
    ];
    return [params.sinceDate, params.untilDate];
};

const heatmapWindow = () => {
    const [params] = heatmap.mock.calls.at(-1) as unknown as [
        { start_date?: string; end_date?: string },
    ];
    return [params.start_date, params.end_date];
};

describe("cognitive load page window", () => {
    beforeEach(() => {
        cognitive.mockReset();
        heatmap.mockReset();
        cognitive.mockResolvedValue({ signals: [] });
        heatmap.mockResolvedValue(null);
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "asks for N full UTC days that end yesterday for a relative range at %s",
        async (now) => {
            vi.setSystemTime(new Date(now));
            await loadPage(filterWith({}));
            expect(askedWindow()).toEqual(["2026-09-19", "2026-10-18"]);
        },
    );

    it.each([
        ["today", "2026-10-19"],
        ["tomorrow", "2026-10-20"],
    ])("clamps an explicit end of %s to yesterday", async (_label, end) => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await loadPage(filterWith({ start_date: "2026-10-01", end_date: end }));
        expect(askedWindow()).toEqual(["2026-10-01", "2026-10-18"]);
    });

    it("sends an explicit end at or before yesterday unchanged", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await loadPage(filterWith({ start_date: "2026-09-30", end_date: "2026-10-14" }));
        expect(askedWindow()).toEqual(["2026-09-30", "2026-10-14"]);
    });

    it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "gives the heatmap the same window as the query at %s",
        async (now) => {
            vi.setSystemTime(new Date(now));
            await loadPage(filterWith({}), "heatmap");
            expect(heatmapWindow()).toEqual(["2026-09-19", "2026-10-18"]);
            expect(heatmapWindow()).toEqual(askedWindow());
        },
    );

    it("clamps the heatmap's explicit end of today to yesterday, as the query's", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await loadPage(filterWith({ start_date: "2026-10-01", end_date: "2026-10-19" }), "heatmap");
        expect(heatmapWindow()).toEqual(["2026-10-01", "2026-10-18"]);
    });
});

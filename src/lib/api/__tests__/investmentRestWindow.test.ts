import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricFilter } from "@/lib/filters/types";
import { decodeFilter } from "@/lib/filters/encode";

const postJson = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../_shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../_shared")>()),
    postJson,
}));
vi.mock("@/lib/runtimeConfig", () => ({
    runtimeConfig: { useGraphQLAnalytics: () => false },
}));

import { getBlockedWorkIssues, getDrilldown, getInvestment, getWorkUnits } from "../investment";

const filters = (time: Record<string, unknown>) =>
    ({
        time,
        scope: { level: "org", ids: ["acme"] },
        who: {},
        what: {},
        why: {},
        how: {},
    }) as unknown as MetricFilter;

const readers = [
    ["getInvestment", (f: MetricFilter) => getInvestment(f)],
    ["getWorkUnits", (f: MetricFilter) => getWorkUnits({ filters: f })],
] as const;

const sent = () => {
    const [, body, , params] = postJson.mock.calls.at(-1) as unknown as [
        string,
        { filters: MetricFilter },
        number,
        { f: string },
    ];
    return { body, params };
};

describe.each(readers)("%s window", (_name, read) => {
    beforeEach(() => {
        postJson.mockClear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "names N full UTC days that end yesterday for a relative range at %s",
        async (now) => {
            vi.setSystemTime(new Date(now));
            await read(filters({ range_days: 30, compare_days: 14 }));
            const { time } = sent().body.filters;
            expect(time).toEqual({
                range_days: 30,
                compare_days: 14,
                start_date: "2026-09-19",
                end_date: "2026-10-18",
            });
        },
    );

    it.each([
        ["today", "2026-10-19"],
        ["tomorrow", "2026-10-20"],
        ["a time part on today", "2026-10-19T08:00:00Z"],
    ])("clamps an explicit end of %s to yesterday", async (_label, end) => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(
            filters({ range_days: 30, compare_days: 30, start_date: "2026-10-01", end_date: end }),
        );
        const { time } = sent().body.filters;
        expect(time.start_date).toBe("2026-10-01");
        expect(time.end_date).toBe("2026-10-18");
    });

    it("sends an explicit end at or before yesterday unchanged", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(
            filters({
                range_days: 30,
                compare_days: 30,
                start_date: "2026-09-30",
                end_date: "2026-10-14",
            }),
        );
        const { time } = sent().body.filters;
        expect([time.start_date, time.end_date]).toEqual(["2026-09-30", "2026-10-14"]);
    });

    it("reads a lone start_date as the relative window, as the chart does", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(filters({ range_days: 7, compare_days: 7, start_date: "2026-10-01" }));
        const { time } = sent().body.filters;
        expect([time.start_date, time.end_date]).toEqual(["2026-10-12", "2026-10-18"]);
    });

    it("keys the cache with the same window it sends", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(filters({ range_days: 30, compare_days: 30 }));
        const { body, params } = sent();
        expect(decodeFilter(params.f).time).toEqual(body.filters.time);
    });

    it("keeps the rest of the filters and does not change the caller's object", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        const input = filters({ range_days: 30, compare_days: 30 });
        await read(input);
        expect(sent().body.filters.scope).toEqual(input.scope);
        expect(input.time).toEqual({ range_days: 30, compare_days: 30 });
    });
});

describe("getWorkUnits named window", () => {
    beforeEach(() => {
        postJson.mockClear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it("sends the range the caller reads the mix over, not a second clock read", async () => {
        vi.setSystemTime(new Date("2026-10-20T00:01:00Z"));
        await getWorkUnits({
            filters: filters({ range_days: 30, compare_days: 30 }),
            dateRange: { startDate: "2026-09-19", endDate: "2026-10-18" },
        });
        const { time } = sent().body.filters;
        expect([time.start_date, time.end_date]).toEqual(["2026-09-19", "2026-10-18"]);
    });
});

const drilldownReaders = [
    ["getDrilldown prs", (f: MetricFilter) => getDrilldown("/api/v1/drilldown/prs", f)],
    ["getDrilldown issues", (f: MetricFilter) => getDrilldown("/api/v1/drilldown/issues", f)],
    ["getBlockedWorkIssues", (f: MetricFilter) => getBlockedWorkIssues(f)],
] as const;

describe.each(drilldownReaders)("%s window", (_name, read) => {
    beforeEach(() => {
        postJson.mockClear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "names N full UTC days that end yesterday for a relative range at %s",
        async (now) => {
            vi.setSystemTime(new Date(now));
            await read(filters({ range_days: 30, compare_days: 14 }));
            expect(sent().body.filters.time).toEqual({
                range_days: 30,
                compare_days: 14,
                start_date: "2026-09-19",
                end_date: "2026-10-18",
            });
        },
    );

    it.each([
        ["today", "2026-10-19"],
        ["tomorrow", "2026-10-20"],
        ["a time part on today", "2026-10-19T08:00:00Z"],
    ])("clamps an explicit end of %s to yesterday", async (_label, end) => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(
            filters({ range_days: 30, compare_days: 30, start_date: "2026-10-01", end_date: end }),
        );
        const { time } = sent().body.filters;
        expect([time.start_date, time.end_date]).toEqual(["2026-10-01", "2026-10-18"]);
    });

    it("sends an explicit end at or before yesterday unchanged", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(
            filters({
                range_days: 30,
                compare_days: 30,
                start_date: "2026-09-30",
                end_date: "2026-10-14",
            }),
        );
        const { time } = sent().body.filters;
        expect([time.start_date, time.end_date]).toEqual(["2026-09-30", "2026-10-14"]);
    });

    it("reads a lone start_date as the relative window, as the chart does", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(filters({ range_days: 7, compare_days: 7, start_date: "2026-10-01" }));
        const { time } = sent().body.filters;
        expect([time.start_date, time.end_date]).toEqual(["2026-10-12", "2026-10-18"]);
    });

    it("keeps the rest of the filters and does not change the caller's object", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        const input = filters({ range_days: 30, compare_days: 30 });
        await read(input);
        expect(sent().body.filters.scope).toEqual(input.scope);
        expect(input.time).toEqual({ range_days: 30, compare_days: 30 });
        expect(input.how).toEqual({});
    });

    it("keeps the limit and the 30 s revalidate", async () => {
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        await read(filters({ range_days: 30, compare_days: 30 }));
        const [, body, revalidate] = postJson.mock.calls.at(-1) as unknown as [
            string,
            { limit: number },
            number,
        ];
        expect([body.limit, revalidate]).toEqual([50, 30]);
    });
});

describe("drilldown readers: path and blocked selector", () => {
    beforeEach(() => {
        postJson.mockClear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    it.each(["/api/v1/drilldown/prs", "/api/v1/drilldown/issues"] as const)(
        "getDrilldown posts %s with the window and no blocked selector",
        async (path) => {
            await getDrilldown(path, filters({ range_days: 7, compare_days: 7 }));
            const [calledPath] = postJson.mock.calls.at(-1) as unknown as [string];
            const { filters: sentFilters } = sent().body;
            expect(calledPath).toBe(path);
            expect(sentFilters.how).toEqual({});
            expect(sentFilters.time.end_date).toBe("2026-10-18");
        },
    );

    it("getBlockedWorkIssues sends the blocked selector together with the window", async () => {
        await getBlockedWorkIssues(filters({ range_days: 7, compare_days: 7 }));
        const [calledPath] = postJson.mock.calls.at(-1) as unknown as [string];
        const { filters: sentFilters } = sent().body;
        expect(calledPath).toBe("/api/v1/drilldown/issues");
        expect(sentFilters.how).toEqual({ blocked: true });
        expect([sentFilters.time.start_date, sentFilters.time.end_date]).toEqual([
            "2026-10-12",
            "2026-10-18",
        ]);
    });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
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

import { getInvestment, getWorkUnits } from "../investment";

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

describe("REST investment readers have no second copy of the window", () => {
    const source = readFileSync(join(__dirname, "..", "investment.ts"), "utf8");

    it("sends no unwindowed filters to the investment or work-units endpoint", () => {
        expect(source).not.toMatch(
            /"\/api\/v1\/(investment|work-units)",\s*\{\s*filters: normalized/,
        );
        expect(source).not.toMatch(/function buildDateRange/);
        expect(source).not.toMatch(/range_days \* 24/);
    });
});

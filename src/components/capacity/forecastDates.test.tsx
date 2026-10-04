import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/utils";

// `forecastFacts` lives beside a component that reads the forecast: no network in a unit test.
vi.mock("@/lib/graphql/hooks", () => ({
    useCapacityForecast: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));

import { formatDayOffset, formatServedDay } from "@/lib/capacityDates";
import type { CapacityForecast } from "@/lib/graphql/types";

import { forecastFacts } from "./ForecastEvidenceAction";
import { ForecastTiles, formatForecastDate } from "./ForecastTiles";

// CHAOS-8507: the API serves a forecast date as a calendar day ("2026-10-04": the day the forecast
// was computed, in UTC, plus N days). The page must print that day in every time zone. Read as UTC
// midnight and printed in local time, it showed one day early west of UTC.

const ORIGINAL_ZONE = process.env.TZ;
const useZone = (zone: string) => {
    process.env.TZ = zone;
};
// A date shows its year when it is not in this year, so "today" is fixed: the day of the fixture.
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T19:05:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_ZONE === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_ZONE;
});

/** The local day of UTC midnight: proves the zone is really in force in this run. */
const localDayOfUtcMidnight = () => new Date("2026-10-04T00:00:00Z").getDate();

const forecast = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-10-03T19:05:00Z",
    backlogSize: 1,
    p50Date: "2026-10-04",
    p85Date: "2026-10-04",
    p95Date: "2026-10-05",
    p50Days: 1,
    p85Days: 1,
    p95Days: 2,
    throughputMean: 15.2,
    throughputStddev: 17,
    historyDays: 72,
    insufficientHistory: false,
    highVariance: false,
    ...over,
});

const value = (tile: string) => within(screen.getByTestId(tile)).getByTestId("metric-value");

describe.each([
    // West of UTC: UTC midnight is still the day before. This is the zone of the report.
    ["America/Los_Angeles", 3],
    // UTC itself.
    ["UTC", 4],
    // Far east of UTC (UTC+14): UTC midnight is already the afternoon of the same day.
    ["Pacific/Kiritimati", 4],
] as const)("forecast dates in the time zone %s", (zone, localDay) => {
    it("the test really runs in that zone", () => {
        useZone(zone);
        expect(localDayOfUtcMidnight()).toBe(localDay);
    });

    it("prints a served date as the calendar day it names", () => {
        useZone(zone);
        expect(formatForecastDate("2026-10-04")).toBe("Oct 4");
        expect(formatForecastDate("2026-01-01")).toBe("Jan 1");
        expect(formatForecastDate("2026-12-31")).toBe("Dec 31");
    });

    it("the three percentile tiles show the served days", () => {
        useZone(zone);
        render(<ForecastTiles forecast={forecast()} />);

        expect(value("tile-p50")).toHaveTextContent(/^Oct 4$/u);
        expect(value("tile-p85")).toHaveTextContent(/^Oct 4$/u);
        expect(value("tile-p95")).toHaveTextContent(/^Oct 5$/u);
    });

    it("the low-variance tile shows the served day", () => {
        useZone(zone);
        render(<ForecastTiles forecast={forecast({ p95Days: 1, p95Date: "2026-10-04" })} />);

        expect(value("tile-range")).toHaveTextContent(/^Oct 4$/u);
    });

    it("the evidence facts show the served days", () => {
        useZone(zone);
        const facts = forecastFacts(forecast()).map((fact) => [fact.label, fact.value]);

        expect(facts).toContainEqual(["P50 · optimistic", "Oct 4 · 1 day"]);
        expect(facts).toContainEqual(["P95 · conservative", "Oct 5 · 2 days"]);
    });

    // The burn-down chart is gone (the Completion range card took its place); the card's markers
    // and its day axis print days with these two helpers.
    it("the markers and the day axis of the Completion range card show the served days", () => {
        useZone(zone);
        expect(formatServedDay("2026-10-04")).toBe("Oct 4");
        expect(formatServedDay("2026-10-05")).toBe("Oct 5");
        expect(formatDayOffset("2026-10-03T19:05:00Z", 1)).toBe("Oct 4");
        expect(formatDayOffset("2026-10-03T19:05:00Z", 2)).toBe("Oct 5");
    });
});

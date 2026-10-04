import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, screen, within } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

import { forecastFacts } from "./ForecastEvidenceAction";
import { ForecastTiles, formatForecastDate } from "./ForecastTiles";

// `forecastFacts` lives beside a component that reads the forecast: no network in a unit test.
vi.mock("@/lib/graphql/hooks", () => ({
    useCapacityForecast: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));

// A date shows its year when it is not in this year, so "today" is fixed for these tests.
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
});
afterEach(() => {
    vi.useRealTimers();
});

/** GraphQL sends `null` for a nullable field it has no value for. */
const NOT_SERVED = null as unknown as undefined;

const forecast = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f1",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 42,
    p50Date: "2026-06-10",
    p85Date: "2026-06-20",
    p95Date: "2026-07-01",
    p50Days: 9,
    p85Days: 19,
    p95Days: 30,
    throughputMean: 3.25,
    throughputStddev: 1.1,
    historyDays: 90,
    insufficientHistory: false,
    highVariance: false,
    ...over,
});

const value = (tile: string) => within(screen.getByTestId(tile)).getByTestId("metric-value");

// CHAOS-8480: a percentile date the API did not serve reads "Not reported", never a dash.
describe("ForecastTiles — a percentile date that is not served", () => {
    it("shows each served date with its served days", () => {
        render(<ForecastTiles forecast={forecast()} />);

        expect(value("tile-p50")).toHaveTextContent(/^Jun 10$/u);
        expect(value("tile-p85")).toHaveTextContent(/^Jun 20$/u);
        expect(value("tile-p95")).toHaveTextContent(/^Jul 1$/u);
        expect(within(screen.getByTestId("tile-p50")).getByText("9 days")).toBeInTheDocument();
        expect(screen.getByTestId("forecast-tiles")).not.toHaveTextContent("Not reported");
    });

    it('reads "Not reported" in the three tiles when no date and no day count is served', () => {
        render(
            <ForecastTiles
                forecast={forecast({
                    p50Date: NOT_SERVED,
                    p85Date: NOT_SERVED,
                    p95Date: NOT_SERVED,
                    p50Days: NOT_SERVED,
                    p85Days: NOT_SERVED,
                    p95Days: NOT_SERVED,
                })}
            />,
        );

        for (const tile of ["tile-p50", "tile-p85", "tile-p95"]) {
            expect(value(tile)).toHaveTextContent(/^Not reported$/u);
        }
        expect(screen.getByTestId("forecast-tiles")).not.toHaveTextContent("—");
        // The served tile and the Target mark stay.
        expect(value("tile-remaining")).toHaveTextContent("42 items");
        expect(within(screen.getByTestId("tile-p85")).getByText("Target")).toBeInTheDocument();
    });

    it.each([
        ["P50", { p50Date: NOT_SERVED }, "tile-p50"],
        ["P85", { p85Date: NOT_SERVED }, "tile-p85"],
        ["P95", { p95Date: NOT_SERVED }, "tile-p95"],
        ["P50 (absent key)", { p50Date: undefined }, "tile-p50"],
    ] as const)(
        "only the %s tile reads Not reported when only that date is missing",
        (_n, over, tile) => {
            render(<ForecastTiles forecast={forecast(over)} />);

            expect(value(tile)).toHaveTextContent(/^Not reported$/u);
            const others = ["tile-p50", "tile-p85", "tile-p95"].filter((id) => id !== tile);
            for (const other of others) {
                expect(value(other)).not.toHaveTextContent("Not reported");
            }
            expect(screen.getByTestId("forecast-tiles")).not.toHaveTextContent("—");
        },
    );

    it("the low-variance tile has no dash in its caption when the date is not served", () => {
        render(
            <ForecastTiles
                forecast={forecast({
                    p50Days: 14,
                    p85Days: 14,
                    p95Days: 14,
                    p50Date: NOT_SERVED,
                    p85Date: NOT_SERVED,
                    p95Date: NOT_SERVED,
                })}
            />,
        );

        const range = screen.getByTestId("tile-range");
        expect(range).not.toHaveTextContent("—");
        expect(value("tile-range")).toHaveTextContent(/^Not reported$/u);
        expect(within(range).getByText("low variance · 14 days")).toBeInTheDocument();
    });
});

// CHAOS-8481: the low-variance tile shows the served date and the served days. The web makes no
// week count: no rounding, and no floor that turns 0 to 3 days into "≈1 week".
describe("ForecastTiles — the low-variance tile shows served values only", () => {
    const sameDay = (days: number, date = "2026-06-15") =>
        forecast({
            p50Days: days,
            p85Days: days,
            p95Days: days,
            p50Date: date,
            p85Date: date,
            p95Date: date,
        });

    it.each([
        [0, "low variance · 0 days"],
        [1, "low variance · 1 day"],
        [3, "low variance · 3 days"],
        [14, "low variance · 14 days"],
        [17, "low variance · 17 days"],
    ] as const)(
        "%i days: the date as the value, the served days in the caption",
        (days, caption) => {
            render(<ForecastTiles forecast={sameDay(days)} />);

            const range = screen.getByTestId("tile-range");
            expect(within(range).getByText("Forecast range")).toBeInTheDocument();
            expect(value("tile-range")).toHaveTextContent(/^Jun 15$/u);
            expect(within(range).getByText(caption)).toBeInTheDocument();
            // No number that the API did not serve.
            expect(screen.getByTestId("forecast-tiles")).not.toHaveTextContent(/week/iu);
            expect(screen.getByTestId("forecast-tiles")).not.toHaveTextContent("≈");
        },
    );

    it("stays one tile beside Remaining work", () => {
        render(<ForecastTiles forecast={sameDay(14)} />);

        expect(screen.getByTestId("forecast-tiles")).toHaveAttribute("data-columns", "2");
        expect(screen.queryByTestId("tile-p50")).toBeNull();
        expect(screen.queryByTestId("tile-p95")).toBeNull();
    });
});

// The simulation stops a run at its horizon (served as `completionDistribution.horizonDays`). A
// percentile at the horizon means "that many days or more": the curve never reached that share.
// Its served date is the horizon day, not a finish date, so the tile names no date.
describe("ForecastTiles — a percentile at the horizon of the simulation", () => {
    const distribution = (horizonDays: number) => ({
        runs: 200,
        unfinishedRuns: 80,
        horizonDays,
        days: [
            { value: 9, count: 120, cumulativeShare: 0.6 },
            { value: horizonDays, count: 80, cumulativeShare: 0.6 },
        ],
        items: null,
    });
    const capped = (over: Partial<CapacityForecast> = {}) =>
        forecast({
            p85Days: 365,
            p95Days: 365,
            p85Date: "2027-06-01",
            p95Date: "2027-06-01",
            completionDistribution: distribution(365),
            ...over,
        });
    const tileText = (tile: string) => screen.getByTestId(tile).textContent ?? "";

    it("reads '<horizon> days or more' and shows no date; a percentile before the horizon keeps its date", () => {
        render(<ForecastTiles forecast={capped()} />);

        expect(value("tile-p50")).toHaveTextContent(/^Jun 10$/u);
        expect(within(screen.getByTestId("tile-p50")).getByText("9 days")).toBeInTheDocument();
        for (const tile of ["tile-p85", "tile-p95"]) {
            expect(value(tile)).toHaveTextContent(/^365 days or more$/u);
            expect(tileText(tile)).not.toMatch(/Jun 1/u);
            expect(tileText(tile)).not.toContain("2027");
            // the day count is said once, in the value
            expect(tileText(tile).match(/365 days/gu)).toHaveLength(1);
        }
        // the P85 tile keeps its "Target" mark
        expect(within(screen.getByTestId("tile-p85")).getByText("Target")).toBeInTheDocument();
    });

    it("takes the horizon from the API: it has no 365 of its own", () => {
        render(
            <ForecastTiles
                forecast={capped({
                    p85Days: 200,
                    p95Days: 200,
                    p85Date: "2026-12-18",
                    p95Date: "2026-12-18",
                    completionDistribution: distribution(200),
                })}
            />,
        );
        expect(value("tile-p85")).toHaveTextContent(/^200 days or more$/u);
        expect(value("tile-p95")).toHaveTextContent(/^200 days or more$/u);
    });

    it("a percentile of 365 days is a normal date when the served horizon is another number", () => {
        render(<ForecastTiles forecast={capped({ completionDistribution: distribution(400) })} />);
        expect(value("tile-p85")).toHaveTextContent(/^Jun 1, 2027$/u);
        expect(within(screen.getByTestId("tile-p85")).getByText("365 days")).toBeInTheDocument();
    });

    it.each([
        ["null", null],
        ["absent", undefined],
    ])(
        "with no distribution served (%s) the tile stays as it is: the web cannot know the horizon",
        (_name, completionDistribution) => {
            render(<ForecastTiles forecast={capped({ completionDistribution })} />);
            expect(value("tile-p85")).toHaveTextContent(/^Jun 1, 2027$/u);
            expect(
                within(screen.getByTestId("tile-p85")).getByText("365 days"),
            ).toBeInTheDocument();
            expect(screen.getByTestId("forecast-tiles")).not.toHaveTextContent("or more");
        },
    );

    it("when the three percentiles are at the horizon the one tile says so and does not call it low variance", () => {
        render(<ForecastTiles forecast={capped({ p50Days: 365, p50Date: "2027-06-01" })} />);
        expect(value("tile-range")).toHaveTextContent(/^365 days or more$/u);
        expect(tileText("tile-range")).not.toContain("low variance");
        expect(tileText("tile-range")).not.toContain("2027");
        expect(screen.queryByTestId("tile-p50")).toBeNull();
    });

    it("the evidence facts say the same as the tiles", () => {
        const facts = Object.fromEntries(
            forecastFacts(capped()).map((fact) => [fact.label, fact.value]),
        );
        expect(facts["P50 · optimistic"]).toBe("Jun 10 · 9 days");
        expect(facts["P85 · target"]).toBe("365 days or more");
        expect(facts["P95 · conservative"]).toBe("365 days or more");
    });
});

// A date in another calendar year than today shows its year: "Oct 2" for a day one year ahead
// read as yesterday.
describe("forecast dates in another calendar year", () => {
    it("shows the year of a date that is not in this year, and no year for a date in this year", () => {
        expect(formatForecastDate("2026-06-10")).toBe("Jun 10");
        expect(formatForecastDate("2026-12-31")).toBe("Dec 31");
        expect(formatForecastDate("2027-01-01")).toBe("Jan 1, 2027");
        expect(formatForecastDate("2027-06-01")).toBe("Jun 1, 2027");
        expect(formatForecastDate("2025-12-31")).toBe("Dec 31, 2025");
    });

    it("this year is the year of today as a UTC day, as the dates are UTC days", () => {
        // 2026-12-31 23:30 in Los Angeles is already 2027-01-01 in UTC
        vi.setSystemTime(new Date("2027-01-01T07:30:00Z"));
        expect(formatForecastDate("2027-01-05")).toBe("Jan 5");
        expect(formatForecastDate("2026-12-31")).toBe("Dec 31, 2026");
    });

    it("a tile and its evidence fact show the year too", () => {
        const next = forecast({ p95Days: 250, p95Date: "2027-02-06" });
        render(<ForecastTiles forecast={next} />);
        expect(value("tile-p95")).toHaveTextContent(/^Feb 6, 2027$/u);
        expect(value("tile-p50")).toHaveTextContent(/^Jun 10$/u);
        const facts = Object.fromEntries(
            forecastFacts(next).map((fact) => [fact.label, fact.value]),
        );
        expect(facts["P95 · conservative"]).toBe("Feb 6, 2027 · 250 days");
    });
});

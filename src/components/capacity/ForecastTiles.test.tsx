import { describe, expect, it } from "vitest";

import { render, screen, within } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

import { ForecastTiles } from "./ForecastTiles";

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

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

        expect(value("tile-p50")).toHaveTextContent(/^Jun (9|10)$/u);
        expect(value("tile-p85")).toHaveTextContent(/^Jun (19|20)$/u);
        expect(value("tile-p95")).toHaveTextContent(/^(Jun 30|Jul 1)$/u);
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
        expect(within(range).getByText("low variance")).toBeInTheDocument();
    });
});

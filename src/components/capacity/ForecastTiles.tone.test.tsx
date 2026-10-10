/** CHAOS-9077: the forecast tiles have no change at all (no `metric-delta`, no good / bad tone). */
import { afterEach, describe, expect, it } from "vitest";

import { cleanup, render, screen } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

import { ForecastTiles } from "./ForecastTiles";

afterEach(cleanup);

const forecast = {
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
} as CapacityForecast;

describe("ForecastTiles change tone", () => {
    it("draws no change element and no good / bad tone", () => {
        const { container } = render(<ForecastTiles forecast={forecast} />);
        expect(screen.queryByTestId("metric-delta")).toBeNull();
        expect(container.innerHTML).not.toContain("text-(--positive)");
        expect(container.innerHTML).not.toContain("text-(--accent-negative)");
    });
});

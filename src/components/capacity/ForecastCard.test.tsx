import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { ForecastCard } from "./ForecastCard";
import type { CapacityForecast } from "@/lib/graphql/types";

const forecast: CapacityForecast = {
    forecastId: "forecast-1",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 42,
    p50Date: "2026-06-15",
    p85Date: "2026-06-15",
    p95Date: "2026-06-15",
    p50Days: 14,
    p85Days: 14,
    p95Days: 14,
    throughputMean: 3,
    throughputStddev: 0,
    historyDays: 30,
    insufficientHistory: false,
    highVariance: false,
};

describe("ForecastCard", () => {
    it("collapses identical forecast percentiles into one low-variance row", () => {
        render(<ForecastCard forecast={forecast} />);

        expect(screen.getByText("≈2 weeks (low variance)")).toBeInTheDocument();
        expect(screen.queryByText("50% chance")).not.toBeInTheDocument();
        expect(screen.queryByText("85% chance")).not.toBeInTheDocument();
        expect(screen.queryByText("95% chance")).not.toBeInTheDocument();
    });
});

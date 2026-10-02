import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import type { CapacityForecast } from "@/lib/graphql/types";

import { ForecastInputsCard } from "./ForecastInputsCard";

const forecast = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 7,
    throughputMean: 2,
    throughputStddev: 0.5,
    historyDays: 30,
    insufficientHistory: false,
    highVariance: false,
    ...over,
});

describe("ForecastInputsCard", () => {
    it("labels the scope All Teams when no team or work scope is set", () => {
        render(<ForecastInputsCard forecast={forecast()} />);

        expect(screen.getByText("Scope")).toBeInTheDocument();
        expect(screen.getByText("All Teams")).toBeInTheDocument();
    });

    it("prints a work scope, but never a raw team id", () => {
        const first = render(
            <ForecastInputsCard forecast={forecast({ workScopeId: "Project X" })} />,
        );
        expect(screen.getByText("Project X")).toBeInTheDocument();
        first.unmount();

        render(<ForecastInputsCard forecast={forecast({ teamId: "0b1f6a52-6f0b-4f4e" })} />);
        expect(screen.queryByText("Scope")).toBeNull();
        expect(screen.queryByText(/0b1f6a52/)).toBeNull();
    });
});

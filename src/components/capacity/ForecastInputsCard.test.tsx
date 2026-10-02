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

    it("says how many teams for several, never All Teams (a null teamId is not all teams)", () => {
        render(<ForecastInputsCard forecast={forecast({ teamId: null })} teamCount={3} />);

        expect(screen.getByText("3 teams")).toBeInTheDocument();
        expect(screen.queryByText("All Teams")).toBeNull();
    });

    it("keeps All Teams for no team, no label for one team, and the work scope first", () => {
        const none = render(<ForecastInputsCard forecast={forecast()} teamCount={0} />);
        expect(screen.getByText("All Teams")).toBeInTheDocument();
        none.unmount();

        const one = render(
            <ForecastInputsCard forecast={forecast({ teamId: "t" })} teamCount={1} />,
        );
        expect(screen.queryByText("Scope")).toBeNull();
        one.unmount();

        render(
            <ForecastInputsCard forecast={forecast({ workScopeId: "Project X" })} teamCount={3} />,
        );
        expect(screen.getByText("Project X")).toBeInTheDocument();
        expect(screen.queryByText("3 teams")).toBeNull();
    });
});

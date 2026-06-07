import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { ChartFrame } from "./ChartFrame";

describe("ChartFrame", () => {
    it("renders the title, interpretation, threshold and chart children when data is ready", () => {
        render(
            <ChartFrame
                title="Line Coverage Trend"
                interpretation="Coverage appears stable across the selected window."
                threshold="Target baseline: 80%"
            >
                <div data-testid="chart-child">chart body</div>
            </ChartFrame>,
        );

        expect(screen.getByRole("heading", { name: "Line Coverage Trend" })).toBeInTheDocument();
        expect(
            screen.getByText("Coverage appears stable across the selected window."),
        ).toBeInTheDocument();
        expect(screen.getByText("Target baseline: 80%")).toBeInTheDocument();
        expect(screen.getByTestId("chart-child")).toBeInTheDocument();
    });

    it("renders a loading DataState instead of chart children", () => {
        render(
            <ChartFrame
                title="Pipeline Trend"
                interpretation="Loading latest pipeline health."
                isLoading
            >
                <div data-testid="chart-child">chart body</div>
            </ChartFrame>,
        );

        expect(screen.getByTestId("data-state-loading")).toBeInTheDocument();
        expect(screen.queryByTestId("chart-child")).not.toBeInTheDocument();
    });

    it("renders an error DataState instead of chart children", () => {
        render(
            <ChartFrame
                title="Pipeline Trend"
                interpretation="Pipeline health could not be loaded."
                isError
                stateMessage="The trend request failed."
            >
                <div data-testid="chart-child">chart body</div>
            </ChartFrame>,
        );

        expect(screen.getByTestId("data-state-error")).toBeInTheDocument();
        expect(screen.getByText("The trend request failed.")).toBeInTheDocument();
        expect(screen.queryByTestId("chart-child")).not.toBeInTheDocument();
    });

    it("renders an empty DataState instead of chart children", () => {
        render(
            <ChartFrame
                title="Pipeline Trend"
                interpretation="Pipeline health appears once source data is available."
                isEmpty
                stateTitle="No pipeline data"
                stateDescription="Connect CI data to populate this chart."
            >
                <div data-testid="chart-child">chart body</div>
            </ChartFrame>,
        );

        expect(screen.getByTestId("data-state-preview-not-populated")).toBeInTheDocument();
        expect(screen.getByText("No pipeline data")).toBeInTheDocument();
        expect(screen.getByText("Connect CI data to populate this chart.")).toBeInTheDocument();
        expect(screen.queryByTestId("chart-child")).not.toBeInTheDocument();
    });

    it("prioritizes an explicit state over boolean flags", () => {
        render(
            <ChartFrame
                title="Pipeline Trend"
                interpretation="State precedence check."
                state="error"
                isLoading
                isEmpty
                stateMessage="explicit error wins"
            >
                <div data-testid="chart-child">chart body</div>
            </ChartFrame>,
        );

        expect(screen.getByTestId("data-state-error")).toBeInTheDocument();
        expect(screen.queryByTestId("data-state-loading")).not.toBeInTheDocument();
        expect(screen.queryByTestId("chart-child")).not.toBeInTheDocument();
    });

    it("renders descriptor annotations whose value is zero", () => {
        render(
            <ChartFrame
                title="Threshold Breaches"
                interpretation="Zero is a meaningful value."
                threshold={{ label: "Breaches", value: 0 }}
            >
                <div data-testid="chart-child">chart body</div>
            </ChartFrame>,
        );

        expect(screen.getByText("Breaches")).toBeInTheDocument();
        expect(screen.getByText("0")).toBeInTheDocument();
    });
});

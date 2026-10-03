import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { buildFailurePatternsModel } from "@/lib/testops/failure-patterns";

import { FailurePatternsCard } from "./FailurePatternsCard";

const heatmapSpy = vi.hoisted(() => vi.fn());
vi.mock("@/components/charts/HeatmapChart", () => ({
    HeatmapChart: (props: unknown) => {
        heatmapSpy(props);
        return <div data-testid="heatmap-chart" />;
    },
}));

const breakdown = (items: Array<[string, number]>) => ({
    dimension: "TEAM",
    measure: "PIPELINE_FAILURE_RATE",
    items: items.map(([key, value]) => ({ key, value })),
});

afterEach(() => {
    cleanup();
    heatmapSpy.mockClear();
});

describe("FailurePatternsCard", () => {
    it("is a section card titled 'Failure patterns'", () => {
        render(<FailurePatternsCard model={buildFailurePatternsModel(undefined)} />);
        const card = screen.getByTestId("testops-failure-patterns");
        expect(card.tagName).toBe("SECTION");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Failure patterns",
        );
    });

    it("draws the 'Unattributed' empty state, with the served rate, when every failure is unattributed", () => {
        render(<FailurePatternsCard model={buildFailurePatternsModel(breakdown([["None", 4]]))} />);
        const state = screen.getByTestId("testops-failure-patterns-unattributed");
        expect(within(state).getByText("Unattributed")).toBeInTheDocument();
        expect(state).toHaveTextContent("failure rate in this group: 4%");
        expect(state).toHaveTextContent("a data-quality gap, not a failure class");
        // An attribution gap is not drawn as a failure class: no chart.
        expect(screen.queryByTestId("heatmap-chart")).toBeNull();
    });

    it("draws the heatmap of the served groups, with the caveat when one of them is unattributed", () => {
        const model = buildFailurePatternsModel(
            breakdown([
                ["team-a", 5],
                ["None", 2],
            ]),
        );
        render(<FailurePatternsCard model={model} />);
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
        expect(heatmapSpy.mock.calls.at(-1)?.[0]).toEqual({ data: model.heatmap });
        expect(screen.queryByTestId("testops-failure-patterns-unattributed")).toBeNull();
        expect(screen.getByText(/read its share as a data-quality caveat/)).toBeInTheDocument();
    });

    it("draws the heatmap without the caveat when every group is attributed", () => {
        render(
            <FailurePatternsCard model={buildFailurePatternsModel(breakdown([["team-a", 5]]))} />,
        );
        expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
        expect(screen.queryByText(/data-quality caveat/)).toBeNull();
    });

    it("says there are no failure patterns when the breakdown has no rows", () => {
        render(<FailurePatternsCard model={buildFailurePatternsModel(breakdown([]))} />);
        expect(screen.getByText("No failure patterns")).toBeInTheDocument();
        expect(screen.queryByTestId("heatmap-chart")).toBeNull();
    });

    it("shows an error, not 'no failure patterns', when the request failed", () => {
        render(<FailurePatternsCard model={buildFailurePatternsModel(undefined)} fetchFailed />);
        expect(screen.getByText("Failure patterns could not be loaded")).toBeInTheDocument();
        expect(screen.queryByText("No failure patterns")).toBeNull();
    });
});

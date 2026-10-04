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

    // CHAOS-8514: the card answers "what fails" (the served workflow and job groups) and "which
    // team" (the grouping it had). The two parts have their own states.
    describe("failing workflows and jobs", () => {
        const model = buildFailurePatternsModel(undefined);
        const groups = [
            {
                workflowName: "CI",
                jobName: "unit-tests",
                provider: "github",
                runs: 12,
                failedRuns: 3,
                failureRate: 0.25,
            },
            {
                workflowName: null,
                jobName: "lint",
                provider: null,
                runs: 8,
                failedRuns: 1,
                failureRate: 0.125,
            },
        ];
        const part = () => screen.getByTestId("testops-job-failures");

        it("draws one meter row per served group: job, workflow, rate and failed of runs", () => {
            render(
                <FailurePatternsCard
                    model={model}
                    jobFailures={{ groups, totalCount: 2, truncated: false }}
                />,
            );
            expect(within(part()).getByRole("heading", { level: 3 })).toHaveTextContent(
                "Failing workflows and jobs",
            );
            const rows = within(part()).getAllByTestId("meter-row");
            expect(rows.map((row) => row.textContent)).toEqual([
                "unit-tests · CI25% · 3 of 12 runs failed",
                "lint13% · 1 of 8 runs failed",
            ]);
            // The fill is the served share of a full track (max 1).
            expect((within(rows[0]).getByTestId("meter-fill") as HTMLElement).style.width).toBe(
                "25%",
            );
            expect(within(part()).queryByTestId("testops-job-failures-cut")).toBeNull();
        });

        it("says the list is cut, with the served total, when truncated", () => {
            render(
                <FailurePatternsCard
                    model={model}
                    jobFailures={{ groups, totalCount: 31, truncated: true }}
                />,
            );
            expect(within(part()).getByTestId("testops-job-failures-cut")).toHaveTextContent(
                "Showing 2 of 31 job groups, the ones with the most failed runs.",
            );
        });

        it("reads 'No data for this window' when no group is served", () => {
            render(
                <FailurePatternsCard
                    model={model}
                    jobFailures={{ groups: [], totalCount: 0, truncated: false }}
                />,
            );
            expect(within(part()).getByTestId("testops-job-failures-empty")).toHaveTextContent(
                "No data for this window",
            );
            expect(within(part()).queryByTestId("meter-row")).toBeNull();
        });

        it("reads 'Could not be read' when the read failed, and keeps the team part", () => {
            render(<FailurePatternsCard model={model} jobFailures={{ fetchFailed: true }} />);
            expect(within(part()).getByTestId("testops-job-failures-failed")).toHaveTextContent(
                "Could not be read",
            );
            expect(within(part()).queryByTestId("testops-job-failures-empty")).toBeNull();
            expect(screen.getByTestId("testops-failure-teams")).toBeInTheDocument();
        });

        it("keeps the team grouping as the second part, after the jobs", () => {
            render(
                <FailurePatternsCard
                    model={buildFailurePatternsModel(
                        breakdown([
                            ["team-a", 12],
                            ["team-b", 4],
                        ]),
                    )}
                    jobFailures={{ groups, totalCount: 2, truncated: false }}
                />,
            );
            const teams = screen.getByTestId("testops-failure-teams");
            expect(within(teams).getByRole("heading", { level: 3 })).toHaveTextContent("By team");
            expect(within(teams).getByTestId("heatmap-chart")).toBeInTheDocument();
            expect(
                Boolean(part().compareDocumentPosition(teams) & Node.DOCUMENT_POSITION_FOLLOWING),
            ).toBe(true);
        });

        it("has no job part when the page passes none (the Pipelines tab)", () => {
            render(<FailurePatternsCard model={model} />);
            expect(screen.queryByTestId("testops-job-failures")).toBeNull();
        });
    });
});

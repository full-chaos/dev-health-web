import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, waitFor, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { MetricEvidenceCards } from "./MetricEvidenceCards";

// CHAOS-9630: the shared evidence drawer of change failure rate starts with what the served rate
// stands on (basis, D, K, coverage, unknown reason). No other metric's drawer has the block.

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/quality",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const cfr = (extra: object) => ({
    metric: "change_failure_rate",
    label: "Change Failure Rate",
    value: 25,
    unit: "%",
    delta_pct: 0,
    has_data: true,
    has_prior_data: true,
    rate_state: "measured",
    spark: [],
    ...extra,
});

const cycle = {
    metric: "cycle_time",
    label: "Cycle Time",
    value: 4,
    unit: "days",
    delta_pct: 10,
    spark: [],
};

const open = async (label: string) => {
    const tile = screen.getByText(label).closest("article") as HTMLElement;
    await userEvent.click(within(tile).getByRole("button", { name: `${label}: Open evidence` }));
    return screen.getByRole("dialog", { name: "Evidence & Context" });
};

beforeEach(() => {
    mockGetExplainData.mockReset();
    mockGetExplainData.mockResolvedValue({ summary: "", evidence: [], actions: [] });
});

describe("MetricEvidenceCards, change failure evidence in the drawer", () => {
    it("starts the drawer of change failure rate with the served basis, counts and coverage", async () => {
        render(
            <MetricEvidenceCards
                metrics={["change_failure_rate", "cycle_time"]}
                deltas={[
                    cfr({
                        change_failure_evidence: {
                            basis: "status",
                            deployments: 40,
                            deployments_with_status: 30,
                            coverage: 0.75,
                            unknown_reason: null,
                        },
                    }),
                    cycle,
                ]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );

        const drawer = await open("Change Failure Rate");

        const block = within(drawer).getByTestId("change-failure-evidence");
        expect(block).toHaveTextContent("What this rate stands on");
        const facts = within(block).getByTestId("change-failure-evidence-facts");
        expect(facts).toHaveTextContent("Evidence basisDeployment statuses");
        expect(facts).toHaveTextContent("Rate is out ofDeployments with a final status");
        expect(facts).toHaveTextContent("Deployments40");
        expect(facts).toHaveTextContent("With a final status30");
        expect(facts).toHaveTextContent("Status coverage75%");
        await waitFor(() => expect(mockGetExplainData).toHaveBeenCalled());
    });

    it("says why an unknown rate has no value", async () => {
        render(
            <MetricEvidenceCards
                metrics={["change_failure_rate"]}
                deltas={[
                    cfr({
                        has_data: false,
                        value: 0,
                        rate_state: "unknown_no_incident_evidence",
                        change_failure_evidence: {
                            basis: null,
                            deployments: 12,
                            deployments_with_status: 0,
                            coverage: 0,
                            unknown_reason: "deployments_without_outcome",
                        },
                    }),
                ]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );

        const drawer = await open("Change Failure Rate");

        const facts = within(drawer).getByTestId("change-failure-evidence-facts");
        expect(facts).toHaveTextContent(
            "Why there is no rateDeployments, but no incident evidence and no deployment with a final status",
        );
        expect(facts).not.toHaveTextContent("Evidence basis");
        expect(facts).toHaveTextContent("Status coverage0%");
    });

    it("has no block when the row serves no evidence, or for another metric", async () => {
        render(
            <MetricEvidenceCards
                metrics={["change_failure_rate", "cycle_time"]}
                deltas={[cfr({}), cycle]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );

        const first = await open("Change Failure Rate");
        expect(within(first).queryByTestId("change-failure-evidence")).toBeNull();
        await userEvent.keyboard("{Escape}");

        const second = await open("Cycle Time");
        expect(within(second).queryByTestId("change-failure-evidence")).toBeNull();
    });

    it("never gives another metric the block, even when its row carries the field", async () => {
        render(
            <MetricEvidenceCards
                metrics={["cycle_time"]}
                deltas={[
                    {
                        ...cycle,
                        change_failure_evidence: { basis: "status", deployments: 1 },
                    },
                ]}
                filters={filters}
                placeholderDeltas={false}
            />,
        );

        const drawer = await open("Cycle Time");
        expect(within(drawer).queryByTestId("change-failure-evidence")).toBeNull();
    });
});

/**
 * The Investment confidence tile for rework, a FAILED Home read against an EMPTY answer
 * (CHAOS-9189 in the describe name). The real MetricCard is used: the test reads the drawn text.
 */
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { render, screen, within } from "@/test/utils";

import { ConfidencePanel } from "./ConfidencePanel";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("./AllocationCoverage", () => ({ AllocationCoverage: () => null }));
vi.mock("./EvidenceQualityBands", () => ({ EvidenceQualityBands: () => null }));

const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const served: MetricDelta = {
    metric: "pr_rework_ratio",
    label: "PR Rework Ratio",
    value: 12,
    unit: "%",
    delta_pct: 4,
    has_data: true,
    has_prior_data: true,
    spark: [],
};

const drawTile = (props: { reworkMetric?: MetricDelta; reworkReadFailed?: boolean }) => {
    render(
        <ConfidencePanel
            filters={filters}
            workUnits={[]}
            investmentMix={null}
            mixExplanation={{ data: null } as never}
            teamCategoryFlow={null}
            repoTeamFlow={null}
            isCategoryFlowLoading={false}
            {...props}
        />,
    );
    return within(screen.getByTestId("confidence-tile-rework"));
};

describe("Investment confidence rework tile when the Home read fails (CHAOS-9189)", () => {
    it("failed read: the tile says 'Could not be read', not 'Rework signal not available yet'", () => {
        const tile = drawTile({ reworkReadFailed: true });

        expect(tile.getByTestId("metric-value")).toHaveTextContent(/^Could not be read$/);
        expect(tile.queryByText("Rework signal not available yet")).toBeNull();
        expect(tile.queryByText(/Not reported|No data for this window/)).toBeNull();
    });

    it("empty answer: the tile says 'Rework signal not available yet' and never 'Could not be read'", () => {
        const tile = drawTile({ reworkReadFailed: false });

        expect(tile.getByText("Rework signal not available yet")).toBeInTheDocument();
        expect(screen.queryByText("Could not be read")).toBeNull();
    });

    it("normal answer: the served rework value is drawn and nothing says 'Could not be read'", () => {
        const tile = drawTile({ reworkMetric: served, reworkReadFailed: false });

        expect(tile.getByTestId("metric-value")).toHaveTextContent("12");
        expect(screen.queryByText("Could not be read")).toBeNull();
    });
});

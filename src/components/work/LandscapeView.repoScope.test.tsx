/** CHAOS-9089: with a repository selected, the three unscoped Landscape tiles say so. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { NOT_FILTERED_BY_REPOSITORY } from "@/lib/metrics/repoScope";

vi.mock("@/components/charts/QuadrantPanel", () => ({ QuadrantPanel: () => null }));
vi.mock("@/components/investment/InvestmentChart", () => ({ InvestmentChart: () => null }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

import { LandscapeView } from "./LandscapeView";

const row = (metric: string) => ({
    metric,
    label: `Label ${metric}`,
    value: 10,
    unit: "%",
    delta_pct: 5,
    spark: [],
    has_data: true,
    has_prior_data: true,
});

const draw = (repos: string[]) =>
    render(
        <LandscapeView
            filters={{ ...defaultMetricFilter, what: repos.length ? { repos } : {} }}
            deltas={[row("wip_saturation"), row("blocked_work"), row("throughput")] as never}
            placeholderDeltas={false}
            investmentMix={null}
            cycleThroughput={null}
            wipThroughput={null}
            reviewLoadLatency={null}
            planned={null}
            unplanned={null}
            plannedPct={null}
            unplannedPct={null}
        />,
    );

afterEach(cleanup);

describe("LandscapeView repository note", () => {
    it("notes all three tiles with a repository, and keeps the values", () => {
        draw(["full-chaos/dev-health-web"]);
        expect(screen.getAllByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toHaveLength(3);
        expect(screen.getAllByTestId("metric-delta")).toHaveLength(3);
    });
    it("has no note without a repository", () => {
        draw([]);
        expect(screen.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
    });
});

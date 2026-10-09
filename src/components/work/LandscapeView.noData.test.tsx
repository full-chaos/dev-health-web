/** The Landscape tiles read `has_data` / `has_prior_data`: no data is never drawn as a 0. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { defaultMetricFilter } from "@/lib/filters/defaults";

vi.mock("@/components/charts/QuadrantPanel", () => ({ QuadrantPanel: () => null }));
vi.mock("@/components/investment/InvestmentChart", () => ({ InvestmentChart: () => null }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

import { LandscapeView } from "./LandscapeView";

const row = (metric: string, extra: Record<string, unknown>) => ({
    metric,
    label: `Label ${metric}`,
    value: 0,
    unit: "%",
    delta_pct: 0,
    spark: [],
    ...extra,
});

function renderTiles(extra: Record<string, unknown>) {
    render(
        <LandscapeView
            filters={defaultMetricFilter}
            deltas={
                [
                    row("wip_saturation", extra),
                    row("blocked_work", extra),
                    row("throughput", extra),
                ] as never
            }
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
    return screen.getAllByTestId("metric-value").map((v) => v.closest("section, article, div")!);
}

afterEach(cleanup);

describe("LandscapeView tiles — no data", () => {
    it("has_data false: all three say 'No data for this window', no 0, no change", () => {
        renderTiles({ has_data: false });
        const values = screen.getAllByTestId("metric-value");
        expect(values).toHaveLength(3);
        for (const v of values) expect(v).toHaveTextContent(/^No data for this window$/);
        expect(screen.queryAllByTestId("metric-delta")).toHaveLength(0);
    });

    it("has_prior_data false: the value and 'No prior period', never '0%' or 'No change'", () => {
        renderTiles({ has_prior_data: false, value: 5 });
        for (const v of screen.getAllByTestId("metric-value")) expect(v).toHaveTextContent("5");
        expect(screen.getAllByText("No prior period")).toHaveLength(3);
        expect(screen.queryAllByTestId("metric-delta")).toHaveLength(0);
        expect(document.body.textContent).not.toMatch(/0%/);
        expect(document.body.textContent).not.toMatch(/No change/);
    });

    it("a measured 0 with data in both windows is still drawn as 0", () => {
        renderTiles({ has_data: true, has_prior_data: true });
        for (const v of screen.getAllByTestId("metric-value")) {
            expect(v).toHaveTextContent(/^0\s*%$/);
        }
        expect(screen.getAllByTestId("metric-delta")).toHaveLength(3);
        expect(within(screen.getAllByTestId("metric-delta")[0]).queryByText("x")).toBeNull();
    });
});

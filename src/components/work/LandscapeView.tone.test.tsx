/** CHAOS-9077: the Landscape tile change tone follows the metric polarity, not the sign. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { defaultMetricFilter } from "@/lib/filters/defaults";

vi.mock("@/components/charts/QuadrantPanel", () => ({ QuadrantPanel: () => null }));
vi.mock("@/components/investment/InvestmentChart", () => ({ InvestmentChart: () => null }));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

import { LandscapeView } from "./LandscapeView";

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";

const row = (metric: string, delta_pct: number) => ({
    metric,
    label: `Label ${metric}`,
    value: 10,
    unit: "%",
    delta_pct,
    spark: [],
    has_data: true,
    has_prior_data: true,
});

/** Renders the three tiles with the same change and returns their delta elements in tile order. */
function deltas(delta_pct: number) {
    render(
        <LandscapeView
            filters={defaultMetricFilter}
            deltas={
                [
                    row("wip_saturation", delta_pct),
                    row("blocked_work", delta_pct),
                    row("throughput", delta_pct),
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
    const els = screen.getAllByTestId("metric-delta");
    expect(els).toHaveLength(3);
    return { wip: els[0], blocked: els[1], throughput: els[2] };
}

afterEach(cleanup);

describe("LandscapeView change tone follows polarity", () => {
    it("lower-is-better metrics: a fall is good", () => {
        const { wip, blocked } = deltas(-3);
        for (const el of [wip, blocked]) {
            expect(el).toHaveClass(GOOD);
            expect(el).not.toHaveClass(BAD);
        }
    });

    it("lower-is-better metrics: a rise is bad", () => {
        const { wip, blocked } = deltas(3);
        for (const el of [wip, blocked]) {
            expect(el).toHaveClass(BAD);
            expect(el).not.toHaveClass(GOOD);
        }
    });

    it("throughput (higher is better): a rise is good", () => {
        expect(deltas(3).throughput).toHaveClass(GOOD);
    });

    it("throughput (higher is better): a fall is bad", () => {
        expect(deltas(-3).throughput).toHaveClass(BAD);
    });
});

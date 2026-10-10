/** CHAOS-9077: the Home monitoring tiles pass the metric's polarity; the change tone must not move. */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { cleanup, render, screen, within } from "@/test/utils";
import type { HomeResponse, MetricDelta } from "@/lib/types";

import { HomeMonitoring } from "./HomeMonitoring";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

afterEach(cleanup);

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";

const filters: MetricFilter = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90, compare_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
};

const row = (metric: string, delta_pct: number): MetricDelta => ({
    metric,
    label: metric,
    value: 5,
    unit: "%",
    delta_pct,
    spark: [
        { ts: "2026-09-01", value: 1 },
        { ts: "2026-09-02", value: 2 },
    ],
});

function deltaClass(view: string, metric: string, delta_pct: number) {
    const home = {
        freshness: { last_ingested_at: null, sources: {}, coverage: {} },
        deltas: [row(metric, delta_pct)],
        summary: [],
        tiles: {},
        constraint: { title: "", claim: "", evidence: [], experiments: [] },
        events: [],
    } as unknown as HomeResponse;
    render(
        <HomeMonitoring
            home={home}
            filters={filters}
            activeRole="em"
            lensId="em"
            initialView={view}
        />,
    );
    const cls = within(screen.getByTestId(`monitoring-tile-${metric}`)).getByTestId(
        "metric-delta",
    ).className;
    cleanup();
    return cls;
}

describe("HomeMonitoring change tone", () => {
    it("lower is better (cycle_time, flow): falling good, rising bad", () => {
        expect(deltaClass("flow", "cycle_time", -10)).toContain(GOOD);
        const rising = deltaClass("flow", "cycle_time", 10);
        expect(rising).toContain(BAD);
        expect(rising).not.toContain(GOOD);
    });
    it("higher is better (throughput): rising good, falling bad", () => {
        expect(deltaClass("throughput", "throughput", 10)).toContain(GOOD);
        const falling = deltaClass("throughput", "throughput", -10);
        expect(falling).toContain(BAD);
        expect(falling).not.toContain(GOOD);
    });
});

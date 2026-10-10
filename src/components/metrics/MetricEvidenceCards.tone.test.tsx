/** CHAOS-9077: the evidence tiles pass the metric's polarity; the change tone must not move. */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));

import { MetricEvidenceCards } from "./MetricEvidenceCards";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { cleanup, screen } from "@/test/utils";

afterEach(cleanup);

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";
const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as never;

function deltaClass(metric: string, delta_pct: number) {
    render(
        <MetricEvidenceCards
            metrics={[metric]}
            deltas={[{ metric, label: metric, value: 5, unit: "%", delta_pct, spark: [] }] as never}
            filters={filters}
            placeholderDeltas={false}
        />,
    );
    const cls = screen.getByTestId("metric-delta").className;
    cleanup();
    return cls;
}

describe("MetricEvidenceCards change tone", () => {
    it("lower is better (cycle_time): falling good, rising bad", () => {
        expect(deltaClass("cycle_time", -10)).toContain(GOOD);
        const rising = deltaClass("cycle_time", 10);
        expect(rising).toContain(BAD);
        expect(rising).not.toContain(GOOD);
    });
    it("higher is better (throughput): rising good, falling bad", () => {
        expect(deltaClass("throughput", 10)).toContain(GOOD);
        const falling = deltaClass("throughput", -10);
        expect(falling).toContain(BAD);
        expect(falling).not.toContain(GOOD);
    });
});

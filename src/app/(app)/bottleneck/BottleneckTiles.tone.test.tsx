/** CHAOS-9077: the Bottleneck tiles pass the metric's polarity; the change tone must not move. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

import { BottleneckTiles } from "./BottleneckTiles";

afterEach(cleanup);

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";

function deltaClass(metric: string, delta_pct: number) {
    renderWithEvidenceDrawer(
        <BottleneckTiles
            deltas={[{ metric, label: metric, value: 5, unit: "%", delta_pct, spark: [] }] as never}
            placeholderDeltas={false}
            filters={defaultMetricFilter}
            origin="/bottleneck"
        />,
    );
    const tile = screen.getByTestId(`bottleneck-tile-${metric}`);
    return within(tile).getByTestId("metric-delta").className;
}

describe("BottleneckTiles change tone (lower is better)", () => {
    it.each(["wip_saturation", "blocked_work", "review_latency"])(
        "%s falling is good, rising is bad",
        (metric) => {
            expect(deltaClass(metric, -10)).toContain(GOOD);
            cleanup();
            const rising = deltaClass(metric, 10);
            expect(rising).toContain(BAD);
            expect(rising).not.toContain(GOOD);
        },
    );
});

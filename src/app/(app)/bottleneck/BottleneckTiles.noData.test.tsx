/** The Bottleneck tiles read `has_data` / `has_prior_data`: no data is never drawn as a 0. */
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

const row = (metric: string, extra: Record<string, unknown>) => ({
    metric,
    label: metric,
    value: 0,
    unit: "%",
    delta_pct: 0,
    spark: [],
    ...extra,
});

function renderTile(extra: Record<string, unknown>) {
    renderWithEvidenceDrawer(
        <BottleneckTiles
            deltas={[row("wip_saturation", extra)] as never}
            placeholderDeltas={false}
            filters={defaultMetricFilter}
            origin="/bottleneck"
        />,
    );
    return screen.getByTestId("bottleneck-tile-wip_saturation");
}

afterEach(cleanup);

describe("BottleneckTiles — no data", () => {
    it("has_data false: 'No data for this window', no 0, no change", () => {
        const tile = renderTile({ has_data: false });
        expect(within(tile).getByTestId("metric-value")).toHaveTextContent(
            /^No data for this window$/,
        );
        expect(within(tile).queryByTestId("metric-delta")).toBeNull();
        expect(tile.textContent).not.toMatch(/0/);
    });

    it("has_prior_data false: the value and 'No prior period', never '0%' or 'No change'", () => {
        const tile = renderTile({ has_prior_data: false, value: 5 });
        expect(within(tile).getByTestId("metric-value")).toHaveTextContent("5");
        expect(within(tile).getByText("No prior period")).toBeInTheDocument();
        expect(within(tile).queryByTestId("metric-delta")).toBeNull();
        expect(tile.textContent).not.toMatch(/0%/);
        expect(tile.textContent).not.toMatch(/No change/);
    });

    it("a measured 0 with data in both windows is still drawn as 0", () => {
        const tile = renderTile({ has_data: true, has_prior_data: true });
        expect(within(tile).getByTestId("metric-value")).toHaveTextContent(/^0\s*%$/);
        expect(within(tile).getByTestId("metric-delta")).toBeInTheDocument();
    });
});

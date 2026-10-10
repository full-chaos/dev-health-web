/** CHAOS-9120: the Bottleneck tiles name the link basis, and a timed-out read is no data, never 0. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

import { BottleneckTiles } from "./BottleneckTiles";

function renderTile(extra: Record<string, unknown>) {
    renderWithEvidenceDrawer(
        <BottleneckTiles
            deltas={
                [
                    {
                        metric: "wip_saturation",
                        label: "WIP Saturation",
                        value: 4,
                        unit: "%",
                        delta_pct: 0,
                        has_data: true,
                        has_prior_data: true,
                        spark: [],
                        ...extra,
                    },
                ] as never
            }
            placeholderDeltas={false}
            filters={defaultMetricFilter}
            origin="/bottleneck"
        />,
    );
    return screen.getByTestId("bottleneck-tile-wip_saturation");
}

afterEach(cleanup);

describe("BottleneckTiles repository link notes", () => {
    it("draws the tier sentence for linked", () => {
        expect(
            renderTile({
                repo_link_state: "linked",
                repo_link_basis: { native: 0, explicit_text: 7, heuristic: 32 },
            }),
        ).toHaveTextContent("0 native, 7 by text, 32 by heuristic.");
    });
    it("draws no data plus text 3 for timed_out, never 0", () => {
        const tile = renderTile({ has_data: false, value: 0, repo_link_state: "timed_out" });
        expect(tile).toHaveTextContent("This read took too long. No value is shown.");
        expect(tile.textContent).not.toMatch(/\b0\s*%/);
    });
});

/** CHAOS-9089: with a repository selected, the unscoped Bottleneck tiles say so. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { NOT_FILTERED_BY_REPOSITORY } from "@/lib/metrics/repoScope";

vi.mock("next/navigation", () => ({
    usePathname: () => "/bottleneck",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));

import { BottleneckTiles } from "./BottleneckTiles";
import { BOTTLENECK_TILES } from "./tiles";

afterEach(cleanup);

const draw = (repos: string[]) =>
    renderWithEvidenceDrawer(
        <BottleneckTiles
            deltas={
                BOTTLENECK_TILES.map(({ metric }) => ({
                    metric,
                    label: metric,
                    value: 5,
                    unit: "%",
                    delta_pct: 4,
                    spark: [],
                })) as never
            }
            placeholderDeltas={false}
            filters={{ ...defaultMetricFilter, what: repos.length ? { repos } : {} }}
            origin="/bottleneck"
        />,
    );

describe("BottleneckTiles repository note", () => {
    it("notes the unscoped tiles only", () => {
        draw(["full-chaos/dev-health-web"]);
        for (const { metric } of BOTTLENECK_TILES) {
            const tile = within(screen.getByTestId(`bottleneck-tile-${metric}`));
            const noted = ["wip_saturation", "blocked_work"].includes(metric);
            expect(tile.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false }) !== null).toBe(
                noted,
            );
        }
    });
    it("has no note without a repository", () => {
        draw([]);
        expect(screen.queryByText(NOT_FILTERED_BY_REPOSITORY, { exact: false })).toBeNull();
    });
});

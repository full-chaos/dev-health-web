import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentMixAggregate } from "@/lib/investmentMix";
import { render, screen } from "@/test/utils";

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

const mix = (stats: InvestmentMixAggregate["evidence_quality_stats"]): InvestmentMixAggregate => ({
    theme_distribution: { quality: 1 },
    subcategory_distribution: {},
    evidence_quality_stats: stats,
});

const panel = (investmentMix: InvestmentMixAggregate | null) =>
    render(
        <ConfidencePanel
            filters={filters}
            workUnits={[]}
            investmentMix={investmentMix}
            mixExplanation={{ data: null } as never}
            teamCategoryFlow={null}
            repoTeamFlow={null}
            isCategoryFlowLoading={false}
        />,
    );

describe("Investment confidence panel: work units left out of the mix", () => {
    it("says how many work units the theme mix leaves out", () => {
        panel(mix({ band_counts: { high: 6, unknown: 4 }, total: 10, uncategorized_count: 4 }));
        expect(screen.getByTestId("uncategorized-note")).toHaveTextContent(
            "4 of 10 work units have too little text to categorize and are left out of the theme mix.",
        );
    });

    it("draws no note when none are left out or there is no mix", () => {
        panel(mix({ band_counts: { high: 10 }, total: 10, uncategorized_count: 0 }));
        expect(screen.queryByTestId("uncategorized-note")).toBeNull();
    });

    it("draws no note without a mix", () => {
        panel(null);
        expect(screen.queryByTestId("uncategorized-note")).toBeNull();
    });
});

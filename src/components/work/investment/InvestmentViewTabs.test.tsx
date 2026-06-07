/**
 * InvestmentView direct-tab-entry tests (CHAOS-2079 remediation).
 *
 * Focused on the two behaviors Codex flagged for direct/deep-link entry:
 *   1. The `rework` tab renders the REAL `rework_ratio` MetricCard when a
 *      metric is provided, and an honest empty state when it is not.
 *   2. The `unit-investment` tab is self-contained: it lists ALL work units on
 *      direct entry (no `focusSubcategory` set), instead of the drill prompt.
 *
 * `useInvestmentData` (which fetches + reads next/navigation + urql) is mocked
 * so these tests exercise the view's tab branching, not the data layer.
 * SparklineChart is mocked so ECharts never runs in jsdom.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta, WorkUnitInvestment } from "@/lib/types";
import type { UseInvestmentDataResult } from "./useInvestmentData";

const { useInvestmentDataMock } = vi.hoisted(() => ({
    useInvestmentDataMock: vi.fn(),
}));

vi.mock("./useInvestmentData", () => ({
    useInvestmentData: (args: unknown) => useInvestmentDataMock(args),
}));

// Sever the @urql/next import chain (InvestmentView statically imports
// InvestmentCharts → TeamExchangeChordSection → graphql/provider → @urql/next,
// which fails to resolve under jsdom even on tabs that don't render charts).
vi.mock("@/lib/graphql/provider", () => ({
    useOrgId: () => undefined,
    useSsr: () => null,
}));
vi.mock("urql", () => ({
    useQuery: () => [{ data: undefined, fetching: false, error: undefined }, vi.fn()],
}));

// Avoid ECharts in jsdom; MetricCard renders a sparkline when spark.length > 1.
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

import { InvestmentView } from "../InvestmentView";

const baseFilters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [], issue_type: [] },
    how: { flow_stage: [] },
};

const makeUnit = (id: string, effortValue: number): WorkUnitInvestment => ({
    work_unit_id: id,
    work_unit_name: `Work unit ${id}`,
    work_unit_type: "pr",
    time_range: { start: "2026-02-01T00:00:00Z", end: "2026-03-01T00:00:00Z" },
    effort: { metric: "active_hours", value: effortValue },
    investment: { themes: {}, subcategories: { "feature.build": 1 } },
    evidence_quality: { value: 0.7, band: "moderate" },
    evidence: { textual: [], structural: [], contextual: [] },
});

function makeData(overrides: Partial<UseInvestmentDataResult> = {}): UseInvestmentDataResult {
    return {
        categorizationMode: "text_metadata",
        setCategorizationMode: vi.fn(),
        workUnits: [],
        isLoading: false,
        investmentMix: null,
        isMixLoading: false,
        mixExplanation: { data: null, filtersKey: "", focus: { theme: null, subcategory: null } },
        focusTheme: null,
        setFocusTheme: vi.fn(),
        focusSubcategory: null,
        setFocusSubcategory: vi.fn(),
        explanation: null,
        isExplaining: false,
        isExplainingMix: false,
        regenerateMixExplanation: vi.fn(),
        selectedCategory: null,
        setSelectedCategory: vi.fn(),
        focusedTeam: null,
        setFocusedTeam: vi.fn(),
        teamCategoryFlow: null,
        baselineSankeyFlow: null,
        isCategoryFlowLoading: false,
        repoTeamFlow: null,
        isRepoTeamLoading: false,
        repoTeamFlowFailed: false,
        filters: baseFilters,
        selectedThemeKey: null,
        showSubcategories: false,
        selectedUnit: null,
        selectedUnitTypeLabel: "",
        selectedId: null,
        mixExplainKey: "",
        handleSelect: vi.fn(),
        ...overrides,
    } as UseInvestmentDataResult;
}

const reworkMetric: MetricDelta = {
    metric: "rework_ratio",
    label: "Rework Ratio",
    value: 96,
    unit: "%",
    delta_pct: 4,
    spark: [
        { ts: "2026-02-01", value: 90 },
        { ts: "2026-02-08", value: 92 },
        { ts: "2026-02-15", value: 96 },
    ],
};

describe("InvestmentView — rework tab", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
    });

    it("renders the real rework_ratio MetricCard when a metric is provided", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(
            <InvestmentView
                filters={baseFilters}
                activeTab="rework"
                reworkMetric={reworkMetric}
            />,
        );

        // Real value + unit rendered (96%), trend present, honest-empty absent.
        expect(screen.getByText("Rework ratio")).toBeInTheDocument();
        expect(screen.getByText(/96%/)).toBeInTheDocument();
        expect(screen.getByText(/\+4%/)).toBeInTheDocument();
        expect(screen.getByTestId("sparkline")).toBeInTheDocument();
        expect(screen.queryByText(/Rework view not available yet/i)).not.toBeInTheDocument();
    });

    it("links the MetricCard into Explore for the rework_ratio metric", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(
            <InvestmentView
                filters={baseFilters}
                activeTab="rework"
                reworkMetric={reworkMetric}
            />,
        );
        const link = screen.getByRole("link", { name: /rework ratio/i });
        expect(link).toHaveAttribute("href", expect.stringContaining("/explore"));
        expect(link).toHaveAttribute("href", expect.stringContaining("metric=rework_ratio"));
    });

    it("renders the honest empty state when no rework metric is available", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(<InvestmentView filters={baseFilters} activeTab="rework" />);

        expect(screen.getByText(/Rework view not available yet/i)).toBeInTheDocument();
        expect(
            screen.getByText(/A dedicated rework breakdown isn't wired for this scope yet/i),
        ).toBeInTheDocument();
        // No fabricated metric value.
        expect(screen.queryByText("Rework ratio")).not.toBeInTheDocument();
    });
});

describe("InvestmentView — unit-investment tab (self-contained)", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
    });

    it("lists ALL work units on direct entry with no focused subcategory", () => {
        useInvestmentDataMock.mockReturnValue(
            makeData({
                focusSubcategory: null,
                workUnits: [makeUnit("a", 10), makeUnit("b", 20), makeUnit("c", 5)],
            }),
        );

        render(<InvestmentView filters={baseFilters} activeTab="unit-investment" />);

        // All three units render as selectable cards (role=button) — NOT the
        // drill prompt. (The labels also appear in the evidence dropdown's
        // <option>s, so scope to the clickable cards via role=button.)
        expect(screen.getByRole("button", { name: /Work unit a/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Work unit b/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Work unit c/ })).toBeInTheDocument();
        expect(
            screen.queryByText(/Drill down into a theme and choose a subcategory/i),
        ).not.toBeInTheDocument();
    });

    it("shows an honest empty (not the drill prompt) when there are no units at all", () => {
        useInvestmentDataMock.mockReturnValue(
            makeData({ focusSubcategory: null, workUnits: [] }),
        );

        render(<InvestmentView filters={baseFilters} activeTab="unit-investment" />);

        expect(
            screen.getByText(/No work units available for the selected window/i),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Drill down into a theme and choose a subcategory/i),
        ).not.toBeInTheDocument();
    });
});

/**
 * InvestmentView direct-tab-entry tests (CHAOS-2154 IA redesign).
 *
 * Covers the two redesigned tabs that carry the absorbed bugs:
 *   1. Confidence renders the REAL rework_ratio MetricCard when a metric is
 *      provided, an honest empty state when it is not, and the evidence-quality
 *      band encoding (the bands now drive a real visual, not an orphaned
 *      legend).
 *   2. Evidence is a table-first drilldown: work units group by their persisted
 *      theme, and expanding a unit surfaces its metadata inline (the retired
 *      "Metadata only" toggle is subsumed here).
 *
 * `useInvestmentData` (which fetches + reads next/navigation + urql) is mocked
 * so these tests exercise the view's tab branching, not the data layer.
 * SparklineChart is mocked so ECharts never runs in jsdom.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { render, screen, cleanup } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta, WorkUnitInvestment } from "@/lib/types";
import type { UseInvestmentDataResult } from "./useInvestmentData";

const { askDevTriggerMock, useInvestmentDataMock, workUnitAttributionRef } = vi.hoisted(() => ({
    askDevTriggerMock: vi.fn(),
    useInvestmentDataMock: vi.fn(),
    // Holds the workUnitTeamAttributions rows the urql mock should return for the
    // attribution query (CHAOS-2608). Tests set `.rows`; default empty.
    workUnitAttributionRef: { rows: [] as unknown[] },
}));

vi.mock("@/components/ask-dev/AskDevTrigger", () => ({
    AskDevTrigger: ({ context }: { context: unknown }) => {
        askDevTriggerMock(context);
        return <button type="button">Ask Dev about this</button>;
    },
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
    useQuery: (args: { query?: string }) => {
        // Return attribution rows ONLY for the work-unit attribution query so the
        // evidence-tab badge can render; every other query stays undefined.
        if (typeof args?.query === "string" && args.query.includes("WorkUnitTeamAttributions")) {
            return [
                {
                    data: { workUnitTeamAttributions: workUnitAttributionRef.rows },
                    fetching: false,
                    error: undefined,
                },
                vi.fn(),
            ];
        }
        return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
    },
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

const makeUnit = (
    id: string,
    effortValue: number,
    overrides: Partial<WorkUnitInvestment> = {},
): WorkUnitInvestment => ({
    work_unit_id: id,
    work_unit_name: `Work unit ${id}`,
    work_unit_type: "pr",
    time_range: { start: "2026-02-01T00:00:00Z", end: "2026-03-01T00:00:00Z" },
    effort: { metric: "active_hours", value: effortValue },
    investment: {
        themes: { feature_delivery: 1 },
        subcategories: { "feature.build": 1 },
    },
    evidence_quality: { value: 0.7, band: "moderate" },
    evidence: { textual: [], structural: [], contextual: [] },
    ...overrides,
});

function makeData(overrides: Partial<UseInvestmentDataResult> = {}): UseInvestmentDataResult {
    return {
        workUnits: [],
        isLoading: false,
        investmentMix: null,
        isMixLoading: false,
        mixExplanation: {
            data: null,
            filtersKey: "",
            focus: { theme: null, subcategory: null },
        },
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
    metric: "pr_rework_ratio",
    label: "PR Rework Ratio",
    value: 96,
    unit: "%",
    delta_pct: 4,
    spark: [
        { ts: "2026-02-01", value: 90 },
        { ts: "2026-02-08", value: 92 },
        { ts: "2026-02-15", value: 96 },
    ],
};

describe("InvestmentView — Confidence tab", () => {
    afterEach(() => {
        cleanup();
        askDevTriggerMock.mockReset();
        useInvestmentDataMock.mockReset();
    });

    it("renders the real pr_rework_ratio MetricCard when a metric is provided", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(
            <InvestmentView
                filters={baseFilters}
                activeTab="confidence"
                reworkMetric={reworkMetric}
            />,
        );

        expect(screen.getByText("PR Rework Ratio")).toBeInTheDocument();
        expect(screen.getByText(/96%/)).toBeInTheDocument();
        expect(screen.getByText(/\+4%/)).toBeInTheDocument();
        expect(screen.getByTestId("sparkline")).toBeInTheDocument();
        expect(screen.queryByText(/Rework signal not available yet/i)).not.toBeInTheDocument();
    });

    it("links the rework MetricCard into Explore for the pr_rework_ratio metric", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(
            <InvestmentView
                filters={baseFilters}
                activeTab="confidence"
                reworkMetric={reworkMetric}
            />,
        );
        const link = screen.getByRole("link", { name: /pr rework ratio/i });
        expect(link).toHaveAttribute("href", expect.stringContaining("/explore"));
        expect(link).toHaveAttribute("href", expect.stringContaining("metric=pr_rework_ratio"));
    });

    it("renders the honest empty state when no rework metric is available", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(<InvestmentView filters={baseFilters} activeTab="confidence" />);

        expect(screen.getByText(/Rework signal not available yet/i)).toBeInTheDocument();
        expect(screen.queryByText("PR Rework Ratio")).not.toBeInTheDocument();
    });

    // Contract: allocation_pct from ops is already in 0-100 range; NO ×100 multiplication.
    // A backend value of 25 must render as "25%" label and a 25%-width bar.
    it("renders rework theme allocation with allocation_pct already in 0-100 range (no double-scaling)", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        const { container } = render(
            <InvestmentView
                filters={baseFilters}
                activeTab="confidence"
                reworkThemeAllocation={[
                    {
                        theme: "maintenance",
                        label: "Maintenance / Tech Debt",
                        allocation: 75,
                        allocation_pct: 25,
                        prs_merged: 75,
                        churn_loc: 28000,
                    },
                ]}
            />,
        );

        // Label shows "25%", not "2500%"
        expect(screen.getByText("25%")).toBeInTheDocument();
        // Theme label is rendered
        expect(screen.getByText("Maintenance / Tech Debt")).toBeInTheDocument();
        // Bar div has width: 25%, not width: 2500%
        const bar = container.querySelector('[style*="width: 25%"]');
        expect(bar).not.toBeNull();
    });

    it("hides the rework theme breakdown section when allocation is empty", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        const { container } = render(
            <InvestmentView
                filters={baseFilters}
                activeTab="confidence"
                reworkThemeAllocation={[]}
            />,
        );

        expect(screen.queryByText(/Rework by theme/i)).not.toBeInTheDocument();
        expect(container.querySelector('[style*="width:"]')).toBeNull();
    });

    it("renders the evidence-quality band encoding from the persisted distribution", () => {
        useInvestmentDataMock.mockReturnValue(
            makeData({
                investmentMix: {
                    theme_distribution: { feature_delivery: 1 },
                    subcategory_distribution: { "feature.build": 1 },
                    evidence_quality_distribution: {
                        high: 0.5,
                        moderate: 0.3,
                        very_low: 0.1,
                        unknown: 0.1,
                    },
                },
            }),
        );
        render(<InvestmentView filters={baseFilters} activeTab="confidence" />);

        expect(
            screen.getByRole("heading", { name: /evidence quality bands/i }),
        ).toBeInTheDocument();
        // The band swatches reflect the persisted distribution.
        expect(screen.getByText(/High \(0\.80-1\.00\)/)).toBeInTheDocument();
        expect(screen.getByText(/Very low/)).toBeInTheDocument();
    });

    it("band bar reflects aggregate distribution even when workUnits is partial/capped", () => {
        // investmentMix carries the full distribution; workUnits is a capped subset.
        useInvestmentDataMock.mockReturnValue(
            makeData({
                investmentMix: {
                    theme_distribution: { feature_delivery: 1 },
                    subcategory_distribution: { "feature.build": 1 },
                    // Aggregate shows 80% high quality…
                    evidence_quality_distribution: { high: 0.8, moderate: 0.2 },
                },
                // …even though workUnits only has one 'moderate' unit (simulating a capped fetch).
                workUnits: [
                    makeUnit("a", 10, {
                        evidence_quality: { value: 0.7, band: "moderate" },
                    }),
                ],
            }),
        );
        render(<InvestmentView filters={baseFilters} activeTab="confidence" />);

        // Distribution correctly shows 80% high, driven by the aggregate — not the single capped unit.
        expect(screen.getByText(/High \(0\.80-1\.00\)/)).toBeInTheDocument();
    });

    it("shows the unavailable DataState for evidence quality bands when distribution is absent", () => {
        useInvestmentDataMock.mockReturnValue(makeData({ investmentMix: null }));
        render(<InvestmentView filters={baseFilters} activeTab="confidence" />);

        expect(
            screen.getByRole("heading", { name: /evidence quality bands/i }),
        ).toBeInTheDocument();
        expect(screen.getByText(/quality distribution unavailable/i)).toBeInTheDocument();
    });

    it("lists low-confidence work units pulled from low/unknown bands", () => {
        useInvestmentDataMock.mockReturnValue(
            makeData({
                workUnits: [
                    makeUnit("low", 5, {
                        evidence_quality: { value: 0.3, band: "very_low" },
                    }),
                ],
            }),
        );
        render(<InvestmentView filters={baseFilters} activeTab="confidence" />);

        expect(screen.getByRole("heading", { name: /low-confidence areas/i })).toBeInTheDocument();
        expect(screen.getByText("Work unit low")).toBeInTheDocument();
    });
});

describe("InvestmentView — Evidence tab (table-first drilldown)", () => {
    afterEach(() => {
        cleanup();
        askDevTriggerMock.mockReset();
        useInvestmentDataMock.mockReset();
    });

    it("groups work units by their persisted theme on direct entry", () => {
        useInvestmentDataMock.mockReturnValue(
            makeData({
                workUnits: [makeUnit("a", 10), makeUnit("b", 20)],
            }),
        );

        render(<InvestmentView filters={baseFilters} activeTab="evidence" />);

        // Grouped by theme → the canonical theme label appears as a group row,
        // not a per-unit card grid.
        expect(screen.getByRole("button", { name: /Feature Delivery/ })).toBeInTheDocument();
    });

    it("surfaces unit metadata inline when a row is expanded (no toggle gate)", () => {
        useInvestmentDataMock.mockReturnValue(
            makeData({
                workUnits: [
                    makeUnit("a", 10, {
                        evidence: {
                            textual: [{ quote: "fixes the login bug" }],
                            structural: [{ repo: "org/app", file: "auth.ts" }],
                            contextual: [],
                        },
                    }),
                ],
            }),
        );

        render(<InvestmentView filters={baseFilters} activeTab="evidence" />);

        // Expand the theme group, then the work-unit row.
        fireEvent.click(screen.getByRole("button", { name: /Feature Delivery/ }));
        fireEvent.click(screen.getByRole("button", { name: /Work unit a/ }));

        expect(screen.getByText("Classification rationale")).toBeInTheDocument();
        expect(screen.getByText("Linked metadata")).toBeInTheDocument();
        // Metadata field rendered (structural repo association).
        expect(screen.getByText(/org\/app/)).toBeInTheDocument();
    });

    it("shows an honest empty state when there are no work units", () => {
        useInvestmentDataMock.mockReturnValue(makeData({ workUnits: [] }));

        render(<InvestmentView filters={baseFilters} activeTab="evidence" />);

        expect(
            screen.getByText(/No work units available for the selected window/i),
        ).toBeInTheDocument();
    });

    it("offers typed Ask Dev context for the selected canonical work-unit ID", () => {
        const selectedUnit = makeUnit("wu-7d3f", 10, {
            work_unit_name: "Rendered page title must not be sent",
        });
        useInvestmentDataMock.mockReturnValue(
            makeData({ workUnits: [selectedUnit], selectedUnit }),
        );

        render(<InvestmentView filters={baseFilters} activeTab="evidence" />);

        expect(askDevTriggerMock).toHaveBeenCalledWith({
            routeId: "work_unit_detail",
            entityRefs: [
                {
                    entity_type: "work_unit",
                    entity_id: "wu-7d3f",
                    display_label: "Selected work unit",
                },
            ],
            suggestedQuestionIds: ["delivery_status", "remaining_work", "data_trust"],
        });
        expect(JSON.stringify(askDevTriggerMock.mock.calls)).not.toContain(
            "Rendered page title must not be sent",
        );
    });
});

describe("InvestmentView — Evidence tab team-attribution badge (CHAOS-2608)", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
        workUnitAttributionRef.rows = [];
    });

    it("renders the owning-team badge for a unit keyed by work_unit_id", () => {
        useInvestmentDataMock.mockReturnValue(makeData({ workUnits: [makeUnit("wu-7d3f", 10)] }));
        // Attribution keyed by the SAME work_unit_id the unit carries.
        workUnitAttributionRef.rows = [
            {
                workUnitId: "wu-7d3f",
                teamId: "team-platform",
                teamName: "Platform",
                source: "NATIVE_TEAM",
                confidence: "HIGH",
                isPrimary: true,
                memberCount: 3,
                evidence: "3 member work item(s) attributed to Platform via native_team",
            },
        ];

        render(<InvestmentView filters={baseFilters} activeTab="evidence" />);
        // Expand the theme group so the unit row (and its badge) renders.
        fireEvent.click(screen.getByRole("button", { name: /Feature Delivery/ }));

        const badge = screen.getByTestId("team-attribution-badge");
        expect(badge).toHaveTextContent(/native team/i);
        expect(badge.getAttribute("title")).toMatch(/Platform/);
    });

    it("renders NO badge when attribution is keyed by work_item_id (pins the CS7 bug)", () => {
        useInvestmentDataMock.mockReturnValue(makeData({ workUnits: [makeUnit("wu-7d3f", 10)] }));
        // The original bug: attribution keyed by a provider work_item_id — a
        // DISJOINT id space from the unit's work_unit_id — so the lookup misses
        // and the badge silently never renders. This test fails if the view ever
        // reverts to keying the map by work_item_id.
        workUnitAttributionRef.rows = [
            {
                workUnitId: "linear:CHAOS-1053",
                teamId: "team-platform",
                teamName: "Platform",
                source: "NATIVE_TEAM",
                confidence: "HIGH",
                isPrimary: true,
                memberCount: 3,
                evidence: "irrelevant",
            },
        ];

        render(<InvestmentView filters={baseFilters} activeTab="evidence" />);
        fireEvent.click(screen.getByRole("button", { name: /Feature Delivery/ }));

        expect(screen.queryByTestId("team-attribution-badge")).not.toBeInTheDocument();
    });
});

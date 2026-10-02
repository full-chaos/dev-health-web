/**
 * Pins the Investment OVERVIEW today (before the page pass): the guidance text word for word,
 * the LLM panel's three states + Regenerate, and what the mix section mounts. Green on the
 * unchanged code; the page pass must keep every assertion true (the text may move, never change).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, cleanup } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta, WorkUnitInvestment } from "@/lib/types";
import type { UseInvestmentDataResult } from "./useInvestmentData";

const { useInvestmentDataMock, workUnitAttributionRef } = vi.hoisted(() => ({
    useInvestmentDataMock: vi.fn(),
    // Holds the workUnitTeamAttributions rows the urql mock should return for the
    // attribution query (CHAOS-2608). Tests set `.rows`; default empty.
    workUnitAttributionRef: { rows: [] as unknown[] },
}));

vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return {
        ...actual,
        useChartTokens: () => actual.fallbackTokens,
        useChartTheme: () => ({
            text: "#111827",
            grid: "#e5e7eb",
            muted: "#6b7280",
            background: "#ffffff",
            stroke: "#d1d5db",
            accent1: "#2563eb",
            accent2: "#7c3aed",
            accent3: "#ef4444",
        }),
        useChartColors: () => ["#2563eb", "#14b8a6", "#f97316", "#a855f7", "#ec4899"],
    };
});
vi.mock("@/components/charts/TreemapChart", () => ({
    TreemapChart: () => <div data-testid="treemap-chart" />,
}));
vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: () => <div data-testid="sankey-chart" />,
}));
vi.mock("@/components/charts/InvestmentMixSunburst", () => ({
    InvestmentMixSunburst: () => <div data-testid="sunburst-chart" />,
}));
vi.mock("@/lib/graphql/hooks/useChordFlow", () => ({
    useChordFlow: () => ({ data: null, fetching: false, error: undefined }),
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
    why: { work_category: [] },
    how: {},
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

const GUIDANCE_TEXT = [
    "What this investment view represents",
    "These views show investment intent inferred from connected work activity across issues, pull requests, commits, and files.",
    "Investment reflects how work appears to be aimed, based on text-first intent plus structural and contextual corroboration. It is not a label, a verdict, or an assessment of people.",
    "Because real work is messy, investment views are shown with evidence quality and uncertainty rather than as fixed categories.",
    "Investment describes effort allocation, not individual performance.",
    "Categories are probabilistic, not exclusive. Work can span multiple categories at once.",
    "Evidence quality reflects corroboration strength, not correctness.",
    "Low evidence quality indicates mixed or incomplete evidence, not bad data.",
    "These views do not assign intent, measure productivity, or evaluate individuals.",
    "How to read the visuals",
    "Size represents effort associated with a theme or subcategory.",
    "Color indicates which theme or subcategory the work leans toward.",
    "Opacity represents evidence quality for the interpretation.",
    "Flows show how effort appears to move from teams into themes and repos.",
    "Use the investment mix chart to drill from themes into subcategories and evidence.",
];

const mix = {
    theme_distribution: { feature_delivery: 60, quality: 40 },
    subcategory_distribution: { "feature_delivery.roadmap": 60, "quality.bugfix": 40 },
    evidence_quality_distribution: { high: 1 },
    unit: "delivery_units",
};

const explained = (over: Record<string, unknown> = {}) => ({
    data: {
        summary: "Effort appears to lean toward feature delivery.",
        top_findings: [
            {
                finding: "Feature delivery leads the mix.",
                evidence: {
                    theme: "feature_delivery",
                    share_pct: 60,
                    evidence_quality_band: "high",
                },
            },
        ],
        confidence: { level: "low", quality_mean: 0.45, quality_stddev: 0.22, drivers: [] },
        what_to_check_next: [
            { action: "Check roadmap work", why: "largest share", where: "Evidence tab" },
        ],
        anti_claims: ["It does not say who did the work."],
        status: "valid",
        ...over,
    },
    filtersKey: "k",
    focus: { theme: null, subcategory: null },
});

const overview = (data = makeData()) => {
    useInvestmentDataMock.mockReturnValue(data);
    return render(<InvestmentView filters={baseFilters} activeTab="overview" />);
};

describe("InvestmentView overview today", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
    });

    it("carries every guidance sentence, word for word", () => {
        const { container } = overview();
        const text = container.textContent ?? "";
        for (const sentence of GUIDANCE_TEXT) {
            expect(text).toContain(sentence);
        }
    });

    it("mounts the mix section (the column treemap by default) with the theme mix", () => {
        overview(makeData({ investmentMix: mix as never, workUnits: [makeUnit("a", 5)] }));
        expect(screen.getByTestId("column-treemap")).toBeInTheDocument();
        // The ECharts treemap is not used for this card any more.
        expect(screen.queryByTestId("treemap-chart")).toBeNull();
    });

    it("LLM panel: title, Focused line, Regenerate calls the handler", () => {
        const regenerate = vi.fn();
        overview(
            makeData({
                mixExplanation: explained() as never,
                mixExplainKey: "k",
                regenerateMixExplanation: regenerate,
            }),
        );
        expect(screen.getByText("What this investment mix indicates")).toBeInTheDocument();
        expect(screen.getByText("Focused: All themes")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /regenerate explanation/i }));
        expect(regenerate).toHaveBeenCalledTimes(1);
    });

    it("LLM panel with an explanation: summary, findings, confidence + mean, what to check next, anti-claims", () => {
        overview(makeData({ mixExplanation: explained() as never, mixExplainKey: "k" }));
        expect(
            screen.getByText("Effort appears to lean toward feature delivery."),
        ).toBeInTheDocument();
        expect(screen.getByText("Findings")).toBeInTheDocument();
        expect(screen.getByText("Feature delivery leads the mix.")).toBeInTheDocument();
        expect(screen.getAllByText("low").length).toBeGreaterThan(0);
        expect(screen.getByText(/Mean:\s*45%/)).toBeInTheDocument();
        expect(screen.getByText("What to check next")).toBeInTheDocument();
        expect(screen.getByText("What this does NOT say")).toBeInTheDocument();
    });

    it("LLM panel state: unavailable provider", () => {
        overview(
            makeData({
                mixExplanation: explained({ status: "llm_unavailable" }) as never,
                mixExplainKey: "k",
            }),
        );
        expect(screen.getByText(/Connect an LLM provider in settings/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /regenerate explanation/i })).toBeNull();
    });

    it("LLM panel state: generating, and unavailable for this window", () => {
        overview(makeData({ mixExplainKey: "new-key" }));
        expect(screen.getByText("Generating investment explanation...")).toBeInTheDocument();
        cleanup();
        overview(
            makeData({
                mixExplanation: {
                    data: null,
                    filtersKey: "k",
                    focus: { theme: null, subcategory: null },
                } as never,
                mixExplainKey: "k",
            }),
        );
        expect(screen.getByText("Explanation unavailable for this window.")).toBeInTheDocument();
    });
});

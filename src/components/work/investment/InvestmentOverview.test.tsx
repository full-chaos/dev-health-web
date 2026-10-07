/** Overview page pass (CHAOS-7614): context card, classification table, cross-tab links. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, cleanup, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import type { WorkUnitInvestment } from "@/lib/types";
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

import type { SankeyResponse } from "@/lib/types";

const mix = {
    theme_distribution: { quality: 10, feature_delivery: 30 },
    subcategory_distribution: {},
    evidence_quality_distribution: {},
    unit: "delivery_units",
};
const explained = (level = "low", status = "valid") => ({
    data: {
        summary: "Effort appears to lean toward feature delivery.",
        top_findings: [],
        confidence: { level, quality_mean: 0.48, quality_stddev: 0.14, drivers: [] },
        what_to_check_next: [],
        anti_claims: [],
        status,
    },
    filtersKey: "k",
    focus: { theme: null, subcategory: null },
});
const flow = (coverage: SankeyResponse["coverage"]): SankeyResponse =>
    ({
        mode: "investment",
        nodes: [
            { name: "Alpha", group: "team" },
            { name: "Risk", group: "category" },
            { name: "repo-a", group: "repo" },
        ],
        links: [
            { source: "Alpha", target: "Risk", value: 10 },
            { source: "Risk", target: "repo-a", value: 10 },
        ],
        coverage,
    }) as SankeyResponse;

const overview = (over: Partial<UseInvestmentDataResult> = {}) => {
    useInvestmentDataMock.mockReturnValue(makeData(over));
    return render(<InvestmentView filters={baseFilters} activeTab="overview" />);
};

describe("overview: context card", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
    });

    it("holds the evidence-quality line, the coverage facts and the AI block in one card; the AI block is collapsed", () => {
        overview({ mixExplanation: explained() as never, mixExplainKey: "k" });
        const card = screen.getByTestId("read-with-context");
        expect(card).toHaveTextContent("Read this with context");
        expect(card).toHaveTextContent("Evidence quality");
        // Collapsed by default: only the ghost toggle shows (the prototype card has no AI block).
        const toggle = within(card).getByRole("button", { name: "Show AI explanation" });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(toggle.className).toContain("border-transparent");
        expect(card).not.toHaveTextContent("What this investment mix indicates");
        expect(screen.queryByTestId("ai-generated-label")).toBeNull();

        fireEvent.click(toggle);
        expect(within(card).getByRole("button", { name: "Hide AI explanation" })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        expect(card).toHaveTextContent("What this investment mix indicates");
        expect(screen.getByTestId("ai-generated-label")).toHaveTextContent("AI-generated");
        // Regenerate is a ghost button inside the opened block.
        const regenerate = within(card).getByRole("button", { name: "Regenerate" });
        expect(regenerate.className).toContain("border-transparent");
    });

    it("quality line: level, caveat pill for low, mean in the Confidence tab's own format", () => {
        overview({ mixExplanation: explained("low") as never, mixExplainKey: "k" });
        const q = screen.getByTestId("context-quality");
        expect(q).toHaveTextContent("low");
        expect(q).toHaveTextContent("Confidence caveat");
        expect(q).toHaveTextContent("Mean evidence quality: 48% ± 14%");
    });

    it("no caveat pill for a moderate level", () => {
        overview({ mixExplanation: explained("moderate") as never, mixExplainKey: "k" });
        expect(screen.getByTestId("context-quality")).not.toHaveTextContent("Confidence caveat");
    });

    it("without an explanation (none, provider unavailable, or another window) the line says unavailable", () => {
        overview();
        expect(screen.getByTestId("context-quality")).toHaveTextContent("unavailable");
        cleanup();
        overview({
            mixExplanation: explained("low", "llm_unavailable") as never,
            mixExplainKey: "k",
        });
        expect(screen.getByTestId("context-quality")).toHaveTextContent("unavailable");
        cleanup();
        overview({ mixExplanation: explained("low") as never, mixExplainKey: "other" });
        expect(screen.getByTestId("context-quality")).toHaveTextContent("unavailable");
    });

    it("coverage facts: produced numbers show, a produced 0 shows 0%, a missing leaf is unavailable (never 0%)", () => {
        overview({ teamCategoryFlow: flow({ team: 0.68, repo: 0 } as never) });
        expect(screen.getByTestId("context-team-coverage")).toHaveTextContent("68%");
        expect(screen.getByTestId("context-repo-coverage")).toHaveTextContent("0%");
        cleanup();
        overview({ teamCategoryFlow: flow({ team: null, repo: 0.5 } as never) });
        expect(screen.getByTestId("context-team-coverage")).toHaveTextContent("unavailable");
        expect(screen.getByTestId("context-team-coverage")).not.toHaveTextContent("0%");
        cleanup();
        overview({ teamCategoryFlow: null, repoTeamFlow: null });
        expect(screen.getByTestId("context-team-coverage")).toHaveTextContent("unavailable");
        expect(screen.getByTestId("context-unassigned")).toHaveTextContent("unavailable");
    });

    it("Inspect confidence opens the Confidence tab and keeps the page's filters", () => {
        overview();
        const link = screen.getByRole("link", { name: "Inspect confidence" });
        expect(link.getAttribute("href")).toContain("/investment?tab=confidence&f=");
    });
});

describe("overview: classification table", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
    });

    it("lists the persisted mix in mix order with its share and value; work units play no part", () => {
        overview({
            investmentMix: mix as never,
            workUnits: [
                makeUnit("a", 999, { investment: { themes: { risk: 1 }, subcategories: {} } }),
            ],
        });
        const rows = screen.getAllByTestId("classification-row");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("Feature Delivery");
        expect(rows[0]).toHaveTextContent("75%");
        expect(rows[0]).toHaveTextContent("30");
        expect(rows[1]).toHaveTextContent("Quality");
        expect(rows[1]).toHaveTextContent("25%");
        expect(screen.getByTestId("classification-table")).toHaveTextContent("Delivery units");
        expect(screen.getByTestId("classification-table")).not.toHaveTextContent("Risk");
    });

    it("the theme name is a button that focuses the theme, a second press clears it", () => {
        const setFocusTheme = vi.fn();
        overview({ investmentMix: mix as never, setFocusTheme });
        fireEvent.click(screen.getByRole("button", { name: "Quality" }));
        expect(setFocusTheme).toHaveBeenCalledWith("quality");
        cleanup();
        overview({ investmentMix: mix as never, setFocusTheme, focusTheme: "quality" });
        fireEvent.click(screen.getByRole("button", { name: "Quality" }));
        expect(setFocusTheme).toHaveBeenLastCalledWith(null);
    });

    it("heads the value column 'Delivery units' and ends each row with an Evidence action (CHAOS-8564)", () => {
        overview({ investmentMix: mix as never });
        const table = screen.getByTestId("classification-table");
        expect(within(table).getByRole("columnheader", { name: "Delivery units" })).toBeTruthy();
        expect(within(table).getAllByTestId("classification-evidence")).toHaveLength(2);
    });

    it("a row's Evidence action opens the shared drawer with that theme's served effort and share", async () => {
        overview({ investmentMix: mix as never });
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Quality" }));
        const facts = await screen.findByTestId("classification-evidence-facts");
        expect(facts).toHaveTextContent("Quality");
        expect(facts).toHaveTextContent("10 delivery units");
        expect(facts).toHaveTextContent("25%");
    });

    it("the drawer shows the served average evidence quality and links to the Work Graph for the theme", async () => {
        overview({
            investmentMix: { ...mix, evidence_quality_distribution: { quality: 0.62 } } as never,
        });
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Quality" }));
        const facts = await screen.findByTestId("classification-evidence-facts");
        expect(facts).toHaveTextContent(/Average evidence quality\s*0\.62/);
        const link = within(screen.getByRole("dialog")).getByRole("link", {
            name: "Open Work Graph",
        });
        const href = link.getAttribute("href") ?? "";
        expect(href).toContain("/diagnose/work-graph");
        expect(new URL(href, "https://app.example").searchParams.get("graph_theme")).toBe(
            "quality",
        );
    });

    it("the drawer falls back to the page effort unit when the mix serves none (as the treemap drawer does) and prints no quality when none is served", async () => {
        overview({
            investmentMix: {
                theme_distribution: { quality: 10 },
                subcategory_distribution: {},
                evidence_quality_distribution: {},
            } as never,
        });
        fireEvent.click(screen.getByRole("button", { name: "Evidence: Quality" }));
        const facts = await screen.findByTestId("classification-evidence-facts");
        expect(facts).not.toHaveTextContent("delivery units");
        expect(facts).toHaveTextContent("Effort10 effortShare of the mix");
        expect(facts).toHaveTextContent("100%");
        expect(facts).not.toHaveTextContent("Average evidence quality");
    });

    it("renders no table when the mix is empty or absent", () => {
        overview({ investmentMix: null });
        expect(screen.queryByTestId("classification-table")).toBeNull();
        cleanup();
        overview({ investmentMix: { ...mix, theme_distribution: {} } as never });
        expect(screen.queryByTestId("classification-table")).toBeNull();
    });

    it("Open evidence opens the Evidence tab and keeps the page's filters", () => {
        overview({ investmentMix: mix as never });
        const links = screen.getAllByRole("link", { name: "Open evidence" });
        expect(
            links.some((l) =>
                (l.getAttribute("href") ?? "").includes("/investment?tab=evidence&f="),
            ),
        ).toBe(true);
    });
});

describe("confidence tab", () => {
    afterEach(() => {
        cleanup();
        useInvestmentDataMock.mockReset();
    });

    it("links to the Evidence tab from the Low-confidence areas head ('Evidence drilldown')", () => {
        useInvestmentDataMock.mockReturnValue(makeData());
        render(<InvestmentView filters={baseFilters} activeTab="confidence" />);
        const section = screen.getByTestId("low-confidence-areas");
        const link = within(section).getByRole("link", { name: "Evidence drilldown" });
        expect(link.getAttribute("href")).toContain("/investment?tab=evidence&f=");
        // One link to the Evidence tab on this tab: the legacy "Open evidence" link is gone.
        expect(screen.queryByRole("link", { name: "Open evidence" })).toBeNull();
    });
});

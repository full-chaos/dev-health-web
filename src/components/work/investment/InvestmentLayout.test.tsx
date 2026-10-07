/**
 * Investment tab layouts (CHAOS-8067): the approved prototype views 5 to 10.
 *
 * Checks the LAYOUT of each tab (section cards, tiles, segments, the column treemap, the shared
 * evidence drawer) and that every value on it is the value the data hook served.
 * `useInvestmentData` is mocked, as in `InvestmentViewTabs.test.tsx`; the charts that need a
 * canvas are mocked. The evidence drawer is the real shared provider.
 */
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, cleanup, userEvent, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";
import { formatQuality } from "@/lib/investment";
import type { MetricDelta, SankeyResponse, WorkUnitInvestment } from "@/lib/types";
import type { UseInvestmentDataResult } from "./useInvestmentData";

const { useInvestmentDataMock } = vi.hoisted(() => ({ useInvestmentDataMock: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/investment",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
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
vi.mock("@/components/charts/SankeyChart", () => ({
    SankeyChart: () => <div data-testid="sankey-chart" />,
}));
vi.mock("@/components/charts/InvestmentMixSunburst", () => ({
    InvestmentMixSunburst: () => <div data-testid="sunburst-chart" />,
}));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/lib/graphql/hooks/useChordFlow", () => ({
    useChordFlow: () => ({ data: null, fetching: false, error: undefined }),
}));
vi.mock("./useInvestmentData", () => ({
    useInvestmentData: (args: unknown) => useInvestmentDataMock(args),
}));
vi.mock("@/lib/graphql/provider", () => ({
    useOrgId: () => undefined,
    useSsr: () => null,
}));
vi.mock("urql", () => ({
    useQuery: (args: { query?: string }) => [
        args.query?.includes("query InvestmentEvidenceQuality")
            ? {
                  data: {
                      analytics: {
                          evidenceQualityByGroup: [
                              {
                                  key: "feature_delivery",
                                  label: "feature_delivery",
                                  mean: 0.82,
                                  total: 12,
                              },
                              { key: "quality", label: "quality", mean: null, total: 3 },
                              { key: "pr", label: "pr", mean: 0.5, total: 15 },
                          ],
                      },
                  },
                  fetching: false,
                  error: undefined,
              }
            : { data: undefined, fetching: false, error: undefined },
        vi.fn(),
    ],
}));

import { InvestmentView } from "../InvestmentView";

const baseFilters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 90, compare_days: 90 },
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
        subcategories: { "feature_delivery.roadmap": 1 },
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

const mix = {
    theme_distribution: { feature_delivery: 60, quality: 40 },
    subcategory_distribution: {
        "feature_delivery.roadmap": 45,
        "feature_delivery.enablement": 15,
        "quality.bugfix": 40,
    },
    evidence_quality_distribution: { "feature_delivery.roadmap": 0.42, quality: 0.8 },
    unit: "delivery_units",
};

const flow = (coverage?: { team?: number; repo?: number }): SankeyResponse =>
    ({ mode: "team_category", nodes: [], links: [], coverage }) as unknown as SankeyResponse;

const view = (tab: "overview" | "allocation" | "evidence" | "confidence", data = makeData()) => {
    useInvestmentDataMock.mockReturnValue(data);
    return render(<InvestmentView filters={baseFilters} activeTab={tab} activeRole="em" />);
};

const follows = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
    cleanup();
    useInvestmentDataMock.mockReset();
});

describe("Investment Overview (prototype views 5 and 6)", () => {
    const data = () => makeData({ investmentMix: mix as never, workUnits: [makeUnit("a", 5)] });

    it("order: the mix card beside the context card, then the classification, then the reading guidance", () => {
        view("overview", data());
        const mixCard = screen.getByTestId("investment-mix-section");
        const context = screen.getByTestId("read-with-context");
        const classification = screen.getByTestId("classification-section");
        const guidance = screen.getByText("How to read this");
        // The mix and the context card share one grid row.
        expect(mixCard.parentElement).toBe(context.parentElement);
        expect(mixCard.parentElement?.className).toContain("xl:grid-cols-[minmax(0,1fr)_20rem]");
        expect(follows(mixCard, context)).toBe(true);
        expect(follows(context, classification)).toBe(true);
        // Not drawn in the prototype: kept, but after the prototype blocks.
        expect(follows(classification, guidance)).toBe(true);
    });

    it("mix card head: 'Investment mix', the description, and the Treemap | Sunburst segments in the head", () => {
        view("overview", data());
        const card = screen.getByTestId("investment-mix-section");
        const title = within(card).getByRole("heading", { level: 2, name: "Investment mix" });
        expect(within(card).getByText("Themes and the work behind them")).toBeInTheDocument();
        const toggle = within(card).getByRole("radiogroup", { name: "Chart type" });
        expect(
            within(toggle)
                .getAllByRole("radio")
                .map((r) => r.textContent),
        ).toEqual(["Treemap", "Sunburst"]);
        // In the head row (the title's own row), not under the chart.
        expect(title.parentElement?.parentElement?.contains(toggle)).toBe(true);
        // The legacy title and sub-line are gone; the encoding is a data note under the chart.
        expect(screen.queryByRole("heading", { name: "Treemap" })).toBeNull();
        expect(screen.queryByText(/Effort size - Evidence quality opacity/)).toBeNull();
        expect(within(card).getByTestId("data-note")).toHaveTextContent(
            "Size is effort. Opacity is evidence quality. Select a cell for its evidence.",
        );
    });

    it("treemap: theme columns from the persisted mix, widths by the served values, with a legend", () => {
        view("overview", data());
        expect(screen.getByTestId("column-treemap-columns").style.gridTemplateColumns).toBe(
            "minmax(0, 60fr) minmax(0, 40fr)",
        );
        expect(screen.getAllByTestId("column-treemap-head").map((h) => h.textContent)).toEqual([
            "Feature Delivery60%",
            "Quality40%",
        ]);
        expect(
            within(screen.getByTestId("column-treemap-legend"))
                .getAllByRole("listitem")
                .map((li) => li.textContent),
        ).toEqual(["Feature Delivery60%", "Quality40%"]);
    });

    it("a cell opens the ONE shared drawer with the served effort, share and quality, and the Work Graph link", () => {
        view("overview", data());
        expect(screen.queryByRole("dialog")).toBeNull();
        const cell = screen
            .getAllByTestId("column-treemap-cell")
            .find(
                (c) => c.getAttribute("data-node-key") === "subcategory:feature_delivery.roadmap",
            )!;

        fireEvent.click(cell);

        const drawer = within(screen.getByRole("dialog"));
        expect(drawer.getByText("Feature Delivery · Roadmap")).toBeInTheDocument();
        expect(drawer.getAllByTestId("evidence-fact").map((row) => row.textContent)).toEqual([
            "ThemeFeature Delivery",
            "SubcategoryRoadmap",
            "Effort45 delivery units",
            "Share of the mix45%",
            `Average evidence quality${formatQuality(0.42)}`,
        ]);
        const link = drawer.getByTestId("mix-selection-work-graph");
        expect(link).toHaveTextContent("Open Work Graph");
        const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/diagnose/work-graph");
        expect(url.searchParams.get("role")).toBe("em");
        // The selection is marked while the drawer is open.
        expect(cell).toHaveAttribute("aria-pressed", "true");
        // One drawer; the legacy breadcrumb chips row is gone.
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.queryByRole("button", { name: "All themes" })).toBeNull();
    });

    it("a quality the mix does not serve draws no row in the drawer, never a number", () => {
        view("overview", data());
        // Theme "feature_delivery" has no entry in the served quality distribution.
        fireEvent.click(screen.getAllByTestId("column-treemap-head")[0]);
        const rows = within(screen.getByRole("dialog"))
            .getAllByTestId("evidence-fact")
            .map((row) => row.textContent);
        expect(rows).toEqual([
            "ThemeFeature Delivery",
            "Effort60 delivery units",
            "Share of the mix60%",
        ]);
    });

    it("closing the drawer clears the selection", async () => {
        view("overview", data());
        const head = screen.getAllByTestId("column-treemap-head")[1];
        await userEvent.click(head);
        expect(head).toHaveAttribute("aria-pressed", "true");
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(head).toHaveAttribute("aria-pressed", "false");
    });

    it("context card and classification are section cards; their actions are buttons with the prototype text", () => {
        view("overview", data());
        const context = screen.getByTestId("read-with-context");
        expect(context.tagName).toBe("SECTION");
        expect(
            within(context).getByRole("heading", { level: 2, name: "Read this with context" }),
        ).toBeInTheDocument();
        const inspect = within(context).getByRole("link", { name: "Inspect confidence" });
        expect(inspect.getAttribute("href")).toContain("/investment?tab=confidence");
        expect(inspect.className).toContain("bg-(--action)");

        const classification = screen.getByTestId("classification-section");
        expect(
            within(classification).getByRole("heading", {
                level: 2,
                name: "Explore the classification",
            }),
        ).toBeInTheDocument();
        const open = within(classification).getByRole("link", { name: "Open evidence" });
        expect(open.getAttribute("href")).toContain("/investment?tab=evidence");
        expect(open.className).toContain("border-transparent");
    });
});

describe("Investment Allocation (prototype views 7 and 8)", () => {
    it("has no legacy 'Allocation' heading or paragraph: the page subtitle says it", () => {
        view("allocation", makeData({ teamCategoryFlow: flow({ team: 0.68, repo: 0.49 }) }));
        expect(screen.queryByRole("heading", { name: "Allocation" })).toBeNull();
        expect(screen.queryByText(/Each allocation path maps a team or theme/)).toBeNull();
    });

    it("coverage is a strip of three joined tiles with the served readings", () => {
        view("allocation", makeData({ teamCategoryFlow: flow({ team: 0.68, repo: 0.49 }) }));
        const strip = screen.getByTestId("allocation-coverage-strip");
        expect(strip).toHaveAttribute("data-columns", "3");
        expect(
            within(screen.getByTestId("coverage-tile-team")).getByText("68%"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("coverage-tile-team")).toHaveTextContent(
            "32% unmapped to a team",
        );
        expect(
            within(screen.getByTestId("coverage-tile-repo")).getByText("49%"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("coverage-tile-repo")).toHaveTextContent(
            "51% unmapped to a repo",
        );
        // No unassigned node in the flow: no share can be stated.
        const unassigned = screen.getByTestId("coverage-tile-unassigned");
        expect(unassigned).toHaveTextContent("No unassigned nodes detected");
        expect(unassigned.textContent).not.toMatch(/\d/);
        // The legacy card around the tiles is gone.
        expect(screen.queryByText(/Coverage gaps & unassigned ownership/)).toBeNull();
    });

    it("a coverage the backend did not produce is 'Unavailable' on its tile, never a number", () => {
        view("allocation", makeData({ teamCategoryFlow: flow({ team: 0.68 }) }));
        const repo = screen.getByTestId("coverage-tile-repo");
        expect(within(repo).getByText("Unavailable")).toBeInTheDocument();
        expect(repo).toHaveTextContent("Coverage could not be computed for this window");
        expect(repo.textContent).not.toMatch(/\d/);
    });

    it("the allocation visual is one section card; the Sankey | Chord segments sit in its head", () => {
        view("allocation", makeData({ teamCategoryFlow: flow({ team: 0.68, repo: 0.49 }) }));
        const card = screen.getByTestId("allocation-section");
        const title = within(card).getByRole("heading", { level: 2, name: "Allocation paths" });
        expect(
            within(card).getByText("How effort lands across teams, themes, and repositories."),
        ).toBeInTheDocument();
        const toggle = within(card).getByRole("radiogroup", { name: "Chart type" });
        expect(title.parentElement?.parentElement?.contains(toggle)).toBe(true);
        // The chart block inside has no card of its own (no nested card).
        expect(within(card).getByTestId("team-category-sankey").className).not.toContain(
            "rounded-3xl",
        );
        expect(within(card).getByTestId("team-category-sankey").className).not.toContain("border");
    });

    it("Chord changes the card's title and description; the inner block brings no second title", () => {
        view("allocation", makeData({ teamCategoryFlow: flow({ team: 0.68, repo: 0.49 }) }));
        fireEvent.click(screen.getByRole("radio", { name: /chord/i }));
        const card = screen.getByTestId("allocation-section");
        expect(within(card).getAllByRole("heading", { name: "Team exchange chord" })).toHaveLength(
            1,
        );
        expect(
            within(card).getByRole("heading", { level: 2, name: "Team exchange chord" }),
        ).toBeInTheDocument();
        expect(
            within(card).getByText("Exchange of teams across repositories."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Allocation paths" })).toBeNull();
    });

    it("order: the coverage strip, then the allocation card", () => {
        view("allocation", makeData({ teamCategoryFlow: flow({ team: 0.68, repo: 0.49 }) }));
        expect(
            follows(
                screen.getByTestId("allocation-coverage-strip"),
                screen.getByTestId("allocation-section"),
            ),
        ).toBe(true);
    });
});

describe("Investment Evidence (prototype view 9)", () => {
    const units = [
        makeUnit("a", 10, { evidence_quality: { value: 0.5, band: "low" } }),
        makeUnit("b", 30, { evidence_quality: { value: 0.7, band: "moderate" } }),
        makeUnit("c", 5, {
            investment: { themes: { quality: 1 }, subcategories: { "quality.bugfix": 1 } },
            evidence_quality: { value: null, band: "unknown" },
        }),
    ];

    it("has no legacy 'Evidence' heading or paragraph above the table", () => {
        view("evidence", makeData({ workUnits: units }));
        expect(screen.queryByRole("heading", { level: 2, name: "Evidence" })).toBeNull();
        expect(screen.queryByText(/Group by theme, subcategory, or type, then expand/)).toBeNull();
    });

    it("the table is a section card with the group-by segments and the hint in one row", () => {
        view("evidence", makeData({ workUnits: units }));
        const card = screen.getByTestId("investment-evidence-table");
        expect(card.tagName).toBe("SECTION");
        expect(
            within(card).getByRole("heading", { level: 2, name: "Evidence drilldown" }),
        ).toBeInTheDocument();
        expect(
            within(card).getByText(
                "Work units grouped by their strongest persisted classification.",
            ),
        ).toBeInTheDocument();
        const group = within(card).getByRole("radiogroup", { name: "Group evidence by" });
        expect(
            within(group)
                .getAllByRole("radio")
                .map((r) => r.textContent),
        ).toEqual(["Theme", "Subcategory", "Type"]);
        expect(within(group).getByRole("radio", { name: "Theme" })).toBeChecked();
        expect(group.parentElement).toHaveTextContent("Group the same work units");
        // Segments only: no select for the grouping.
        expect(within(card).queryByRole("combobox")).toBeNull();
    });

    it("columns: the grouping, Average quality, Units, Weighted effort; the head and the rows share one template", () => {
        view("evidence", makeData({ workUnits: units }));
        const head = screen.getByTestId("evidence-table-head");
        expect(Array.from(head.children).map((c) => c.textContent)).toEqual([
            "Theme",
            "Average quality",
            "Units",
            "Weighted effort",
            "Evidence",
        ]);
        const template = "grid-cols-[minmax(0,1fr)_7.5rem_4rem_10rem_6rem]";
        expect(head.className).toContain(template);
        for (const row of screen.getAllByTestId("evidence-group-row")) {
            expect(row.className).toContain(template);
        }
    });

    it("Average quality is the served persisted group mean; a served null is not reported", () => {
        view("evidence", makeData({ workUnits: units }));
        const rows = screen.getAllByTestId("evidence-group-row");
        const byLabel = (label: string) => rows.find((r) => r.textContent?.includes(label))!;
        // The producer's 0.82 differs from the listed units' 0.5/0.7 mean.
        expect(
            within(byLabel("Feature Delivery")).getByTestId("evidence-group-quality"),
        ).toHaveTextContent(new RegExp(`^${formatQuality(0.82)}$`));
        expect(within(byLabel("Quality")).getByTestId("evidence-group-quality")).toHaveTextContent(
            /^Not reported$/,
        );
        // The inline "avg quality:" text is gone from the group name.
        expect(screen.queryByText(/avg quality:/)).toBeNull();
    });

    it("states that the served persisted mean is not calculated from the listed work units", () => {
        view("evidence", makeData({ workUnits: units }));
        expect(
            within(screen.getByTestId("investment-evidence-table")).getByTestId("data-note"),
        ).toHaveTextContent(
            "Average quality is the persisted group mean served for the selected window. It is not calculated from the listed work units. Not reported means Analytics has no persisted quality mean for the group.",
        );
    });

    it("a segment regroups the same work units and renames the first column", () => {
        view("evidence", makeData({ workUnits: units }));
        fireEvent.click(screen.getByRole("radio", { name: "Type" }));
        expect(screen.getByTestId("evidence-table-head").children[0]).toHaveTextContent("Type");
        expect(screen.getByRole("radio", { name: "Type" })).toBeChecked();
        expect(screen.getAllByTestId("evidence-group-row")).toHaveLength(1);
    });

    it("'How this was calculated' is a section card with the work-unit select in an inset", () => {
        view("evidence", makeData({ workUnits: units }));
        const card = screen.getByTestId("work-unit-calculation");
        expect(card.tagName).toBe("SECTION");
        expect(
            within(card).getByRole("heading", { level: 2, name: "How this was calculated" }),
        ).toBeInTheDocument();
        expect(
            within(card).getByText(
                "Classification rationale and metadata remain reachable from the same view.",
            ),
        ).toBeInTheDocument();
        expect(within(card).getByText(/This interpretation is text-first/)).toBeInTheDocument();
        const select = within(card).getByLabelText("Work unit");
        expect(select.tagName).toBe("SELECT");
        expect(within(select as HTMLElement).getAllByRole("option")).toHaveLength(4);
        expect(follows(screen.getByTestId("investment-evidence-table"), card)).toBe(true);
    });
});

describe("Investment Confidence (prototype view 10)", () => {
    const reworkMetric: MetricDelta = {
        metric: "pr_rework_ratio",
        label: "PR Rework Ratio",
        value: 96,
        unit: "%",
        delta_pct: 4,
        spark: [],
    };
    const explained = {
        data: {
            status: "valid",
            confidence: {
                level: "low",
                quality_mean: 0.45,
                quality_stddev: 0.22,
                drivers: ["weak_cross_links"],
            },
        },
        filtersKey: "",
        focus: { theme: null, subcategory: null },
    };
    const confidence = (
        data = makeData(),
        props: Partial<ComponentProps<typeof InvestmentView>> = {},
    ) => {
        useInvestmentDataMock.mockReturnValue(data);
        return render(
            <InvestmentView
                filters={baseFilters}
                activeTab="confidence"
                activeRole="em"
                {...props}
            />,
        );
    };

    it("has no legacy 'Confidence' heading, paragraph or 'Classification confidence' card", () => {
        confidence();
        expect(screen.queryByRole("heading", { name: "Confidence" })).toBeNull();
        expect(screen.queryByText(/How much to trust this investment picture/)).toBeNull();
        expect(screen.queryByRole("heading", { name: "Classification confidence" })).toBeNull();
    });

    it("three tiles in one strip: the served mean with its spread, the served level, the served rework ratio", () => {
        confidence(makeData({ mixExplanation: explained as never }), { reworkMetric });
        expect(screen.getByTestId("confidence-tiles")).toHaveAttribute("data-columns", "3");

        const mean = screen.getByTestId("confidence-tile-mean");
        expect(mean).toHaveTextContent("Mean evidence quality");
        expect(within(mean).getByText("45%")).toBeInTheDocument();
        expect(mean).toHaveTextContent("± 22%");

        const level = screen.getByTestId("confidence-tile-level");
        expect(level).toHaveTextContent("Evidence quality");
        expect(within(level).getByText("Low")).toBeInTheDocument();
        const driver = within(level).getByText("weak cross links");
        expect(driver).toHaveAttribute("title", "Few issue↔PR↔commit links detected");

        const rework = screen.getByTestId("confidence-tile-rework");
        expect(rework).toHaveTextContent("PR Rework Ratio");
        // Number and unit are two elements on the shared tile.
        expect(within(rework).getByTestId("metric-value")).toHaveTextContent(/^96 %$/);
        expect(within(rework).getByRole("link").getAttribute("href")).toContain(
            "metric=pr_rework_ratio",
        );
    });

    it("no confidence served: the first two tiles show the 'no value' mark and say why, no number", () => {
        confidence();
        const mean = screen.getByTestId("confidence-tile-mean");
        // The value reads "Not reported" (the shared tile's no-value mark), and so does the spread.
        expect(within(mean).getByTestId("metric-value")).toHaveTextContent(/^Not reported$/);
        expect(mean.textContent).not.toMatch(/\d/);
        const level = screen.getByTestId("confidence-tile-level");
        expect(within(level).getByTestId("metric-value")).toHaveTextContent(/^Not reported$/);
        expect(level).toHaveTextContent(
            "Classification confidence appears once an investment explanation has been generated for this window.",
        );
    });

    it("a mean without a served spread says so; it does not print ± 0%", () => {
        confidence(
            makeData({
                mixExplanation: {
                    ...explained,
                    data: {
                        ...explained.data,
                        confidence: { level: "moderate", quality_mean: 0.61, quality_stddev: null },
                    },
                } as never,
            }),
        );
        const mean = screen.getByTestId("confidence-tile-mean");
        expect(within(mean).getByText("61%")).toBeInTheDocument();
        expect(mean).toHaveTextContent("Spread not reported");
        expect(mean.textContent).not.toContain("±");
    });

    it("a two-card row: 'Evidence quality bands' beside 'Coverage gaps' (fact rows and the inset)", () => {
        confidence(makeData({ teamCategoryFlow: flow({ team: 0.68 }) }));
        const row = screen.getByTestId("confidence-cards");
        expect(row.className).toContain("lg:grid-cols-2");
        const cards = Array.from(row.children);
        expect(cards).toHaveLength(2);
        expect(
            within(cards[0] as HTMLElement).getByRole("heading", {
                level: 2,
                name: "Evidence quality bands",
            }),
        ).toBeInTheDocument();
        const gaps = cards[1] as HTMLElement;
        expect(gaps).toHaveAttribute("data-testid", "coverage-gaps");
        expect(
            within(gaps).getByRole("heading", { level: 2, name: "Coverage gaps" }),
        ).toBeInTheDocument();
        expect(
            within(gaps)
                .getAllByTestId("evidence-fact")
                .map((r) => r.textContent),
        ).toEqual([
            "Team coverage68%",
            // Not produced by the backend: no row, never 0%.
            "Unassigned ownershipnone detected",
        ]);
        expect(gaps).toHaveTextContent(
            "Unassigned is visible and inspectable. It is not silently redistributed to known teams or repositories.",
        );
    });

    it("'Low-confidence areas' is a section card with a table: theme and quality, a Band pill, the work unit", () => {
        confidence(
            makeData({
                workUnits: [
                    makeUnit("weak", 5, { evidence_quality: { value: 0.23, band: "very_low" } }),
                    makeUnit("fine", 5, { evidence_quality: { value: 0.9, band: "high" } }),
                    makeUnit("none", 5, { evidence_quality: { value: null, band: "unknown" } }),
                ],
            }),
        );
        const card = screen.getByTestId("low-confidence-areas");
        expect(
            within(card).getByRole("heading", { level: 2, name: "Low-confidence areas" }),
        ).toBeInTheDocument();
        const table = within(card).getByTestId("low-confidence-table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((h) => h.textContent),
        ).toEqual(["Theme / quality", "Band", "Work unit"]);
        const rows = within(table).getAllByTestId("low-confidence-row");
        // Lowest quality first (production's order); the high-quality unit is not listed.
        expect(rows).toHaveLength(2);
        // The band text is production's own label ("Very Low"), as on the Evidence tab.
        expect(rows.map((r) => r.textContent)).toEqual([
            "Feature DeliveryUnknownWork unit none",
            `Feature Delivery · ${formatQuality(0.23)}Very LowWork unit weak`,
        ]);
        const pill = within(rows[1]).getByTestId("low-confidence-band");
        expect(pill).toHaveTextContent("Very Low");
        expect(pill.className).toContain("rounded-full");
        const action = within(card).getByRole("link", { name: "Evidence drilldown" });
        expect(action.getAttribute("href")).toContain("/investment?tab=evidence");
        expect(action.getAttribute("href")).toContain("role=em");
    });

    it("'Rework by theme' (not drawn in the prototype) stays, as the last section, only when it is served", () => {
        const { unmount } = confidence();
        expect(screen.queryByTestId("rework-by-theme")).toBeNull();
        unmount();
        confidence(makeData(), {
            reworkThemeAllocation: [
                {
                    theme: "quality",
                    label: "Quality",
                    allocation: 0.25,
                    allocation_pct: 25,
                    prs_merged: 3,
                    churn_loc: 1200,
                },
            ],
        });
        const rework = screen.getByTestId("rework-by-theme");
        expect(
            within(rework).getByRole("heading", { level: 2, name: "Rework by theme" }),
        ).toBeInTheDocument();
        expect(rework).toHaveTextContent("25%");
        expect(follows(screen.getByTestId("low-confidence-areas"), rework)).toBe(true);
        expect(rework.parentElement?.lastElementChild).toBe(rework);
    });

    // CHAOS-8584: the row name comes from the one theme label source, keyed by the served `theme`;
    // a row with no `theme` key prints the served `label`.
    it("'Rework by theme' names a row by the one label source, or by the served label without a theme key", () => {
        const row = {
            allocation: 0.25,
            allocation_pct: 25,
            prs_merged: 3,
            churn_loc: 1200,
        };
        confidence(makeData(), {
            reworkThemeAllocation: [
                { ...row, theme: "quality", label: "Quality / Reliability" },
                { ...row, theme: "", label: "Served only label" },
            ],
        });
        const rework = screen.getByTestId("rework-by-theme");
        const names = within(rework)
            .getAllByRole("listitem")
            .map((item) => item.querySelector("span.font-medium")?.textContent);
        expect(names).toEqual(["Quality", "Served only label"]);
    });

    it("order: tiles, the two-card row, the low-confidence section", () => {
        confidence();
        const order = [
            screen.getByTestId("confidence-tiles"),
            screen.getByTestId("confidence-cards"),
            screen.getByTestId("low-confidence-areas"),
        ];
        expect(follows(order[0], order[1])).toBe(true);
        expect(follows(order[1], order[2])).toBe(true);
    });
});

/**
 * ComplexityDashboard tests — Vitest + jsdom (CHAOS-1745).
 *
 * Covers:
 *   - computeKpis: KPI computation from GraphQL point data
 *   - buildTreemapData: treemap hierarchy construction
 *   - ComplexityDashboard: empty state, KPI tiles, trend panel, treemap, drilldown table
 */
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import {
    ComplexityDashboard,
    computeKpis,
    computeRisingAreas,
    buildTreemapData,
    buildTrendOption,
    type ComplexityPoint,
    type HotspotRow,
} from "./ComplexityDashboard";

// ---------------------------------------------------------------------------
// Mocks — chart primitives require canvas / echarts in jsdom
// ---------------------------------------------------------------------------

vi.mock("@/components/charts/Chart", () => ({
    Chart: ({ option }: { option: { series?: unknown[] } }) => (
        <div
            data-testid="chart"
            data-series={option?.series ? (option.series as unknown[]).length : 0}
        />
    ),
}));

vi.mock("@/components/complexity/HotspotColumnTreemap", () => ({
    HotspotColumnTreemap: ({ data }: { data: { children?: unknown[] } }) => (
        <div data-testid="treemap-chart" data-children={data?.children?.length ?? 0} />
    ),
}));

vi.mock("@/components/charts/HeatmapPanel", () => ({
    HeatmapPanel: (props: {
        title: string;
        emptyState?: string;
        initialData?: { cells?: unknown[] } | null;
        embedded?: boolean;
        failed?: boolean;
    }) => (
        <div
            data-testid="heatmap-panel"
            data-title={props.title}
            data-embedded={String(Boolean(props.embedded))}
            data-failed={String(Boolean(props.failed))}
            data-cells={props.initialData?.cells?.length ?? "none"}
        >
            {props.initialData ? "grid" : props.emptyState}
        </div>
    ),
}));

vi.mock("@/lib/echartsInit", () => ({
    echarts: { use: vi.fn() },
}));

vi.mock("echarts/charts", () => ({
    LineChart: {},
}));

vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => ({
        background: "#fff",
        stroke: "#eee",
        text: "#000",
        muted: "#888",
        grid: "#ddd",
        accent2: "#f00",
    }),
    useChartColors: () => ["#3b82f6", "#10b981", "#f59e0b"],
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/complexity",
    useRouter: () => ({ refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePoint(
    scopeId: string,
    date: string,
    override: Partial<ComplexityPoint> = {},
): ComplexityPoint {
    return {
        scopeId,
        scopeName: `Repo ${scopeId}`,
        date,
        locTotal: 10000,
        cyclomaticPerKloc: 5.0,
        cyclomaticTotal: 50,
        cyclomaticAvg: 4.5,
        highComplexityFunctions: 3,
        veryHighComplexityFunctions: 1,
        ...override,
    };
}

function makeHotspot(
    filePath: string,
    riskScore: number,
    override: Partial<HotspotRow> = {},
): HotspotRow {
    return {
        filePath,
        repoId: "repo-1",
        repoName: "repo-one",
        churnLoc30d: 100,
        churnCommits30d: 10,
        cyclomaticTotal: 25,
        cyclomaticAvg: 8.5,
        blameConcentration: null,
        riskScore,
        evidenceUrl: null,
        ...override,
    };
}

// ---------------------------------------------------------------------------
// computeKpis — unit tests
// ---------------------------------------------------------------------------

describe("computeKpis", () => {
    it("returns nulls/zeros when both arrays are empty", () => {
        const { avgComplexity, totalHighComplexity, hotspotCount } = computeKpis([], []);
        expect(avgComplexity).toBeNull();
        expect(totalHighComplexity).toBe(0);
        expect(hotspotCount).toBe(0);
    });

    it("computes avgComplexity as mean of latest cyclomaticPerKloc per scope", () => {
        const points = [
            makePoint("r1", "2026-01-01", { cyclomaticPerKloc: 4.0 }),
            makePoint("r1", "2026-01-08", { cyclomaticPerKloc: 6.0 }), // latest
            makePoint("r2", "2026-01-08", { cyclomaticPerKloc: 8.0 }),
        ];
        const { avgComplexity } = computeKpis(points, []);
        // r1 latest = 6.0, r2 latest = 8.0 → avg = 7.0
        expect(avgComplexity).toBeCloseTo(7.0, 5);
    });

    it("returns null avgComplexity when all cyclomaticPerKloc are null", () => {
        const points = [makePoint("r1", "2026-01-08", { cyclomaticPerKloc: null })];
        const { avgComplexity } = computeKpis(points, []);
        expect(avgComplexity).toBeNull();
    });

    it("sums highComplexityFunctions across latest scope points", () => {
        const points = [
            makePoint("r1", "2026-01-08", { highComplexityFunctions: 5 }),
            makePoint("r2", "2026-01-08", { highComplexityFunctions: 7 }),
        ];
        const { totalHighComplexity } = computeKpis(points, []);
        expect(totalHighComplexity).toBe(12);
    });

    it("counts hotspot rows with riskScore above default threshold (0.5)", () => {
        const rows = [makeHotspot("a.py", 0.3), makeHotspot("b.py", 0.6), makeHotspot("c.py", 0.9)];
        const { hotspotCount } = computeKpis([], rows);
        expect(hotspotCount).toBe(2);
    });

    it("respects a custom threshold", () => {
        const rows = [makeHotspot("a.py", 0.3), makeHotspot("b.py", 0.6), makeHotspot("c.py", 0.9)];
        const { hotspotCount } = computeKpis([], rows, 0.8);
        expect(hotspotCount).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// buildTreemapData — unit tests
// ---------------------------------------------------------------------------

describe("buildTreemapData", () => {
    it("returns null when rows is empty", () => {
        expect(buildTreemapData([])).toBeNull();
    });

    it("groups rows by repoName with correct child count", () => {
        const rows = [
            makeHotspot("src/a.py", 0.8),
            makeHotspot("src/b.py", 0.5),
            makeHotspot("lib/c.py", 0.9, { repoName: "repo-two" }),
        ];
        const data = buildTreemapData(rows);
        expect(data).not.toBeNull();
        expect(data!.children).toHaveLength(2);
        const repoOne = data!.children!.find((c) => c.name === "repo-one");
        expect(repoOne).toBeDefined();
        expect(repoOne!.children).toHaveLength(2);
    });

    it("assigns riskScore as value for leaf nodes", () => {
        const rows = [makeHotspot("src/main.py", 0.75)];
        const data = buildTreemapData(rows);
        const leaf = data!.children![0].children![0];
        expect(leaf.value).toBeCloseTo(0.75);
    });

    it("uses the file basename as the leaf node name", () => {
        const rows = [makeHotspot("deeply/nested/path/component.tsx", 0.6)];
        const data = buildTreemapData(rows);
        const leaf = data!.children![0].children![0];
        expect(leaf.name).toBe("component.tsx");
    });
});

// ---------------------------------------------------------------------------
// ComplexityDashboard — rendering tests
// ---------------------------------------------------------------------------

describe("computeRisingAreas", () => {
    it("returns 0 when there are no points", () => {
        expect(computeRisingAreas([])).toBe(0);
    });

    it("counts scopes whose latest value exceeds their earliest", () => {
        const points = [
            makePoint("r1", "2026-01-01", { cyclomaticPerKloc: 4.0 }),
            makePoint("r1", "2026-01-08", { cyclomaticPerKloc: 6.0 }), // rising
            makePoint("r2", "2026-01-01", { cyclomaticPerKloc: 8.0 }),
            makePoint("r2", "2026-01-08", { cyclomaticPerKloc: 5.0 }), // falling
        ];
        expect(computeRisingAreas(points)).toBe(1);
    });

    it("ignores scopes with a single point or null values", () => {
        const points = [
            makePoint("r1", "2026-01-08", { cyclomaticPerKloc: 6.0 }), // single point
            makePoint("r2", "2026-01-01", { cyclomaticPerKloc: null }),
            makePoint("r2", "2026-01-08", { cyclomaticPerKloc: 9.0 }),
        ];
        expect(computeRisingAreas(points)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// ComplexityDashboard — per-tab rendering tests (CHAOS-2149)
// ---------------------------------------------------------------------------

describe("ComplexityDashboard", () => {
    const baseProps = {
        orgId: "org-test",
        points: [] as ComplexityPoint[],
        hotspotRows: [] as HotspotRow[],
    };

    it("renders empty state when both points and hotspotRows are empty", () => {
        render(<ComplexityDashboard {...baseProps} />);
        expect(screen.getByTestId("empty-state")).toBeInTheDocument();
        expect(screen.getByText(/no complexity history/i)).toBeInTheDocument();
    });

    it("includes orgId in the empty state message", () => {
        render(<ComplexityDashboard {...baseProps} orgId="org-sentinel" />);
        expect(screen.getByText(/org-sentinel/)).toBeInTheDocument();
    });

    it("renders the dashboard container when points are present", () => {
        const points = [makePoint("r1", "2026-01-08")];
        render(<ComplexityDashboard {...baseProps} points={points} />);
        expect(screen.getByTestId("complexity-dashboard")).toBeInTheDocument();
    });

    // --- Overview tab ---
    it("renders 4 KPI tiles on the overview tab", () => {
        const points = [makePoint("r1", "2026-01-08", { cyclomaticPerKloc: 6.0 })];
        const hotspots = [makeHotspot("a.py", 0.8)];
        render(<ComplexityDashboard {...baseProps} points={points} hotspotRows={hotspots} />);
        expect(screen.getAllByTestId("kpi-card")).toHaveLength(4);
    });

    it("draws the tiles as one strip; a value that is not served reads 'Not reported' with its reason, a served 0 stays 0", () => {
        const points = [makePoint("r1", "2026-01-08", { cyclomaticPerKloc: 6.0 })];
        render(<ComplexityDashboard {...baseProps} points={points} hotspotRows={[]} />);

        expect(screen.getByTestId("complexity-kpis")).toHaveAttribute("data-columns", "4");
        const tiles = screen.getAllByTestId("kpi-card");
        const hotspotTile = tiles.find((tile) => tile.textContent?.includes("Hotspot Files"));
        expect(within(hotspotTile as HTMLElement).getByTestId("metric-value")).toHaveTextContent(
            "Not reported",
        );
        expect(hotspotTile).toHaveTextContent(
            "No hotspots: no files crossed the hotspot risk threshold.",
        );
        const rising = tiles.find((tile) => tile.textContent?.includes("Rising Areas"));
        expect(within(rising as HTMLElement).getByTestId("metric-value")).toHaveTextContent("0");
    });

    it("draws the Evidence button on a churn row too, with the arrow before the label", async () => {
        const rows = [
            makeHotspot("a.py", 0.8, { churnLoc30d: 120, evidenceUrl: "/explore?api=x" }),
        ];
        render(<ComplexityDashboard {...baseProps} activeTab="churn" hotspotRows={rows} />);

        const row = within(screen.getByTestId("churn-row"));
        const button = row.getByRole("button", { name: /^Evidence for / });
        expect(button).toHaveTextContent("Evidence");
        expect(button.firstElementChild?.tagName.toLowerCase()).toBe("span");
    });

    it("renders the trend panel and Chart on overview when points are present", () => {
        const points = [makePoint("r1", "2026-01-08")];
        render(<ComplexityDashboard {...baseProps} points={points} />);
        expect(screen.getByTestId("trend-panel")).toBeInTheDocument();
        expect(screen.getByTestId("chart")).toBeInTheDocument();
    });

    it("shows an empty trend DataState on overview when points are absent", () => {
        const hotspots = [makeHotspot("a.py", 0.8)];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} />);
        expect(screen.queryByTestId("trend-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("trend-panel-empty")).toBeInTheDocument();
    });

    it("does NOT render the hotspot treemap on the overview tab", () => {
        const points = [makePoint("r1", "2026-01-08")];
        const hotspots = [makeHotspot("a.py", 0.8)];
        render(<ComplexityDashboard {...baseProps} points={points} hotspotRows={hotspots} />);
        expect(screen.queryByTestId("hotspot-panel")).not.toBeInTheDocument();
    });

    // --- Hotspots tab ---
    it("renders the treemap panel on the hotspots tab", () => {
        const hotspots = [makeHotspot("a.py", 0.8)];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        expect(screen.getByTestId("hotspot-panel")).toBeInTheDocument();
        expect(screen.getByTestId("treemap-chart")).toBeInTheDocument();
    });

    it("renders the drilldown table with correct row count on the hotspots tab", () => {
        const hotspots = [makeHotspot("src/main.py", 0.9), makeHotspot("src/utils.py", 0.7)];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        expect(screen.getByTestId("drilldown-table")).toBeInTheDocument();
        expect(screen.getAllByTestId("hotspot-row")).toHaveLength(2);
    });

    it("caps the hotspots drilldown table at 20 rows", () => {
        const hotspots = Array.from({ length: 25 }, (_, i) =>
            makeHotspot(`src/file${i}.py`, 0.9 - i * 0.01),
        );
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        expect(screen.getAllByTestId("hotspot-row")).toHaveLength(20);
    });

    it("opens the shared evidence drawer from a hotspot row: served values as fact rows, served link in the footer", async () => {
        const hotspots = [
            makeHotspot("src/app/a.py", 0.9, {
                evidenceUrl: "/code?file=src/app/a.py",
                blameConcentration: 0.82,
            }),
        ];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        // The row has a button, not a link that leaves the page.
        expect(screen.queryByTestId("evidence-link")).toBeNull();
        expect(screen.queryByRole("dialog")).toBeNull();

        await userEvent.click(
            within(screen.getByTestId("hotspot-row")).getByRole("button", {
                name: /^Evidence for /,
            }),
        );

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent("a.py");
        const facts = Object.fromEntries(
            within(within(drawer).getByTestId("evidence-subject-facts"))
                .getAllByTestId("evidence-fact")
                .map((row) => [
                    row.querySelector("dt")?.textContent,
                    row.querySelector("dd")?.textContent,
                ]),
        );
        expect(facts).toEqual({
            File: "src/app/a.py",
            Repository: "repo-one",
            "Risk score": "0.9",
            "Cyclomatic avg": "8.5",
            "Churn LOC 30d": "100",
            "Owner concentration": "82%",
        });
        // The evidence link stays: it is the drawer's footer action.
        expect(within(drawer).getByTestId("evidence-link")).toHaveAttribute(
            "href",
            "/code?file=src/app/a.py",
        );
    });

    it("shows one muted provenance line in the row drawer, not five empty rows (the hotspots query serves none)", async () => {
        const hotspots = [
            makeHotspot("a.py", 0.9, { evidenceUrl: "/code?file=a.py", blameConcentration: 0.5 }),
        ];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        await userEvent.click(screen.getByRole("button", { name: /^Evidence for / }));

        const drawer = screen.getByRole("dialog");
        expect(within(drawer).getByTestId("evidence-provenance-not-reported")).toHaveTextContent(
            "Provenance is not reported for this item.",
        );
        expect(within(drawer).queryByTestId("evidence-facts")).toBeNull();
        expect(within(drawer).queryByText("Not reported")).toBeNull();
        expect(within(drawer).getByTestId("evidence-subject-facts")).toBeInTheDocument();
    });

    it("Escape closes the row drawer and focus returns to the row's Evidence button", async () => {
        const hotspots = [
            makeHotspot("a.py", 0.9, { evidenceUrl: "/code?file=a.py" }),
            makeHotspot("b.py", 0.8, { evidenceUrl: "/code?file=b.py" }),
        ];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        const opener = within(screen.getAllByTestId("hotspot-row")[1]).getByRole("button", {
            name: /^Evidence for /,
        });
        await userEvent.click(opener);
        expect(screen.getByTestId("evidence-subject")).toHaveTextContent("b.py");

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });

    it("shows 'Not reported' in the drawer for an owner concentration the query did not serve", async () => {
        const hotspots = [makeHotspot("a.py", 0.9, { evidenceUrl: "/code?file=a.py" })];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);

        await userEvent.click(screen.getByRole("button", { name: /^Evidence for / }));

        const row = within(screen.getByRole("dialog"))
            .getAllByTestId("evidence-fact")
            .find((fact) => fact.querySelector("dt")?.textContent === "Owner concentration");
        expect(row?.querySelector("dd")).toHaveTextContent(/^Not reported$/);
    });

    it("closes the drawer when the user follows the footer evidence link", async () => {
        const hotspots = [makeHotspot("a.py", 0.9, { evidenceUrl: "/code?file=a.py" })];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);
        await userEvent.click(screen.getByRole("button", { name: /^Evidence for / }));
        const link = screen.getByTestId("evidence-link");
        link.addEventListener("click", (event) => event.preventDefault());

        await userEvent.click(link);

        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps the 'No artifact link' state for a row with no served link (no button)", () => {
        const hotspots = [makeHotspot("a.py", 0.9)];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />);

        const row = screen.getByTestId("hotspot-row");
        expect(within(row).getByText("No artifact link")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: /^Evidence for / })).toBeNull();
    });

    it("shows a DataState (not the treemap) on the hotspots tab when only points exist", () => {
        const points = [makePoint("r1", "2026-01-08")];
        render(<ComplexityDashboard {...baseProps} points={points} activeTab="hotspots" />);
        expect(screen.queryByTestId("hotspot-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("hotspot-panel-empty")).toBeInTheDocument();
    });

    // --- Ownership Risk tab ---
    it("ranks files by blame concentration on the ownership-risk tab", () => {
        const hotspots = [
            makeHotspot("a.py", 0.8, { blameConcentration: 0.9 }),
            makeHotspot("b.py", 0.6, { blameConcentration: 0.4 }),
            makeHotspot("c.py", 0.5, { blameConcentration: null }), // excluded
        ];
        render(
            <ComplexityDashboard
                {...baseProps}
                hotspotRows={hotspots}
                activeTab="ownership-risk"
            />,
        );
        expect(screen.getByTestId("ownership-panel")).toBeInTheDocument();
        expect(screen.getAllByTestId("ownership-row")).toHaveLength(2);
    });

    it("names the ownership-risk repository column 'Repository' (prototype screen 20)", () => {
        render(
            <ComplexityDashboard
                {...baseProps}
                hotspotRows={[makeHotspot("a.py", 0.8, { blameConcentration: 0.9 })]}
                activeTab="ownership-risk"
            />,
        );
        const heads = within(screen.getByTestId("ownership-table"))
            .getAllByRole("columnheader")
            .map((head) => head.textContent);
        expect(heads).toEqual([
            "File",
            "Repository",
            "Owner concentration",
            "Risk score",
            expect.any(String),
        ]);
    });

    it("names the repository column 'Repository' in the hotspot and churn tables too (CHAOS-8580)", () => {
        const rows = [makeHotspot("a.py", 0.8, { blameConcentration: 0.9 })];
        for (const [tab, table] of [
            ["hotspots", "hotspot-table"],
            ["churn", "churn-table"],
        ] as const) {
            const { unmount } = render(
                <ComplexityDashboard {...baseProps} hotspotRows={rows} activeTab={tab} />,
            );
            const heads = within(screen.getByTestId(table))
                .getAllByRole("columnheader")
                .map((head) => head.textContent);
            expect(heads[1], tab).toBe("Repository");
            expect(heads, tab).not.toContain("Repo");
            unmount();
        }
    });

    it("shows a DataState on the ownership-risk tab when no blame data exists", () => {
        const hotspots = [makeHotspot("a.py", 0.8, { blameConcentration: null })];
        render(
            <ComplexityDashboard
                {...baseProps}
                hotspotRows={hotspots}
                activeTab="ownership-risk"
            />,
        );
        expect(screen.queryByTestId("ownership-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("ownership-panel-empty")).toBeInTheDocument();
    });

    // --- Churn tab ---
    it("tells the churn window is 30 days and names the selected window when it differs", () => {
        const hotspots = [makeHotspot("a.py", 0.8, { churnLoc30d: 500 })];
        render(
            <ComplexityDashboard
                {...baseProps}
                hotspotRows={hotspots}
                activeTab="churn"
                windowDays={14}
            />,
        );
        const notice = screen.getByTestId("churn-window-notice");
        expect(notice).toHaveTextContent("Panel window: 30 days.");
        expect(notice).toHaveTextContent("even though the selected window is 14 days");
    });

    it("says only the 30-day window when the selected window is also 30 days or unknown", () => {
        const hotspots = [makeHotspot("a.py", 0.8, { churnLoc30d: 500 })];
        const { unmount } = render(
            <ComplexityDashboard
                {...baseProps}
                hotspotRows={hotspots}
                activeTab="churn"
                windowDays={30}
            />,
        );
        expect(screen.getByTestId("churn-window-notice")).not.toHaveTextContent("even though");
        unmount();
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="churn" />);
        expect(screen.getByTestId("churn-window-notice")).not.toHaveTextContent("even though");
    });

    it("shows the notice with the empty churn state too, and on no other tab", () => {
        const { unmount } = render(
            <ComplexityDashboard
                {...baseProps}
                points={[makePoint("r1", "2026-01-08")]}
                activeTab="churn"
                windowDays={7}
            />,
        );
        expect(screen.getByTestId("churn-window-notice")).toBeInTheDocument();
        unmount();
        for (const tab of ["overview", "hotspots", "ownership-risk"] as const) {
            const r = render(
                <ComplexityDashboard
                    {...baseProps}
                    hotspotRows={[makeHotspot("a.py", 0.8)]}
                    activeTab={tab}
                    windowDays={14}
                />,
            );
            expect(screen.queryByTestId("churn-window-notice")).toBeNull();
            r.unmount();
        }
    });

    it("ranks files by churn on the churn tab", () => {
        const hotspots = [
            makeHotspot("a.py", 0.8, { churnLoc30d: 500 }),
            makeHotspot("b.py", 0.6, { churnLoc30d: 120 }),
        ];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="churn" />);
        expect(screen.getByTestId("churn-panel")).toBeInTheDocument();
        expect(screen.getAllByTestId("churn-row")).toHaveLength(2);
        // Churn bars use the tide data token, not the accent (scarlet) color.
        const bar = screen.getAllByTestId("churn-row")[0].querySelector("span[aria-hidden]");
        expect(bar?.className).toContain("bg-(--chart-color-1)");
        expect(bar?.className).not.toMatch(/accent/u);
    });

    it("shows a DataState on the churn tab when there is no churn", () => {
        const hotspots = [makeHotspot("a.py", 0.8, { churnLoc30d: 0 })];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="churn" />);
        expect(screen.queryByTestId("churn-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("churn-panel-empty")).toBeInTheDocument();
    });
});

describe("buildTrendOption conventions", () => {
    const theme = {
        background: "#fff",
        stroke: "#eee",
        text: "#000",
        muted: "#888",
        grid: "#ddd",
    } as never;
    const colors = ["#3b82f6", "#10b981", "#f59e0b"];
    const pts = [
        makePoint("r1", "2026-01-01", { cyclomaticPerKloc: 5 }),
        makePoint("r1", "2026-01-03", { cyclomaticPerKloc: 6 }),
        makePoint("r1", "2026-01-04", { cyclomaticPerKloc: 7 }),
        makePoint("r2", "2026-01-01", { cyclomaticPerKloc: 2 }),
        makePoint("r2", "2026-01-02", { cyclomaticPerKloc: 3 }),
    ];
    type S = {
        name: string;
        symbolSize: number;
        showAllSymbol: boolean;
        connectNulls: boolean;
        smooth: boolean;
        itemStyle: { color: string };
        lineStyle: { width: number; cap: string; join: string; color: string };
        data: Array<{
            value: number | null;
            symbolSize: number;
            itemStyle?: { borderWidth: number };
        }>;
    };
    const opt = () =>
        buildTrendOption(pts, theme, colors) as unknown as {
            tooltip: {
                axisPointer: {
                    type: string;
                    lineStyle: { color: string; width: number; type: string };
                };
            };
            legend: { show: boolean };
            series: S[];
        };

    it("uses the shared tooltip with a muted 1px solid crosshair", () => {
        expect(opt().tooltip.axisPointer).toEqual({
            type: "line",
            lineStyle: { color: "#888", width: 1, type: "solid" },
        });
    });

    it("draws a dot only on the last value, bridging the gap (connectNulls)", () => {
        const [r1, r2] = opt().series;
        // r1 has a null on 01-02: dates are 01,02,03,04 -> values 5,null,6,7
        expect(r1.data.map((d) => d.value)).toEqual([5, null, 6, 7]);
        expect(r1.data.map((d) => d.symbolSize)).toEqual([0, 0, 0, 8]);
        expect(r1.data[3].itemStyle?.borderWidth).toBe(2);
        expect(r2.data.map((d) => d.symbolSize)).toEqual(
            [0, 0, 0, 0].map((_, i) => (i === 1 ? 8 : 0)),
        );
    });

    it("keeps the legend glyph, colors, smoothing and bridging as before", () => {
        const o = opt();
        expect(o.legend.show).toBe(true);
        o.series.forEach((s, i) => {
            expect(s.symbolSize).toBe(5);
            expect(s.showAllSymbol).toBe(true);
            expect(s.connectNulls).toBe(true);
            expect(s.smooth).toBe(true);
            expect(s.itemStyle.color).toBe(colors[i]);
            expect(s.lineStyle).toEqual({
                width: 2,
                cap: "round",
                join: "round",
                color: colors[i],
            });
        });
    });
});

describe("Hotspots tab: Hotspot concentration heatmap", () => {
    const request = {
        type: "risk" as const,
        metric: "hotspot_risk",
        scope_type: "org",
        scope_id: "",
        range_days: 90,
    };
    const props = {
        orgId: "org-1",
        points: [makePoint("a", "2026-01-01")],
        hotspotRows: [makeHotspot("src/a.ts", 3)],
        activeTab: "hotspots" as const,
    };
    const served = {
        axes: { x: ["w1"], y: ["r1"] },
        cells: [{ x: "w1", y: "r1", value: 2 }],
        legend: { unit: "risk" },
        evidence: [],
    } as never;

    it("renders the served heatmap in a Section card under the existing hotspot content", () => {
        render(
            <ComplexityDashboard
                {...props}
                hotspotHeatmap={{ request, state: "ok", data: served }}
            />,
        );
        const card = screen.getByTestId("hotspot-heatmap-section");
        expect(
            within(card).getByRole("heading", { name: "Hotspot concentration" }),
        ).toBeInTheDocument();
        const panel = within(card).getByTestId("heatmap-panel");
        expect(panel).toHaveAttribute("data-cells", "1");
        expect(panel).toHaveAttribute("data-embedded", "true");
        // under the existing content
        const table = screen.getByTestId("drilldown-table");
        expect(table.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("puts the unit pill in the Section card head, not inside the panel", () => {
        render(
            <ComplexityDashboard
                {...props}
                hotspotHeatmap={{ request, state: "ok", data: served }}
            />,
        );
        const card = screen.getByTestId("hotspot-heatmap-section");
        const pill = within(card).getByTestId("heatmap-unit");
        expect(pill).toHaveTextContent("risk");
        expect(
            within(screen.getByTestId("heatmap-panel")).queryByTestId("heatmap-unit"),
        ).toBeNull();
        // the head row holds the title block and the pill; the body (panel) is a later sibling
        const head = pill.closest("section")?.firstElementChild as HTMLElement;
        expect(head.contains(pill)).toBe(true);
        expect(head.contains(screen.getByTestId("heatmap-panel"))).toBe(false);
    });

    it("keeps the Code page empty words when nothing was served", () => {
        render(
            <ComplexityDashboard
                {...props}
                hotspotHeatmap={{ request, state: "unavailable", data: null }}
            />,
        );
        expect(screen.getByTestId("heatmap-panel")).toHaveTextContent(
            "Hotspot heatmap unavailable.",
        );
    });

    it("says Could not be read when the read failed", () => {
        render(
            <ComplexityDashboard
                {...props}
                hotspotHeatmap={{ request, state: "failed", data: null }}
            />,
        );
        expect(screen.getByTestId("heatmap-panel")).toHaveAttribute("data-failed", "true");
    });

    it("still shows it when there are no hotspot files", () => {
        render(
            <ComplexityDashboard
                {...props}
                hotspotRows={[]}
                hotspotHeatmap={{ request, state: "ok", data: served }}
            />,
        );
        expect(screen.getByTestId("hotspot-heatmap-section")).toBeInTheDocument();
    });

    it("does not render on the other tabs", () => {
        render(
            <ComplexityDashboard
                {...props}
                activeTab="overview"
                hotspotHeatmap={{ request, state: "ok", data: served }}
            />,
        );
        expect(screen.queryByTestId("hotspot-heatmap-section")).toBeNull();
    });
});

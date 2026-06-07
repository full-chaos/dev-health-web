/**
 * ComplexityDashboard tests — Vitest + jsdom (CHAOS-1745).
 *
 * Covers:
 *   - computeKpis: KPI computation from GraphQL point data
 *   - buildTreemapData: treemap hierarchy construction
 *   - ComplexityDashboard: empty state, KPI tiles, trend panel, treemap, drilldown table
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { render } from "@/test/utils";
import {
    ComplexityDashboard,
    computeKpis,
    computeRisingAreas,
    buildTreemapData,
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

vi.mock("@/components/charts/TreemapChart", () => ({
    TreemapChart: ({ data }: { data: { children?: unknown[] } }) => (
        <div data-testid="treemap-chart" data-children={data?.children?.length ?? 0} />
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
        render(
            <ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />,
        );
        expect(screen.getByTestId("hotspot-panel")).toBeInTheDocument();
        expect(screen.getByTestId("treemap-chart")).toBeInTheDocument();
    });

    it("renders the drilldown table with correct row count on the hotspots tab", () => {
        const hotspots = [makeHotspot("src/main.py", 0.9), makeHotspot("src/utils.py", 0.7)];
        render(
            <ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />,
        );
        expect(screen.getByTestId("drilldown-table")).toBeInTheDocument();
        expect(screen.getAllByTestId("hotspot-row")).toHaveLength(2);
    });

    it("caps the hotspots drilldown table at 20 rows", () => {
        const hotspots = Array.from({ length: 25 }, (_, i) =>
            makeHotspot(`src/file${i}.py`, 0.9 - i * 0.01),
        );
        render(
            <ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />,
        );
        expect(screen.getAllByTestId("hotspot-row")).toHaveLength(20);
    });

    it("renders evidence link when evidenceUrl is provided (hotspots tab)", () => {
        const hotspots = [
            makeHotspot("a.py", 0.9, { evidenceUrl: "https://example.com/evidence" }),
        ];
        render(
            <ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="hotspots" />,
        );
        expect(screen.getAllByTestId("evidence-link")[0]).toHaveAttribute(
            "href",
            "https://example.com/evidence",
        );
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
    it("ranks files by churn on the churn tab", () => {
        const hotspots = [
            makeHotspot("a.py", 0.8, { churnLoc30d: 500 }),
            makeHotspot("b.py", 0.6, { churnLoc30d: 120 }),
        ];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="churn" />);
        expect(screen.getByTestId("churn-panel")).toBeInTheDocument();
        expect(screen.getAllByTestId("churn-row")).toHaveLength(2);
    });

    it("shows a DataState on the churn tab when there is no churn", () => {
        const hotspots = [makeHotspot("a.py", 0.8, { churnLoc30d: 0 })];
        render(<ComplexityDashboard {...baseProps} hotspotRows={hotspots} activeTab="churn" />);
        expect(screen.queryByTestId("churn-panel")).not.toBeInTheDocument();
        expect(screen.getByTestId("churn-panel-empty")).toBeInTheDocument();
    });
});

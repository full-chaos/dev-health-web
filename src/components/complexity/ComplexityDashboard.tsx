/**
 * ComplexityDashboard — client surface for /complexity (CHAOS-1745, CHAOS-2149).
 *
 * Renders DISTINCT content per in-page tab (the page owns the Flame tab):
 *   - overview        → KPI tiles (avg complexity, rising areas, high-complexity
 *                       functions, hotspot files) + multi-series trend chart.
 *   - hotspots        → risk treemap + top hotspot files drilldown table.
 *   - ownership-risk  → files ranked by blame concentration (single-owner risk).
 *   - churn           → files ranked by 30-day churn.
 *
 * Every view reads the already-fetched complexityTimeseries (points) and hotspots
 * (hotspotRows) — nothing is fabricated, and each empty branch uses DataState.
 *
 * Pure helpers (computeKpis, computeRisingAreas, buildTreemapData) are exported
 * for unit testing without DOM rendering.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";

import { Chart } from "@/components/charts/Chart";
import { TreemapChart } from "@/components/charts/TreemapChart";
import type { TreemapNode } from "@/components/charts/TreemapChart";
import { DataState } from "@/components/ui/DataState";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { echarts } from "@/lib/echartsInit";
import { formatNumber } from "@/lib/formatters";

// Register LineChart for multi-series trend — Grid, Tooltip, Legend already
// registered globally in echartsInit.ts.
echarts.use([LineChart]);

// ---------------------------------------------------------------------------
// Types (exported so page.tsx can reference them without an extra import)
// ---------------------------------------------------------------------------

export type ComplexityPoint = {
    date: string;
    scopeId: string;
    scopeName: string;
    locTotal: number | null;
    cyclomaticPerKloc: number | null;
    cyclomaticTotal: number | null;
    cyclomaticAvg: number | null;
    highComplexityFunctions: number | null;
    veryHighComplexityFunctions: number | null;
};

export type HotspotRow = {
    filePath: string;
    repoId: string;
    repoName: string;
    churnLoc30d: number;
    churnCommits30d: number;
    cyclomaticTotal: number;
    cyclomaticAvg: number;
    blameConcentration: number | null;
    riskScore: number;
    evidenceUrl: string | null;
};

/** The tabs ComplexityDashboard renders. `flame` is handled by the page (FlameView). */
export type ComplexityTab = "overview" | "hotspots" | "ownership-risk" | "churn";

export type ComplexityDashboardProps = {
    orgId: string;
    points: ComplexityPoint[];
    hotspotRows: HotspotRow[];
    /** Active in-page tab. Defaults to "overview". */
    activeTab?: ComplexityTab;
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/** Group points by scope, returning the latest point per scope (by date). */
function latestPointsPerScope(points: ComplexityPoint[]): ComplexityPoint[] {
    const byScope = new Map<string, ComplexityPoint[]>();
    for (const p of points) {
        if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
        byScope.get(p.scopeId)!.push(p);
    }
    const latest: ComplexityPoint[] = [];
    for (const [, pts] of byScope) {
        const sorted = [...pts].sort((a, b) => b.date.localeCompare(a.date));
        latest.push(sorted[0]);
    }
    return latest;
}

/**
 * Compute KPI values from GraphQL data.
 *
 * avgComplexity  — mean cyclomaticPerKloc across the LATEST date per repo scope.
 * totalHighComplexity — sum of highComplexityFunctions across latest scope points.
 * hotspotCount   — count of hotspot rows with riskScore > threshold.
 */
export function computeKpis(
    points: ComplexityPoint[],
    hotspotRows: HotspotRow[],
    threshold = 0.5,
): {
    avgComplexity: number | null;
    totalHighComplexity: number;
    hotspotCount: number;
} {
    const latestPerScope = latestPointsPerScope(points);

    const perKlocValues = latestPerScope
        .map((p) => p.cyclomaticPerKloc)
        .filter((v): v is number => v !== null);

    const avgComplexity =
        perKlocValues.length > 0
            ? perKlocValues.reduce((s, v) => s + v, 0) / perKlocValues.length
            : null;

    const totalHighComplexity = latestPerScope.reduce(
        (sum, p) => sum + (p.highComplexityFunctions ?? 0),
        0,
    );

    const hotspotCount = hotspotRows.filter((r) => r.riskScore > threshold).length;

    return { avgComplexity, totalHighComplexity, hotspotCount };
}

/**
 * Count repo scopes whose complexity is rising — latest cyclomaticPerKloc strictly
 * greater than the earliest in-window value for that scope. Real "Rising Areas" KPI.
 */
export function computeRisingAreas(points: ComplexityPoint[]): number {
    const byScope = new Map<string, ComplexityPoint[]>();
    for (const p of points) {
        if (p.cyclomaticPerKloc === null) continue;
        if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
        byScope.get(p.scopeId)!.push(p);
    }
    let rising = 0;
    for (const [, pts] of byScope) {
        if (pts.length < 2) continue;
        const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
        const first = sorted[0].cyclomaticPerKloc;
        const last = sorted[sorted.length - 1].cyclomaticPerKloc;
        if (first !== null && last !== null && last > first) rising += 1;
    }
    return rising;
}

/**
 * Build a hierarchical TreemapNode from hotspot rows.
 * Files are grouped under their repo as parent nodes.
 * Returns null when rows is empty (treemap skipped).
 */
export function buildTreemapData(hotspotRows: HotspotRow[]): TreemapNode | null {
    if (hotspotRows.length === 0) return null;

    const byRepo = new Map<string, HotspotRow[]>();
    for (const row of hotspotRows) {
        if (!byRepo.has(row.repoName)) byRepo.set(row.repoName, []);
        byRepo.get(row.repoName)!.push(row);
    }

    const children: TreemapNode[] = Array.from(byRepo.entries()).map(([repoName, rows]) => ({
        name: repoName,
        value: rows.reduce((sum, r) => sum + r.riskScore, 0),
        children: rows.map((row) => {
            const fileName = row.filePath.split("/").pop() ?? row.filePath;
            return {
                name: fileName,
                value: row.riskScore,
                // Extra fields for tooltip formatter
                filePath: row.filePath,
                cyclomaticAvg: row.cyclomaticAvg,
                churnLoc30d: row.churnLoc30d,
            } as TreemapNode;
        }),
    }));

    return {
        name: "Hotspots",
        value: children.reduce((sum, c) => sum + c.value, 0),
        children,
    };
}

// ---------------------------------------------------------------------------
// Internal: multi-series EChartsOption builder
// ---------------------------------------------------------------------------

type ChartTheme = ReturnType<typeof useChartTheme>;

function buildTrendOption(
    points: ComplexityPoint[],
    chartTheme: ChartTheme,
    chartColors: string[],
): EChartsOption | null {
    if (points.length === 0) return null;

    // Collect all unique dates sorted ascending
    const allDates = [...new Set(points.map((p) => p.date))].sort();

    // Group by scopeId
    const byScope = new Map<string, ComplexityPoint[]>();
    for (const p of points) {
        if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
        byScope.get(p.scopeId)!.push(p);
    }

    // Sort repos by latest cyclomaticPerKloc descending, take top 10
    const sortedScopes = Array.from(byScope.entries())
        .map(([scopeId, pts]) => {
            const latest = pts.reduce((a, b) => (a.date > b.date ? a : b));
            return {
                scopeId,
                pts,
                scopeName: pts[0].scopeName,
                latestValue: latest.cyclomaticPerKloc ?? 0,
            };
        })
        .sort((a, b) => b.latestValue - a.latestValue)
        .slice(0, 10);

    const series = sortedScopes.map(({ scopeName, pts }, idx) => {
        const dataByDate = new Map(pts.map((p) => [p.date, p.cyclomaticPerKloc]));
        return {
            type: "line" as const,
            name: scopeName,
            data: allDates.map((d) => dataByDate.get(d) ?? null),
            smooth: true,
            symbol: "circle",
            symbolSize: 5,
            lineStyle: { width: 2, color: chartColors[idx % chartColors.length] },
            itemStyle: { color: chartColors[idx % chartColors.length] },
            connectNulls: true,
        };
    });

    return {
        tooltip: {
            trigger: "axis",
            confine: true,
            backgroundColor: chartTheme.background,
            borderColor: chartTheme.stroke,
            textStyle: { color: chartTheme.text },
        },
        legend: {
            show: true,
            bottom: 0,
            textStyle: { color: chartTheme.muted, fontSize: 11 },
        },
        grid: { left: 24, right: 16, top: 32, bottom: 56, containLabel: true },
        xAxis: {
            type: "category",
            data: allDates,
            axisTick: { show: false },
            axisLine: { lineStyle: { color: chartTheme.grid } },
            axisLabel: { color: chartTheme.muted },
        },
        yAxis: {
            type: "value",
            name: "Cyclomatic / kloc",
            nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
            splitLine: { lineStyle: { color: chartTheme.grid } },
            axisLabel: { color: chartTheme.muted },
        },
        series,
    } as EChartsOption;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, caption }: { label: string; value: ReactNode; caption: string }) {
    return (
        <article
            className="rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-sm"
            data-testid="kpi-card"
        >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                {label}
            </p>
            <div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div>
            <p className="mt-1 text-xs text-(--ink-muted)">{caption}</p>
        </article>
    );
}

function Panel({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description: string;
    children: ReactNode;
    testId: string;
}) {
    return (
        <section
            className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid={testId}
        >
            <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
            </div>
            {children}
        </section>
    );
}

/** Shared file-table shell so the hotspot / ownership / churn tables stay consistent. */
function FileTable({
    columns,
    children,
    testId,
}: {
    columns: { label: string; align?: "left" | "right" }[];
    children: ReactNode;
    testId: string;
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90) shadow-sm">
            <table className="w-full text-sm" data-testid={testId}>
                <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.label}
                                className={`px-5 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

function EvidenceCell({ url }: { url: string | null }) {
    if (url) {
        return (
            <Link
                href={url}
                className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent) hover:underline"
                data-testid="evidence-link"
            >
                Open evidence →
            </Link>
        );
    }
    return (
        <DataState
            variant="source-unsupported"
            title="No artifact link"
            description="The source did not provide a link for this evidence row."
        />
    );
}

// ---------------------------------------------------------------------------
// Tab views
// ---------------------------------------------------------------------------

function OverviewView({
    points,
    hotspotRows,
    chartTheme,
    chartColors,
}: {
    points: ComplexityPoint[];
    hotspotRows: HotspotRow[];
    chartTheme: ChartTheme;
    chartColors: string[];
}) {
    const { avgComplexity, totalHighComplexity, hotspotCount } = computeKpis(points, hotspotRows);
    const risingAreas = useMemo(() => computeRisingAreas(points), [points]);
    const trendOption = useMemo(
        () => buildTrendOption(points, chartTheme, chartColors),
        [points, chartTheme, chartColors],
    );

    return (
        <div className="flex flex-col gap-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    label="Avg Complexity"
                    value={
                        avgComplexity !== null ? (
                            formatNumber(avgComplexity, { maximumFractionDigits: 2 })
                        ) : (
                            <DataState
                                variant="insufficient-confidence"
                                title="No average"
                                description="Not enough complexity history for an average in this window."
                            />
                        )
                    }
                    caption="cyclomatic / kloc · latest window"
                />
                <KpiCard
                    label="Rising Areas"
                    value={formatNumber(risingAreas)}
                    caption="repos trending up this window"
                />
                <KpiCard
                    label="High-Complexity Functions"
                    value={
                        totalHighComplexity > 0 ? (
                            formatNumber(totalHighComplexity)
                        ) : (
                            <DataState
                                variant="detector-enabled-no-findings"
                                title="None above threshold"
                                description="No functions crossed the complexity threshold."
                            />
                        )
                    }
                    caption="functions above threshold across repos"
                />
                <KpiCard
                    label="Hotspot Files"
                    value={
                        hotspotCount > 0 ? (
                            formatNumber(hotspotCount)
                        ) : (
                            <DataState
                                variant="detector-enabled-no-findings"
                                title="No hotspots"
                                description="No files crossed the hotspot risk threshold."
                            />
                        )
                    }
                    caption="files with risk score > 0.5"
                />
            </section>

            {trendOption ? (
                <Panel
                    title="Complexity trend"
                    description="Cyclomatic complexity per kloc over time — top repos by latest score."
                    testId="trend-panel"
                >
                    <Chart
                        option={trendOption}
                        style={{ height: 320 }}
                        chartTheme={chartTheme}
                        chartColors={chartColors}
                    />
                </Panel>
            ) : (
                <Panel
                    title="Complexity trend"
                    description="Cyclomatic complexity per kloc over time."
                    testId="trend-panel-empty"
                >
                    <DataState
                        variant="insufficient-confidence"
                        title="No complexity history"
                        description="Trend appears once complexity analysis has run for repos in this window."
                    />
                </Panel>
            )}
        </div>
    );
}

function HotspotsView({ hotspotRows }: { hotspotRows: HotspotRow[] }) {
    const treemapData = useMemo(() => buildTreemapData(hotspotRows), [hotspotRows]);
    const top20 = useMemo(
        () => [...hotspotRows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 20),
        [hotspotRows],
    );

    if (hotspotRows.length === 0) {
        return (
            <Panel
                title="File hotspots"
                description="Files sized by risk score (churn × complexity × ownership)."
                testId="hotspot-panel-empty"
            >
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No hotspot files"
                    description="No files crossed the hotspot risk threshold for this scope and window."
                />
            </Panel>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {treemapData && (
                <Panel
                    title="File hotspots"
                    description="Files sized by risk score (churn × complexity × ownership concentration). Grouped by repo."
                    testId="hotspot-panel"
                >
                    <TreemapChart
                        data={treemapData}
                        unit="risk"
                        height={400}
                        tooltipFormatterAction={(params: unknown, _total, unit) => {
                            const p = params as {
                                data?: {
                                    name?: string;
                                    value?: number;
                                    cyclomaticAvg?: number;
                                    churnLoc30d?: number;
                                    filePath?: string;
                                };
                            };
                            const node = p.data;
                            if (!node?.name) return "";
                            const lines = [`<strong>${node.filePath ?? node.name}</strong>`];
                            if (typeof node.value === "number") {
                                lines.push(
                                    `Risk score: ${formatNumber(node.value, { maximumFractionDigits: 3 })} ${unit}`,
                                );
                            }
                            if (typeof node.cyclomaticAvg === "number") {
                                lines.push(`Cyclomatic avg: ${formatNumber(node.cyclomaticAvg)}`);
                            }
                            if (typeof node.churnLoc30d === "number") {
                                lines.push(`Churn LOC 30d: ${formatNumber(node.churnLoc30d)}`);
                            }
                            return lines.join("<br/>");
                        }}
                    />
                </Panel>
            )}

            <section data-testid="drilldown-table">
                <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold tracking-tight">Top hotspot files</h2>
                    <p className="text-xs text-(--ink-muted)">
                        sorted by risk score · top {top20.length}
                    </p>
                </div>
                <FileTable
                    testId="hotspot-table"
                    columns={[
                        { label: "File" },
                        { label: "Repo" },
                        { label: "Risk score", align: "right" },
                        { label: "Cyclomatic avg", align: "right" },
                        { label: "Churn LOC 30d", align: "right" },
                        { label: "Evidence" },
                    ]}
                >
                    {top20.map((row) => {
                        const fileName = row.filePath.split("/").pop() ?? row.filePath;
                        return (
                            <tr
                                key={`${row.repoId}-${row.filePath}`}
                                data-testid="hotspot-row"
                                className="border-t border-(--card-stroke)/60 hover:bg-(--card-60)/60"
                            >
                                <td
                                    className="px-5 py-3 align-middle font-medium font-mono text-[0.82em]"
                                    title={row.filePath}
                                >
                                    {fileName}
                                </td>
                                <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                    {row.repoName}
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">
                                    {formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">
                                    {formatNumber(row.cyclomaticAvg)}
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">
                                    {formatNumber(row.churnLoc30d)}
                                </td>
                                <td className="px-5 py-3">
                                    <EvidenceCell url={row.evidenceUrl} />
                                </td>
                            </tr>
                        );
                    })}
                </FileTable>
            </section>
        </div>
    );
}

function OwnershipRiskView({ hotspotRows }: { hotspotRows: HotspotRow[] }) {
    const ranked = useMemo(
        () =>
            hotspotRows
                .filter((r): r is HotspotRow & { blameConcentration: number } =>
                    Number.isFinite(r.blameConcentration as number),
                )
                .sort((a, b) => b.blameConcentration - a.blameConcentration)
                .slice(0, 20),
        [hotspotRows],
    );

    if (ranked.length === 0) {
        return (
            <Panel
                title="Ownership risk"
                description="Files where changes concentrate in a single owner (bus-factor risk)."
                testId="ownership-panel-empty"
            >
                <DataState
                    variant="source-unsupported"
                    title="No ownership data"
                    description="Blame/ownership concentration is not available for files in this window. Connect a Git provider with full commit history to populate it."
                />
            </Panel>
        );
    }

    return (
        <Panel
            title="Ownership risk"
            description="Files ranked by blame concentration — higher means changes funnel through fewer owners (single-owner / bus-factor risk)."
            testId="ownership-panel"
        >
            <FileTable
                testId="ownership-table"
                columns={[
                    { label: "File" },
                    { label: "Repo" },
                    { label: "Owner concentration", align: "right" },
                    { label: "Risk score", align: "right" },
                    { label: "Evidence" },
                ]}
            >
                {ranked.map((row) => {
                    const fileName = row.filePath.split("/").pop() ?? row.filePath;
                    const pct = Math.round(row.blameConcentration * 100);
                    return (
                        <tr
                            key={`${row.repoId}-${row.filePath}`}
                            data-testid="ownership-row"
                            className="border-t border-(--card-stroke)/60 hover:bg-(--card-60)/60"
                        >
                            <td
                                className="px-5 py-3 align-middle font-medium font-mono text-[0.82em]"
                                title={row.filePath}
                            >
                                {fileName}
                            </td>
                            <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                {row.repoName}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">{pct}%</td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-5 py-3">
                                <EvidenceCell url={row.evidenceUrl} />
                            </td>
                        </tr>
                    );
                })}
            </FileTable>
        </Panel>
    );
}

function ChurnView({ hotspotRows }: { hotspotRows: HotspotRow[] }) {
    const ranked = useMemo(
        () => [...hotspotRows].sort((a, b) => b.churnLoc30d - a.churnLoc30d).slice(0, 20),
        [hotspotRows],
    );
    const maxChurn = ranked.length > 0 ? Math.max(...ranked.map((r) => r.churnLoc30d), 1) : 1;
    const hasChurn = ranked.some((r) => r.churnLoc30d > 0);

    if (!hasChurn) {
        return (
            <Panel
                title="Churn"
                description="Files by lines changed over the last 30 days."
                testId="churn-panel-empty"
            >
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No churn in this window"
                    description="No file change volume was recorded for this scope and window."
                />
            </Panel>
        );
    }

    return (
        <Panel
            title="Churn"
            description="Files ranked by lines changed over the last 30 days — high churn on complex files is where risk compounds."
            testId="churn-panel"
        >
            <FileTable
                testId="churn-table"
                columns={[
                    { label: "File" },
                    { label: "Repo" },
                    { label: "Churn LOC 30d", align: "right" },
                    { label: "Commits 30d", align: "right" },
                    { label: "Risk score", align: "right" },
                ]}
            >
                {ranked.map((row) => {
                    const fileName = row.filePath.split("/").pop() ?? row.filePath;
                    const width = `${Math.max(2, Math.round((row.churnLoc30d / maxChurn) * 100))}%`;
                    return (
                        <tr
                            key={`${row.repoId}-${row.filePath}`}
                            data-testid="churn-row"
                            className="border-t border-(--card-stroke)/60 hover:bg-(--card-60)/60"
                        >
                            <td
                                className="px-5 py-3 align-middle font-medium font-mono text-[0.82em]"
                                title={row.filePath}
                            >
                                {fileName}
                            </td>
                            <td className="px-5 py-3 align-middle text-(--ink-muted)">
                                {row.repoName}
                            </td>
                            <td className="px-5 py-3 align-middle">
                                <div className="flex items-center justify-end gap-3">
                                    <span
                                        aria-hidden
                                        className="h-2 rounded-full bg-(--accent)/70"
                                        style={{ width }}
                                    />
                                    <span className="tabular-nums">
                                        {formatNumber(row.churnLoc30d)}
                                    </span>
                                </div>
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(row.churnCommits30d)}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums">
                                {formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                            </td>
                        </tr>
                    );
                })}
            </FileTable>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ComplexityDashboard({
    orgId,
    points,
    hotspotRows,
    activeTab = "overview",
}: ComplexityDashboardProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();

    const isEmpty = points.length === 0 && hotspotRows.length === 0;

    if (isEmpty) {
        return (
            <section
                className="rounded-2xl border border-(--card-stroke) bg-card p-8 shadow-sm"
                data-testid="empty-state"
            >
                <h2 className="text-2xl font-semibold tracking-tight">
                    No complexity history in this window.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-muted)">
                    Complexity data appears once{" "}
                    <code className="font-mono text-[0.85em]">dev-hops metrics daily</code> has
                    processed at least one complexity analysis run for this org. The page populates
                    automatically on the next metrics run.
                </p>
                <p className="mt-2 text-xs text-(--ink-muted)">
                    Org <span className="font-mono">{orgId}</span>
                </p>
            </section>
        );
    }

    return (
        <div className="flex flex-col gap-6" data-testid="complexity-dashboard">
            {activeTab === "hotspots" ? (
                <HotspotsView hotspotRows={hotspotRows} />
            ) : activeTab === "ownership-risk" ? (
                <OwnershipRiskView hotspotRows={hotspotRows} />
            ) : activeTab === "churn" ? (
                <ChurnView hotspotRows={hotspotRows} />
            ) : (
                <OverviewView
                    points={points}
                    hotspotRows={hotspotRows}
                    chartTheme={chartTheme}
                    chartColors={chartColors}
                />
            )}
        </div>
    );
}

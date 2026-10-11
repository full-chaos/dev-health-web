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
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { CTA_LABELS } from "@/lib/design/cta";
import type { ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";

import { Chart } from "@/components/charts/Chart";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { buildTooltip, lineMark, withPointSymbols } from "@/components/charts/chartConventions";
import { HotspotColumnTreemap } from "@/components/complexity/HotspotColumnTreemap";
import type { TreemapNode } from "@/components/charts/TreemapChart";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { Button } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { StatusPill } from "@/components/admin/StatusPill";
import { Section } from "@/components/ui/Section";
import { Notice } from "@/components/ui/Notice";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { echarts } from "@/lib/echartsInit";
import { computeKpis, computeRisingAreas } from "./complexityKpis";

export { computeKpis, computeRisingAreas };
import { formatNumber } from "@/lib/formatters";
import { appHref } from "@/lib/navigation/appPath";
import type { HeatmapResponse, MetricFilter } from "@/lib/types";

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

/** The hotspot-concentration heatmap the page read for the Hotspots tab (served values only). */
export type HotspotHeatmapProps = {
    request: {
        type: "risk";
        metric: string;
        scope_type: string;
        scope_id?: string;
        range_days: number;
        start_date?: string;
        end_date?: string;
    };
    /** ok = served; unavailable = nothing served; failed = the read threw. */
    state: "ok" | "unavailable" | "failed";
    data: HeatmapResponse | null;
    summary?: string;
    /** The page filter: a repository in `what.repos` gets the "Not filtered by repository" note. */
    filters?: MetricFilter;
};

export type ComplexityDashboardProps = {
    orgId: string;
    points: ComplexityPoint[];
    hotspotRows: HotspotRow[];
    /** Active in-page tab. Defaults to "overview". */
    activeTab?: ComplexityTab;
    /** Days in the selected window; the Churn tab says so when it differs from its fixed 30 days. */
    windowDays?: number;
    /** Hotspots tab only: the heatmap moved here from the Code page. */
    hotspotHeatmap?: HotspotHeatmapProps;
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

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

export function buildTrendOption(
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
            // Per-item size and ring keep the legend glyph as it was (static series size, no series ring).
            data: withPointSymbols(
                allDates.map((d) => dataByDate.get(d) ?? null),
                chartTheme,
                { connectNulls: true },
            ),
            smooth: true,
            symbol: "circle",
            symbolSize: 5,
            showAllSymbol: true,
            lineStyle: { ...lineMark, color: chartColors[idx % chartColors.length] },
            itemStyle: { color: chartColors[idx % chartColors.length] },
            connectNulls: true,
        };
    });

    return {
        tooltip: buildTooltip(chartTheme, { crosshair: true }),
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

/**
 * One tile of the overview strip. A value that is not served reads "Not reported" (the tile's own
 * text) and the caption says why; a served 0 stays 0.
 */
function KpiCard({
    label,
    value,
    caption,
    emptyReason,
}: {
    label: string;
    value?: string;
    caption: string;
    emptyReason?: string;
}) {
    return (
        <MetricCard
            testId="kpi-card"
            label={label}
            valueText={value}
            hideTrend
            deltaSlot={<span>{value === undefined ? (emptyReason ?? caption) : caption}</span>}
        />
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
        <Section title={title} description={description} data-testid={testId}>
            {children}
        </Section>
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
        <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid={testId}>
                <thead className="text-label-caps uppercase text-(--ink-muted)">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.label}
                                className={`px-3 py-2.5 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}
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

/**
 * The Evidence cell of a file row. It opens the shared evidence drawer for the file: the row's
 * served values as fact rows, and the served evidence link in the drawer footer.
 */
function EvidenceCell({ row }: { row: HotspotRow }) {
    const evidence = useEvidenceDrawer();
    const url = row.evidenceUrl;
    if (url) {
        const fileName = row.filePath.split("/").pop() ?? row.filePath;
        return (
            <Button
                variant="ghost"
                size="sm"
                icon={<ArrowRight />}
                aria-label={`Evidence for ${fileName}`}
                onClick={() =>
                    evidence.open({
                        title: fileName,
                        content: <HotspotEvidence row={row} />,
                        footer: (
                            <Link
                                // CHAOS-9209: a served URL goes through appHref.
                                href={appHref(url)}
                                data-testid="evidence-link"
                                onClick={evidence.close}
                                className="flex w-full items-center justify-center rounded-xl border border-(--accent-2)/20 bg-(--accent-2)/10 px-4 py-3 text-sm font-medium text-(--info) transition-colors hover:bg-(--accent-2)/20"
                            >
                                {CTA_LABELS.openEvidence} ↗
                            </Link>
                        ),
                    })
                }
                data-testid="evidence-open"
            >
                {CTA_LABELS.evidence}
            </Button>
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

/** The drawer body for one file row: the values the hotspots query served for it. */
function HotspotEvidence({ row }: { row: HotspotRow }) {
    return (
        <div className="space-y-4">
            <EvidenceFactList aria-label="File" testId="evidence-subject-facts">
                <EvidenceFact
                    label="File"
                    stacked
                    value={<span className="break-all font-mono font-medium">{row.filePath}</span>}
                />
                <EvidenceFact label="Repository" value={row.repoName || undefined} />
                <EvidenceFact
                    label="Risk score"
                    value={formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                />
                <EvidenceFact label="Cyclomatic avg" value={formatNumber(row.cyclomaticAvg)} />
                <EvidenceFact label="Churn LOC 30d" value={formatNumber(row.churnLoc30d)} />
                <EvidenceFact
                    label="Owner concentration"
                    value={
                        row.blameConcentration === null
                            ? undefined
                            : `${Math.round(row.blameConcentration * 100)}%`
                    }
                />
            </EvidenceFactList>
        </div>
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
            <MetricStrip data-testid="complexity-kpis">
                <KpiCard
                    label="Avg Complexity"
                    value={
                        avgComplexity !== null
                            ? formatNumber(avgComplexity, { maximumFractionDigits: 2 })
                            : undefined
                    }
                    caption="cyclomatic / kloc · latest window"
                    emptyReason="Not enough complexity history for an average in this window."
                />
                <KpiCard
                    label="Rising Areas"
                    value={formatNumber(risingAreas)}
                    caption="repos trending up this window"
                />
                <KpiCard
                    label="High-Complexity Functions"
                    value={totalHighComplexity > 0 ? formatNumber(totalHighComplexity) : undefined}
                    caption="functions above threshold across repos"
                    emptyReason="None above threshold: no functions crossed the complexity threshold."
                />
                <KpiCard
                    label="Hotspot Files"
                    value={hotspotCount > 0 ? formatNumber(hotspotCount) : undefined}
                    caption="files with risk score > 0.5"
                    emptyReason="No hotspots: no files crossed the hotspot risk threshold."
                />
            </MetricStrip>

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

function HotspotHeatmapSection({ heatmap }: { heatmap: HotspotHeatmapProps }) {
    const emptyState = "Hotspot heatmap unavailable.";
    const unit = heatmap.data?.legend?.unit;
    return (
        <Section
            title="Hotspot concentration"
            description="Where churn and ownership load accumulate over time."
            data-testid="hotspot-heatmap-section"
            action={
                unit ? (
                    <StatusPill tone="info" testId="heatmap-unit">
                        {unit}
                    </StatusPill>
                ) : undefined
            }
        >
            <HeatmapPanel
                title="Hotspot concentration"
                description="Where churn and ownership load accumulate over time."
                request={heatmap.request}
                filters={heatmap.filters}
                initialData={heatmap.data}
                emptyState={emptyState}
                embedded
                failed={heatmap.state === "failed"}
                evidenceTitle="Hotspot evidence"
                defaultSummary={heatmap.summary}
                flatStateLabel="No hotspot variance in this window — churn is evenly spread, so no single area stands out yet."
            />
        </Section>
    );
}

function HotspotsView({
    hotspotRows,
    heatmap,
}: {
    hotspotRows: HotspotRow[];
    heatmap?: HotspotHeatmapProps;
}) {
    const treemapData = useMemo(() => buildTreemapData(hotspotRows), [hotspotRows]);
    const top20 = useMemo(
        () => [...hotspotRows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 20),
        [hotspotRows],
    );

    if (hotspotRows.length === 0) {
        return (
            <div className="flex flex-col gap-6">
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
                {heatmap ? <HotspotHeatmapSection heatmap={heatmap} /> : null}
            </div>
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
                    <HotspotColumnTreemap data={treemapData} />
                </Panel>
            )}

            <Section
                data-testid="drilldown-table"
                title="Top hotspot files"
                description={`sorted by risk score · top ${top20.length}`}
            >
                <FileTable
                    testId="hotspot-table"
                    columns={[
                        { label: "File" },
                        { label: "Repository" },
                        { label: "Risk score", align: "right" },
                        { label: "Cyclomatic avg", align: "right" },
                        { label: "Churn LOC 30d", align: "right" },
                        { label: CTA_LABELS.evidence },
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
                                    className="px-3 py-2.5 align-middle font-medium font-mono text-[0.82em]"
                                    title={row.filePath}
                                >
                                    {fileName}
                                </td>
                                <td className="px-3 py-2.5 align-middle text-(--ink-muted)">
                                    {row.repoName}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                    {formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                    {formatNumber(row.cyclomaticAvg)}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                    {formatNumber(row.churnLoc30d)}
                                </td>
                                <td className="px-3 py-2.5">
                                    <EvidenceCell row={row} />
                                </td>
                            </tr>
                        );
                    })}
                </FileTable>
            </Section>

            {heatmap ? <HotspotHeatmapSection heatmap={heatmap} /> : null}
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
                    { label: "Repository" },
                    { label: "Owner concentration", align: "right" },
                    { label: "Risk score", align: "right" },
                    { label: CTA_LABELS.evidence },
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
                                className="px-3 py-2.5 align-middle font-medium font-mono text-[0.82em]"
                                title={row.filePath}
                            >
                                {fileName}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-(--ink-muted)">
                                {row.repoName}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{pct}%</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                                {formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2.5">
                                <EvidenceCell row={row} />
                            </td>
                        </tr>
                    );
                })}
            </FileTable>
        </Panel>
    );
}

const CHURN_WINDOW_DAYS = 30;

/** The churn and commit counts come from a fixed 30-day field, not from the page window. */
function ChurnWindowNotice({ windowDays }: { windowDays?: number }) {
    const differs = windowDays !== undefined && windowDays !== CHURN_WINDOW_DAYS;
    return (
        <Notice variant="info" live={false} data-testid="churn-window-notice">
            <strong>Panel window: {CHURN_WINDOW_DAYS} days.</strong> Churn and commit counts use the
            panel&apos;s source window
            {differs ? `, even though the selected window is ${windowDays} days` : ""}.
        </Notice>
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
                    { label: "Repository" },
                    { label: "Churn LOC 30d", align: "right" },
                    { label: "Commits 30d", align: "right" },
                    { label: "Risk score", align: "right" },
                    { label: CTA_LABELS.evidence },
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
                                className="px-3 py-2.5 align-middle font-medium font-mono text-[0.82em]"
                                title={row.filePath}
                            >
                                {fileName}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-(--ink-muted)">
                                {row.repoName}
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                                <div className="flex items-center justify-end gap-3">
                                    <span
                                        aria-hidden
                                        className="h-2 rounded-r-(--radius-sm) bg-(--chart-color-1)"
                                        style={{ width }}
                                    />
                                    <span className="tabular-nums">
                                        {formatNumber(row.churnLoc30d)}
                                    </span>
                                </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                                {formatNumber(row.churnCommits30d)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                                {formatNumber(row.riskScore, { maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2.5">
                                <EvidenceCell row={row} />
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
    points,
    hotspotRows,
    activeTab = "overview",
    windowDays,
    hotspotHeatmap,
}: ComplexityDashboardProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();

    const isEmpty = points.length === 0 && hotspotRows.length === 0;

    if (isEmpty) {
        return (
            <div className="flex flex-col gap-6">
                <section
                    className="rounded-2xl border border-(--card-stroke) bg-card p-8 shadow-sm"
                    data-testid="empty-state"
                >
                    <h2 className="text-2xl font-semibold tracking-tight">
                        No complexity history in this window.
                    </h2>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-muted)">
                        Complexity data appears once the daily metrics job has processed at least
                        one complexity analysis run for this org. The page populates automatically
                        on the next metrics run.
                    </p>
                </section>

                {activeTab === "hotspots" && hotspotHeatmap ? (
                    <HotspotHeatmapSection heatmap={hotspotHeatmap} />
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6" data-testid="complexity-dashboard">
            {activeTab === "hotspots" ? (
                <HotspotsView hotspotRows={hotspotRows} heatmap={hotspotHeatmap} />
            ) : activeTab === "ownership-risk" ? (
                <OwnershipRiskView hotspotRows={hotspotRows} />
            ) : activeTab === "churn" ? (
                <>
                    <ChurnWindowNotice windowDays={windowDays} />
                    <ChurnView hotspotRows={hotspotRows} />
                </>
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

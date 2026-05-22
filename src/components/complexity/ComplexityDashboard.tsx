/**
 * ComplexityDashboard — client surface for /complexity (CHAOS-1745).
 *
 * Renders:
 *   1. KPI tiles: avg cyclomaticPerKloc, total high-complexity functions, hotspot count.
 *   2. Trend panel: multi-series line chart (cyclomaticPerKloc per top-N repos).
 *   3. Hotspot panel: TreemapChart — files sized by riskScore, grouped by repo.
 *   4. Drilldown table: top 20 hotspot files with evidenceUrl links.
 *   5. Empty state mirroring CompoundingRiskDashboard voice.
 *
 * Pure helper functions (computeKpis, buildTreemapData) are exported for unit
 * testing without DOM rendering.
 */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";

import { Chart } from "@/components/charts/Chart";
import { TreemapChart } from "@/components/charts/TreemapChart";
import type { TreemapNode } from "@/components/charts/TreemapChart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { echarts } from "@/lib/echartsInit";

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

export type ComplexityDashboardProps = {
  orgId: string;
  points: ComplexityPoint[];
  hotspotRows: HotspotRow[];
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

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
  // Group points by scopeId, keep latest date per scope.
  const byScope = new Map<string, ComplexityPoint[]>();
  for (const p of points) {
    if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
    byScope.get(p.scopeId)!.push(p);
  }

  const latestPerScope: ComplexityPoint[] = [];
  for (const [, pts] of byScope) {
    const sorted = [...pts].sort((a, b) => b.date.localeCompare(a.date));
    latestPerScope.push(sorted[0]);
  }

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

  const children: TreemapNode[] = Array.from(byRepo.entries()).map(
    ([repoName, rows]) => ({
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
    }),
  );

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

function KpiCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <article
      className="rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-sm"
      data-testid="kpi-card"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-(--ink-muted)">{caption}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ComplexityDashboard({
  orgId,
  points,
  hotspotRows,
}: ComplexityDashboardProps) {
  const chartTheme = useChartTheme();
  const chartColors = useChartColors();

  const { avgComplexity, totalHighComplexity, hotspotCount } = computeKpis(
    points,
    hotspotRows,
  );

  const treemapData = useMemo(() => buildTreemapData(hotspotRows), [hotspotRows]);

  const trendOption = useMemo(
    () => buildTrendOption(points, chartTheme, chartColors),
    [points, chartTheme, chartColors],
  );

  const isEmpty = points.length === 0 && hotspotRows.length === 0;
  const top20Hotspots = useMemo(
    () => [...hotspotRows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 20),
    [hotspotRows],
  );

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
          <code className="font-mono text-[0.85em]">dev-hops metrics daily</code>{" "}
          has processed at least one complexity analysis run for this org. The
          page populates automatically on the next metrics run.
        </p>
        <p className="mt-2 text-xs text-(--ink-muted)">
          Org <span className="font-mono">{orgId}</span>
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="complexity-dashboard">
      {/* KPI tiles */}
      <section className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          label="Avg Complexity"
          value={avgComplexity !== null ? avgComplexity.toFixed(2) : "—"}
          caption="cyclomatic / kloc · latest window"
        />
        <KpiCard
          label="High-Complexity Functions"
          value={
            totalHighComplexity > 0
              ? totalHighComplexity.toLocaleString()
              : "—"
          }
          caption="functions above threshold across repos"
        />
        <KpiCard
          label="Hotspot Files"
          value={hotspotCount > 0 ? hotspotCount.toLocaleString() : "—"}
          caption="files with risk score > 0.5"
        />
      </section>

      {/* Trend panel — multi-series cyclomaticPerKloc over time */}
      {trendOption && (
        <section
          className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
          data-testid="trend-panel"
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">
              Complexity trend
            </h2>
            <p className="mt-1 text-sm text-(--ink-muted)">
              Cyclomatic complexity per kloc over time — top repos by latest
              score.
            </p>
          </div>
          <Chart
            option={trendOption}
            style={{ height: 320 }}
            chartTheme={chartTheme}
            chartColors={chartColors}
          />
        </section>
      )}

      {/* Hotspot treemap — files sized by riskScore, grouped by repo */}
      {treemapData && (
        <section
          className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
          data-testid="hotspot-panel"
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">
              File hotspots
            </h2>
            <p className="mt-1 text-sm text-(--ink-muted)">
              Files sized by risk score (churn × complexity × ownership
              concentration). Grouped by repo.
            </p>
          </div>
          <TreemapChart
            data={treemapData}
            unit="risk"
            height={400}
            tooltipFormatter={(params, _total, unit) => {
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
              const lines = [
                `<strong>${node.filePath ?? node.name}</strong>`,
              ];
              if (typeof node.value === "number") {
                lines.push(`Risk score: ${node.value.toFixed(3)} ${unit}`);
              }
              if (typeof node.cyclomaticAvg === "number") {
                lines.push(`Cyclomatic avg: ${node.cyclomaticAvg.toFixed(1)}`);
              }
              if (typeof node.churnLoc30d === "number") {
                lines.push(
                  `Churn LOC 30d: ${node.churnLoc30d.toLocaleString()}`,
                );
              }
              return lines.join("<br/>");
            }}
          />
        </section>
      )}

      {/* Drilldown table — top 20 hotspot files */}
      {top20Hotspots.length > 0 && (
        <section data-testid="drilldown-table">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Top hotspot files
            </h2>
            <p className="text-xs text-(--ink-muted)">
              sorted by risk score · top {top20Hotspots.length}
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90) shadow-sm">
            <table className="w-full text-sm" data-testid="hotspot-table">
              <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                <tr>
                  <th className="px-5 py-3 text-left">File</th>
                  <th className="px-5 py-3 text-left">Repo</th>
                  <th className="px-5 py-3 text-right">Risk score</th>
                  <th className="px-5 py-3 text-right">Cyclomatic avg</th>
                  <th className="px-5 py-3 text-right">Churn LOC 30d</th>
                  <th className="px-5 py-3 text-left">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {top20Hotspots.map((row, idx) => {
                  const fileName =
                    row.filePath.split("/").pop() ?? row.filePath;
                  return (
                    <tr
                      key={`${row.repoId}-${row.filePath}-${idx}`}
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
                        {row.riskScore.toFixed(3)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {row.cyclomaticAvg.toFixed(1)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {row.churnLoc30d.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        {row.evidenceUrl ? (
                          <Link
                            href={row.evidenceUrl}
                            className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent) hover:underline"
                            data-testid="evidence-link"
                          >
                            Open →
                          </Link>
                        ) : (
                          <span className="text-xs text-(--ink-muted)">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

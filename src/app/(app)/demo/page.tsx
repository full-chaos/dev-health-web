"use client";

import { useMemo, useState } from "react";

import { ChordChart } from "@/components/charts/ChordChart";
import {
  ChordChartControls,
  CHORD_CONTROLS_DEFAULTS,
  type ChordControlsValue,
} from "@/components/charts/ChordChartControls";
import { ChordSummaryPanel } from "@/components/charts/ChordSummaryPanel";
import { DonutChart } from "@/components/charts/DonutChart";
import { FlameDiagram } from "@/components/charts/FlameDiagram";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { NestedPieChart2D } from "@/components/charts/NestedPieChart2D";
import { NestedPieChart3D } from "@/components/charts/NestedPieChart3D";
import { QuadrantChart } from "@/components/charts/QuadrantChart";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { VerticalBarChart } from "@/components/charts/VerticalBarChart";
import {
  WorkGraphExplorer,
  WorkGraphLegend,
} from "@/components/charts/WorkGraphExplorer";
import type { WorkGraphEdge } from "@/lib/graphql/types";
import {
  sampleChordRepoTransfer,
  sampleChordTeamReviewLoad,
  sampleChordWorkTypeRework,
  sankeyStateTransitionSample,
  workItemFlowEfficiencyDailySample,
  workItemMetricsDailySample,
  workItemTypeByScopeSample,
  workItemTypeSummarySample,
} from "@/data/devHealthOpsSample";
import {
  toNestedPieData,
  toSankeyData,
  toSparklineSeries,
  toTeamEfficiencyBarSeries,
  toThroughputBarSeries,
  toWorkItemTypeDonutData,
} from "@/lib/chartTransforms";
import { buildChordDataset } from "@/lib/chord";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";
import type { FlameFrame, HeatmapResponse, QuadrantResponse } from "@/lib/types";

export default function Home() {
  const [chordControls, setChordControls] = useState<ChordControlsValue>(
    CHORD_CONTROLS_DEFAULTS
  );

  const teamDataset = useMemo(
    () =>
      buildChordDataset(sampleChordTeamReviewLoad, {
        topN: chordControls.topN,
        includeSelfLinks: chordControls.showSelfLinks,
        direction: chordControls.direction,
        grouping: chordControls.grouping,
        unit: "reviews",
      }),
    [chordControls]
  );

  const repoDataset = useMemo(
    () =>
      buildChordDataset(sampleChordRepoTransfer, {
        topN: 8,
        includeSelfLinks: false,
        direction: "bilateral",
        grouping: "repo",
        unit: "transfers",
      }),
    []
  );

  const workTypeDataset = useMemo(
    () =>
      buildChordDataset(sampleChordWorkTypeRework, {
        topN: 8,
        includeSelfLinks: true,
        direction: "bilateral",
        grouping: "work_type",
        unit: "items",
      }),
    []
  );
  const throughput = toThroughputBarSeries(workItemMetricsDailySample, {
    scopeOrder: ["auth", "api", "ui", "data", "ops", "docs"],
  });
  const efficiency = toTeamEfficiencyBarSeries(workItemFlowEfficiencyDailySample);
  const sparkline = toSparklineSeries(workItemMetricsDailySample, {
    workScopeId: "auth",
  });
  const donut = toWorkItemTypeDonutData(workItemTypeSummarySample);
  const nestedPie = toNestedPieData(workItemTypeByScopeSample);
  const sankey = toSankeyData(sankeyStateTransitionSample);
  const heatmapAxesX = ["09", "10", "11", "12", "13", "14", "15", "16", "17"];
  const heatmapAxesY = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const heatmapValues = [
    [0.4, 0.6, 1.2, 1.6, 1.4, 1.1, 0.9, 0.7, 0.5],
    [0.5, 0.8, 1.4, 1.9, 1.6, 1.2, 1.0, 0.8, 0.6],
    [0.3, 0.5, 1.0, 1.4, 1.3, 1.1, 1.0, 0.9, 0.7],
    [0.6, 0.9, 1.6, 2.1, 1.8, 1.4, 1.2, 1.0, 0.8],
    [0.7, 1.0, 1.5, 2.2, 2.0, 1.6, 1.3, 1.1, 0.9],
  ];
  const heatmapCells = heatmapAxesY.flatMap((day, rowIdx) =>
    heatmapAxesX.map((hour, colIdx) => ({
      x: hour,
      y: day,
      value: heatmapValues[rowIdx][colIdx],
    }))
  );
  const heatmapData: HeatmapResponse = {
    axes: { x: heatmapAxesX, y: heatmapAxesY },
    cells: heatmapCells,
    legend: { unit: "hours", scale: "linear" },
  };
  const icHeatmapCells = heatmapAxesY.flatMap((day, rowIdx) =>
    heatmapAxesX.map((hour, colIdx) => ({
      x: hour,
      y: day,
      value: Number((heatmapValues[rowIdx][colIdx] * 0.6).toFixed(2)),
    }))
  );
  const icHeatmapData: HeatmapResponse = {
    axes: { x: heatmapAxesX, y: heatmapAxesY },
    cells: icHeatmapCells,
    legend: { unit: "commits", scale: "linear" },
  };
  const flameStart = "2025-02-15T09:00:00Z";
  const flameEnd = "2025-02-16T12:00:00Z";
  const flameFrames: FlameFrame[] = [
    {
      id: "root",
      parent_id: null,
      label: "PR lifecycle",
      start: flameStart,
      end: flameEnd,
      state: "active",
      category: "planned",
    },
    {
      id: "wait",
      parent_id: "root",
      label: "Review waiting",
      start: flameStart,
      end: "2025-02-15T15:00:00Z",
      state: "waiting",
      category: "planned",
    },
    {
      id: "review",
      parent_id: "root",
      label: "Review and merge",
      start: "2025-02-15T15:00:00Z",
      end: flameEnd,
      state: "active",
      category: "planned",
    },
    {
      id: "rework",
      parent_id: "review",
      label: "Rework loop",
      start: "2025-02-15T18:00:00Z",
      end: "2025-02-15T22:00:00Z",
      state: "active",
      category: "rework",
    },
  ];
  const icFlameFrames: FlameFrame[] = [
    {
      id: "root-ic",
      parent_id: null,
      label: "Issue focus",
      start: flameStart,
      end: flameEnd,
      state: "active",
      category: "planned",
    },
    {
      id: "deep",
      parent_id: "root-ic",
      label: "Deep work",
      start: flameStart,
      end: "2025-02-15T12:30:00Z",
      state: "active",
      category: "planned",
    },
    {
      id: "interrupt",
      parent_id: "root-ic",
      label: "Interrupt handling",
      start: "2025-02-15T12:30:00Z",
      end: "2025-02-15T14:00:00Z",
      state: "waiting",
      category: "unplanned",
    },
    {
      id: "review",
      parent_id: "root-ic",
      label: "Review wait",
      start: "2025-02-15T14:00:00Z",
      end: "2025-02-15T20:00:00Z",
      state: "waiting",
      category: "planned",
    },
    {
      id: "close",
      parent_id: "root-ic",
      label: "Finish and close",
      start: "2025-02-15T20:00:00Z",
      end: flameEnd,
      state: "active",
      category: "planned",
    },
  ];
  const quadrantData: QuadrantResponse = {
    axes: {
      x: { metric: "churn", label: "Churn", unit: "%" },
      y: { metric: "throughput", label: "Throughput", unit: "items" },
    },
    points: [
      {
        entity_id: "core",
        entity_label: "Core",
        x: 12,
        y: 28,
        window_start: "2025-01-01",
        window_end: "2025-01-07",
        evidence_link: "/api/v1/explain?metric=throughput",
        trajectory: [
          { x: 10, y: 22, window: "W-3" },
          { x: 11, y: 25, window: "W-2" },
          { x: 12, y: 28, window: "W-1" },
        ],
      },
      {
        entity_id: "platform",
        entity_label: "Platform",
        x: 22,
        y: 18,
        window_start: "2025-01-01",
        window_end: "2025-01-07",
        evidence_link: "/api/v1/explain?metric=churn",
        trajectory: [
          { x: 18, y: 16, window: "W-3" },
          { x: 20, y: 17, window: "W-2" },
          { x: 22, y: 18, window: "W-1" },
        ],
      },
      {
        entity_id: "growth",
        entity_label: "Growth",
        x: 6,
        y: 32,
        window_start: "2025-01-01",
        window_end: "2025-01-07",
        evidence_link: "/api/v1/explain?metric=throughput",
        trajectory: [
          { x: 8, y: 30, window: "W-3" },
          { x: 7, y: 31, window: "W-2" },
          { x: 6, y: 32, window: "W-1" },
        ],
      },
    ],
    annotations: [
      {
        type: "boundary",
        description: "Saturation zone",
        x_range: [18, 30],
        y_range: [10, 20],
      },
    ],
  };
  const quadrantFocusIds = ["core"];
  const icQuadrantData: QuadrantResponse = {
    axes: {
      x: { metric: "cycle_time", label: "Cycle time", unit: "days" },
      y: { metric: "throughput", label: "Throughput", unit: "items" },
    },
    points: [
      {
        entity_id: "ic-1",
        entity_label: "L. Morales",
        x: 3.1,
        y: 14,
        window_start: "2025-01-01",
        window_end: "2025-01-07",
        evidence_link: "/api/v1/explain?metric=cycle_time",
        trajectory: [
          { x: 4.2, y: 11, window: "W-3" },
          { x: 3.6, y: 12, window: "W-2" },
          { x: 3.1, y: 14, window: "W-1" },
        ],
      },
    ],
    annotations: [],
  };
  const demoFilters: MetricFilter = {
    ...defaultMetricFilter,
    time: {
      range_days: 7,
      compare_days: 7,
      start_date: "2025-01-01",
      end_date: "2025-01-07",
    },
    scope: {
      level: "team",
      ids: ["core"],
    },
  };
  const icFocusIds = ["ic-1"];
  const sampleWorkGraphEdges: WorkGraphEdge[] = [
    { edgeId: "e1", sourceType: "ISSUE", sourceId: "PROJ-101", targetType: "PR", targetId: "PR-201", edgeType: "FIXES", provenance: "NATIVE", confidence: 1.0, evidence: "Fixes #101" },
    { edgeId: "e2", sourceType: "ISSUE", sourceId: "PROJ-102", targetType: "ISSUE", targetId: "PROJ-101", edgeType: "BLOCKS", provenance: "EXPLICIT_TEXT", confidence: 0.9, evidence: "is blocked by PROJ-102" },
    { edgeId: "e3", sourceType: "PR", sourceId: "PR-201", targetType: "COMMIT", targetId: "abc123", edgeType: "CONTAINS", provenance: "NATIVE", confidence: 1.0, evidence: "" },
    { edgeId: "e4", sourceType: "COMMIT", sourceId: "abc123", targetType: "FILE", targetId: "src/api/handler.ts", edgeType: "TOUCHES", provenance: "NATIVE", confidence: 1.0, evidence: "" },
    { edgeId: "e5", sourceType: "ISSUE", sourceId: "PROJ-103", targetType: "ISSUE", targetId: "PROJ-101", edgeType: "RELATES", provenance: "HEURISTIC", confidence: 0.7, evidence: "similar labels" },
    { edgeId: "e6", sourceType: "ISSUE", sourceId: "PROJ-104", targetType: "PR", targetId: "PR-202", edgeType: "IMPLEMENTS", provenance: "EXPLICIT_TEXT", confidence: 0.95, evidence: "Implements PROJ-104" },
    { edgeId: "e7", sourceType: "PR", sourceId: "PR-202", targetType: "COMMIT", targetId: "def456", edgeType: "CONTAINS", provenance: "NATIVE", confidence: 1.0, evidence: "" },
    { edgeId: "e8", sourceType: "COMMIT", sourceId: "def456", targetType: "FILE", targetId: "src/components/Button.tsx", edgeType: "TOUCHES", provenance: "NATIVE", confidence: 1.0, evidence: "" },
    { edgeId: "e9", sourceType: "COMMIT", sourceId: "def456", targetType: "FILE", targetId: "src/api/handler.ts", edgeType: "TOUCHES", provenance: "NATIVE", confidence: 1.0, evidence: "" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
            Full Chaos Dev Health Ops
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Chart prototypes powered by ECharts
          </h1>
          <p className="max-w-2xl text-base text-(--ink-muted)">
            Interactive chart types inspired by Grafana charts, built in
            React + Next.js. Each chart has a Playwright test running in a
            headless browser.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div
            className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="chart-sparkline"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sparklines</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Trend
              </span>
            </div>
            <SparklineChart data={sparkline.values} categories={sparkline.categories} />
          </div>

          <div
            className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="chart-vertical-bar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vertical Bars</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Throughput
              </span>
            </div>
            <VerticalBarChart
              categories={throughput.categories}
              series={[
                { name: "Planned", data: throughput.planned },
                { name: "Actual", data: throughput.actual },
              ]}
            />
          </div>

          <div
            className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="chart-horizontal-bar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Horizontal Bars</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Distribution
              </span>
            </div>
            <HorizontalBarChart
              categories={efficiency.categories}
              values={efficiency.values}
            />
          </div>

          <div
            className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="chart-donut"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Donut (Sliced)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Investment
              </span>
            </div>
            <DonutChart data={donut} />
          </div>

          <div
            className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="chart-nested-pie-2d"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nested Pie (2D)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Work Mix
              </span>
            </div>
            <NestedPieChart2D
              categories={nestedPie.categories}
              subtypes={nestedPie.subtypes}
            />
          </div>

          <div
            className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
            data-testid="chart-nested-pie-3d"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nested Pie (3D)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Work Depth
              </span>
            </div>
            <NestedPieChart3D
              categories={nestedPie.categories}
              subtypes={nestedPie.subtypes}
            />
          </div>
        </section>

        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
          data-testid="chart-heatmap"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review Wait Heatmap</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              Hour x Weekday
            </span>
          </div>
          <HeatmapChart data={heatmapData} height={280} />
        </section>

        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
          data-testid="chart-flame"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Flame Diagram</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              PR lifecycle
            </span>
          </div>
          <FlameDiagram frames={flameFrames} start={flameStart} end={flameEnd} height={260} />
        </section>

        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
          data-testid="chart-quadrant"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Quadrant Landscape</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              Churn × Throughput
            </span>
          </div>
          <QuadrantChart
            data={quadrantData}
            height={280}
            focusEntityIds={quadrantFocusIds}
            scopeType="team"
          />
        </section>

        <section data-testid="quadrant-investigation">
          <QuadrantPanel
            title="Quadrant investigation"
            description="Open a dot to review investigation paths and Sankey flows."
            data={quadrantData}
            filters={demoFilters}
            emptyState="Quadrant data unavailable for this scope."
          />
        </section>

        <section className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Individual view examples
              </p>
              <h2 className="mt-2 text-lg font-semibold">
                IC views in individual scope
              </h2>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Only the named individual is shown in this view.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
              <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1">
                Developer: L. Morales
              </span>
              <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1">
                Comparison: off
              </span>
              <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-3 py-1">
                Range: 30d
              </span>
            </div>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Individual heatmap</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                  Active hours
                </span>
              </div>
              <HeatmapChart data={icHeatmapData} height={200} />
            </div>
            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Individual flame</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                  Issue focus
                </span>
              </div>
              <FlameDiagram frames={icFlameFrames} start={flameStart} end={flameEnd} height={200} />
            </div>
            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Individual quadrant</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                  Trajectory
                </span>
              </div>
              <QuadrantChart
                data={icQuadrantData}
                height={200}
                focusEntityIds={icFocusIds}
                scopeType="person"
              />
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
          data-testid="chart-sankey"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Sankey
            </h2>
            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              Investment / Flow Breakdown
            </span>
          </div>
          <SankeyChart nodes={sankey.nodes} links={sankey.links} />
        </section>

        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
          data-testid="chart-chord"
        >
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                Chord Chart — Cross-Entity Flow
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-(--ink-muted)">
                Relationship view showing how work load exchanges between
                teams, repos, or work types. Complements the Sankey lifecycle
                view.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              Exchange
            </span>
          </header>

          <div className="mb-4">
            <ChordChartControls
              value={chordControls}
              onChange={setChordControls}
              otherAvailable={teamDataset.summary.otherShare > 0}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <ChordChart
              dataset={teamDataset}
              unit="reviews"
              height={420}
            />
            <ChordSummaryPanel
              dataset={teamDataset}
              unit="reviews"
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div
              className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4"
              data-testid="chart-chord-repo"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Repo transfer</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                  6 repos
                </span>
              </div>
              <ChordChart
                dataset={repoDataset}
                unit="transfers"
                height={280}
              />
            </div>

            <div
              className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4"
              data-testid="chart-chord-work-type"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Work type rework</h3>
                <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                  Self-links on
                </span>
              </div>
              <ChordChart
                dataset={workTypeDataset}
                unit="items"
                height={280}
              />
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-5 shadow-sm"
          data-testid="chart-work-graph"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Work Graph Explorer</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
              Relationships
            </span>
          </div>
          <WorkGraphExplorer edges={sampleWorkGraphEdges} height={500} />
          <div className="mt-4">
            <WorkGraphLegend />
          </div>
        </section>
      </main>
    </div>
  );
}

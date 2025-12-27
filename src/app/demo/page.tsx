import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { NestedPieChart2D } from "@/components/charts/NestedPieChart2D";
import { NestedPieChart3D } from "@/components/charts/NestedPieChart3D";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { VerticalBarChart } from "@/components/charts/VerticalBarChart";
import {
  workItemFlowEfficiencyDailySample,
  workItemMetricsDailySample,
  workItemStatusTransitionSample,
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

export default function Home() {
  const throughput = toThroughputBarSeries(workItemMetricsDailySample, {
    scopeOrder: ["auth", "api", "ui", "data", "ops", "docs"],
  });
  const efficiency = toTeamEfficiencyBarSeries(workItemFlowEfficiencyDailySample);
  const sparkline = toSparklineSeries(workItemMetricsDailySample, {
    workScopeId: "auth",
  });
  const donut = toWorkItemTypeDonutData(workItemTypeSummarySample);
  const nestedPie = toNestedPieData(workItemTypeByScopeSample);
  const sankey = toSankeyData(workItemStatusTransitionSample);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Dev Health Ops
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Chart prototypes powered by ECharts
          </h1>
          <p className="max-w-2xl text-base text-[var(--ink-muted)]">
            Interactive chart types inspired by the Grafana dashboards, built in
            React + Next.js. Each chart has a Playwright test running in a
            headless browser.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div
            className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
            data-testid="chart-sparkline"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sparklines</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Trend
              </span>
            </div>
            <SparklineChart data={sparkline.values} categories={sparkline.categories} />
          </div>

          <div
            className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
            data-testid="chart-vertical-bar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vertical Bars</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
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
            className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
            data-testid="chart-horizontal-bar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Horizontal Bars</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Ranking
              </span>
            </div>
            <HorizontalBarChart
              categories={efficiency.categories}
              values={efficiency.values}
            />
          </div>

          <div
            className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
            data-testid="chart-donut"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Donut (Sliced)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Investment
              </span>
            </div>
            <DonutChart data={donut} />
          </div>

          <div
            className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
            data-testid="chart-nested-pie-2d"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nested Pie (2D)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Work Mix
              </span>
            </div>
            <NestedPieChart2D
              categories={nestedPie.categories}
              subtypes={nestedPie.subtypes}
            />
          </div>

          <div
            className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
            data-testid="chart-nested-pie-3d"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nested Pie (3D)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
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
          className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-6 shadow-sm"
          data-testid="chart-sankey"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sankey Flow</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Investment / Dev
            </span>
          </div>
          <SankeyChart nodes={sankey.nodes} links={sankey.links} />
        </section>
      </main>
    </div>
  );
}

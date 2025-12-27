import { DonutChart } from "@/components/charts/DonutChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { VerticalBarChart } from "@/components/charts/VerticalBarChart";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-500">
            Dev Health Ops
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Chart prototypes powered by ECharts
          </h1>
          <p className="max-w-2xl text-base text-zinc-600">
            Interactive chart types inspired by the Grafana dashboards, built in
            React + Next.js. Each chart has a Playwright test running in a
            headless browser.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <div
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            data-testid="chart-sparkline"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sparklines</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Trend
              </span>
            </div>
            <SparklineChart />
          </div>

          <div
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            data-testid="chart-vertical-bar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vertical Bars</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Throughput
              </span>
            </div>
            <VerticalBarChart />
          </div>

          <div
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            data-testid="chart-horizontal-bar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Horizontal Bars</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Ranking
              </span>
            </div>
            <HorizontalBarChart />
          </div>

          <div
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
            data-testid="chart-donut"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Donut (Sliced)</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Investment
              </span>
            </div>
            <DonutChart />
          </div>
        </section>

        <section
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          data-testid="chart-sankey"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Sankey Flow</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Investment / Dev
            </span>
          </div>
          <SankeyChart />
        </section>
      </main>
    </div>
  );
}

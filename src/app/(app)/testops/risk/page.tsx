import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { QuadrantChart } from "@/components/charts/QuadrantChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { checkApiHealth } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchRiskMetrics } from "@/lib/testops/fetchers";

type RiskPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function RiskPage({ searchParams }: RiskPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const isTestMode = process.env.DEV_HEALTH_TEST_MODE === "true" || process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  const [health, riskData] = await Promise.all([
    checkApiHealth(),
    fetchRiskMetrics("default-org", isTestMode),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  const timeseriesData = riskData.timeseries ? riskData.timeseries.map((b: { date: string; riskScore: number }) => ({ day: b.date, value: b.riskScore * 100 })) : [];
  
  const dragCategories = riskData.quality_drag_breakdown ? riskData.quality_drag_breakdown.map((item: { category: string; hours: number }) => item.category) : [];
  const dragValues = riskData.quality_drag_breakdown ? riskData.quality_drag_breakdown.map((item: { category: string; hours: number }) => item.hours) : [];

  const quadrantData = {
    axes: {
      x: { metric: "pipeline_success_rate", label: "Pipeline Success Rate", unit: "%" },
      y: { metric: "test_pass_rate", label: "Test Pass Rate", unit: "%" }
    },
    points: riskData.quadrant_data ? riskData.quadrant_data.map((item: { id: string; pipeline_success_rate: number; test_pass_rate: number }) => ({
      entity_id: item.id,
      entity_label: item.id,
      x: item.pipeline_success_rate,
      y: item.test_pass_rate,
      window_start: "2024-01-01",
      window_end: "2024-01-07",
      evidence_link: "#"
    })) : [],
    annotations: [
      {
        type: "zone",
        description: "High Risk",
        x_range: [0, 75] as [number, number],
        y_range: [0, 90] as [number, number]
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="risk" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                TestOps
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Risk & Quality Drag
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Deployment confidence and risk assessment.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="testops" />

          <section className="grid gap-4 lg:grid-cols-3">
            <MetricCard
              label="Release Confidence"
              href="#"
              value={riskData.release_confidence ? riskData.release_confidence * 100 : undefined}
              unit="%"
              caption="Overall confidence score for deployments"
            />
            <MetricCard
              label="Quality Drag"
              href="#"
              value={riskData.quality_drag_hours}
              unit="h"
              caption="Hours lost to test/pipeline issues"
            />
            <MetricCard
              label="Pipeline Stability"
              href="#"
              value={riskData.pipeline_stability ? riskData.pipeline_stability * 100 : undefined}
              unit="%"
              caption="Stability score across all pipelines"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <h2 className="font-(--font-display) text-xl mb-4">Risk Trend</h2>
              <div className="h-64">
                <TimeseriesChart data={timeseriesData} />
              </div>
            </div>
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <h2 className="font-(--font-display) text-xl mb-4">Quality Drag Breakdown</h2>
              <div className="h-64">
                <HorizontalBarChart categories={dragCategories} values={dragValues} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
            <h2 className="font-(--font-display) text-xl mb-4">Risk vs Throughput (by Repo)</h2>
            <div className="h-96">
              <QuadrantChart data={quadrantData} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

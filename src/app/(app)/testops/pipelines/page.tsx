import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { checkApiHealth } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchTestOpsData } from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import { TimeseriesResult, TimeseriesBucket, BreakdownResult, BreakdownItem } from "@/lib/graphql/schemas/analytics";

type PipelinesPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getLatestValue(timeseries: TimeseriesResult[], measureId: string) {
  const series = timeseries.find((s) => s.measure === measureId);
  if (!series || !series.buckets || series.buckets.length === 0) return undefined;
  return series.buckets[series.buckets.length - 1].value;
}

function getSparkline(timeseries: TimeseriesResult[], measureId: string) {
  const series = timeseries.find((s) => s.measure === measureId);
  if (!series || !series.buckets) return undefined;
  return series.buckets.map((b: TimeseriesBucket) => ({ ts: b.date, value: b.value }));
}

export default async function PipelinesPage({ searchParams }: PipelinesPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const isTestMode = process.env.DEV_HEALTH_TEST_MODE === "true" || process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  const rangeDays = filters?.time?.range_days ?? 14;
  const today = new Date();
  const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
  const startDate = filters?.time?.start_date ?? new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
  const dateRange = { startDate, endDate };

  const [health, testOpsData] = await Promise.all([
    checkApiHealth(),
    fetchTestOpsData({
      timeseries: [
        { dimension: "TEAM", measure: "PIPELINE_SUCCESS_RATE", interval: "DAY", dateRange },
        { dimension: "TEAM", measure: "PIPELINE_FAILURE_RATE", interval: "DAY", dateRange },
        { dimension: "TEAM", measure: "PIPELINE_DURATION_P95", interval: "DAY", dateRange },
        { dimension: "TEAM", measure: "PIPELINE_QUEUE_TIME", interval: "DAY", dateRange },
        { dimension: "TEAM", measure: "PIPELINE_RERUN_RATE", interval: "DAY", dateRange },
      ],
      breakdowns: [
        { dimension: "TEAM", measure: "PIPELINE_FAILURE_RATE", dateRange, topN: 10 }
      ],
    }, isTestMode),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  const pipelineTimeseries = testOpsData.pipelines.timeseries || [];
  const pipelineBreakdowns = testOpsData.pipelines.breakdowns || [];

  const measures = [
    { id: "PIPELINE_SUCCESS_RATE", ts: pipelineTimeseries },
    { id: "PIPELINE_FAILURE_RATE", ts: pipelineTimeseries },
    { id: "PIPELINE_DURATION_P95", ts: pipelineTimeseries },
    { id: "PIPELINE_QUEUE_TIME", ts: pipelineTimeseries },
    { id: "PIPELINE_RERUN_RATE", ts: pipelineTimeseries },
  ];

  const successRateSeries = pipelineTimeseries.find((s: TimeseriesResult) => s.measure === "PIPELINE_SUCCESS_RATE");
  const failureBreakdown = pipelineBreakdowns.find((b: BreakdownResult) => b.measure === "PIPELINE_FAILURE_RATE");

  const timeseriesData = successRateSeries ? successRateSeries.buckets.map((b: TimeseriesBucket) => ({ day: b.date, value: b.value })) : [];

  const heatmapData = {
    axes: {
      x: failureBreakdown ? failureBreakdown.items.map((item: BreakdownItem) => item.key) : [],
      y: ["Failure Rate"]
    },
    cells: failureBreakdown ? failureBreakdown.items.map((item: BreakdownItem) => ({
      x: item.key,
      y: "Failure Rate",
      value: item.value
    })) : [],
    legend: {
      unit: "%",
      scale: "linear" as const
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="pipelines" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                TestOps
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Pipelines
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                CI/CD pipeline health and performance.
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
            {measures.map(({ id, ts }) => {
              const def = TESTOPS_MEASURES[id];
              if (!def) return null;
              
              const value = getLatestValue(ts, id);
              const spark = getSparkline(ts, id);
              
              return (
                <MetricCard
                  key={id}
                  label={def.label}
                  href="#"
                  value={value}
                  unit={def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : ""}
                  spark={spark}
                  caption={def.description}
                />
              );
            })}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <h2 className="font-(--font-display) text-xl mb-4">Success Rate Trend</h2>
              <div className="h-64">
                <TimeseriesChart data={timeseriesData} />
              </div>
            </div>
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <h2 className="font-(--font-display) text-xl mb-4">Failure Patterns</h2>
              <div className="h-64">
                <HeatmapChart data={heatmapData} />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

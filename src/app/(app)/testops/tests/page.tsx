import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchTestOpsData } from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import {
  TimeseriesResult,
  TimeseriesBucket,
  BreakdownResult,
  BreakdownItem,
} from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";

type TestsPageProps = {
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

/** Period-over-period change (%) from first to last bucket; undefined when history is insufficient. */
function getDelta(timeseries: TimeseriesResult[], measureId: string) {
  const series = timeseries.find((s) => s.measure === measureId);
  const buckets = series?.buckets;
  if (!buckets || buckets.length < 2) return undefined;
  const prev = buckets[0].value;
  const curr = buckets[buckets.length - 1].value;
  if (prev === 0) return undefined;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export default async function TestsPage({ searchParams }: TestsPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  const env = getServerEnv();
  const isTestMode =
    env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

  const rangeDays = filters?.time?.range_days ?? 14;
  const today = new Date();
  const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
  const startDate =
    filters?.time?.start_date ??
    new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
  const dateRange = { startDate, endDate };

  const [health, testOpsData] = await Promise.all([
    checkApiHealth(),
    fetchTestOpsData(
      {
        timeseries: [
          { dimension: "TEAM", measure: "TEST_PASS_RATE", interval: "DAY", dateRange },
          { dimension: "TEAM", measure: "TEST_FAILURE_RATE", interval: "DAY", dateRange },
          { dimension: "TEAM", measure: "TEST_FLAKE_RATE", interval: "DAY", dateRange },
          { dimension: "TEAM", measure: "TEST_SUITE_DURATION_P95", interval: "DAY", dateRange },
        ],
        breakdowns: [{ dimension: "TEAM", measure: "TEST_FLAKE_RATE", dateRange, topN: 10 }],
      },
      isTestMode,
    ),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  const testTimeseries = testOpsData.tests.timeseries || [];
  const testBreakdowns = testOpsData.tests.breakdowns || [];

  const measures = [
    { id: "TEST_PASS_RATE", ts: testTimeseries },
    { id: "TEST_FAILURE_RATE", ts: testTimeseries },
    { id: "TEST_FLAKE_RATE", ts: testTimeseries },
    { id: "TEST_SUITE_DURATION_P95", ts: testTimeseries },
  ];

  const passRateSeries = testTimeseries.find(
    (s: TimeseriesResult) => s.measure === "TEST_PASS_RATE",
  );
  const flakeBreakdown = testBreakdowns.find(
    (b: BreakdownResult) => b.measure === "TEST_FLAKE_RATE",
  );

  const timeseriesData = passRateSeries
    ? passRateSeries.buckets.map((b: TimeseriesBucket) => ({ day: b.date, value: b.value }))
    : [];

  const heatmapData = {
    axes: {
      x: flakeBreakdown ? flakeBreakdown.items.map((item: BreakdownItem) => item.key) : [],
      y: ["Flake Rate"],
    },
    cells: flakeBreakdown
      ? flakeBreakdown.items.map((item: BreakdownItem) => ({
          x: item.key,
          y: "Flake Rate",
          value: item.value,
        }))
      : [],
    legend: {
      unit: "%",
      scale: "linear" as const,
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="tests" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">TestOps</p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Tests</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Test suite reliability and performance.
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
              const delta = getDelta(ts, id);

              return (
                <MetricCard
                  key={id}
                  label={def.label}
                  href="#"
                  value={value}
                  unit={def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : ""}
                  delta={delta}
                  deltaUnavailableLabel="Insufficient history"
                  spark={spark}
                  caption={def.description}
                />
              );
            })}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <h2 className="font-(--font-display) text-xl mb-4">Pass Rate Trend</h2>
              <div className="h-64">
                <TimeseriesChart data={timeseriesData} />
              </div>
            </div>
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <h2 className="font-(--font-display) text-xl mb-4">Flaky Test Patterns</h2>
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

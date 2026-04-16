import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchTestOpsData } from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import { TimeseriesResult, TimeseriesBucket } from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";

type TestOpsPageProps = {
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

export default async function TestOpsPage({ searchParams }: TestOpsPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const env = getServerEnv();
  const isTestMode = env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

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
        { dimension: "TEAM", measure: "TEST_FLAKE_RATE", interval: "DAY", dateRange },
        { dimension: "TEAM", measure: "COVERAGE_LINE_PCT", interval: "DAY", dateRange },
      ],
      breakdowns: [],
    }, isTestMode),
  ]);

  if (!health.ok && !isTestMode) {
    return <ServiceUnavailable />;
  }

  const pipelineTimeseries = testOpsData.pipelines.timeseries || [];
  const testTimeseries = testOpsData.tests.timeseries || [];
  const coverageTimeseries = testOpsData.coverage.timeseries || [];

  const measures = [
    { id: "PIPELINE_SUCCESS_RATE", ts: pipelineTimeseries },
    { id: "PIPELINE_FAILURE_RATE", ts: pipelineTimeseries },
    { id: "PIPELINE_DURATION_P95", ts: pipelineTimeseries },
    { id: "PIPELINE_QUEUE_TIME", ts: pipelineTimeseries },
    { id: "PIPELINE_RERUN_RATE", ts: pipelineTimeseries },
    { id: "TEST_FLAKE_RATE", ts: testTimeseries },
    { id: "COVERAGE_LINE_PCT", ts: coverageTimeseries },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="testops" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                TestOps
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Health Overview
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Pipeline stability, test reliability, and coverage.
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
        </main>
      </div>
    </div>
  );
}

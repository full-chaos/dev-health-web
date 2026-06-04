import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { AreaHub } from "@/components/navigation/AreaHub";
import { AreaSignalCard } from "@/components/navigation/AreaSignalCard";
import { BackLink } from "@/components/shared/BackLink";
import { ModeTabs, type ModeTabItem } from "@/components/shared/ModeTabs";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchTestOpsData } from "@/lib/testops/fetchers";
import { getGovernSignals } from "@/lib/areaSignals";
import { topSignals } from "@/lib/areaSignals/sort";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import { TimeseriesResult, TimeseriesBucket } from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";

type TestOpsPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Govern landing sub-views (Framework A2). "Overview" is the area summary +
// signal grid; "TestOps" preserves the borrowed pipeline/test/coverage metric
// grid (A6: the area is named "Govern", not its borrowed leaf).
type GovernView = "overview" | "testops";
const GOVERN_VIEWS: GovernView[] = ["overview", "testops"];

function getLatestValue(timeseries: TimeseriesResult[], measureId: string) {
  const series = timeseries.find((s) => s.measure === measureId);
  if (!series || !series.buckets || series.buckets.length === 0) return undefined;
  return series.buckets[series.buckets.length - 1].value;
}

function getSparkline(timeseries: TimeseriesResult[], measureId: string) {
  const series = timeseries.find((s) => s.measure === measureId);
  if (!series || !series.buckets) return undefined;
  return series.buckets.map((b: TimeseriesBucket) => ({
    ts: b.date,
    value: b.value,
  }));
}

export default async function TestOpsPage({ searchParams }: TestOpsPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const viewParam = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeView: GovernView = GOVERN_VIEWS.includes(viewParam as GovernView)
    ? (viewParam as GovernView)
    : "overview";

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

  // Resolve the area's sub-area signals (Govern reference resolver) and the
  // borrowed TestOps metric grid in parallel — no waterfall.
  // testOpsData is fetched once here; getGovernSignals reuses it via `prefetched`
  // to avoid a duplicate analytics POST (PIPELINE_SUCCESS_RATE / TEST_FLAKE_RATE /
  // COVERAGE_LINE_PCT are all present in the batch below).
  const [health, testOpsData] = await Promise.all([
    checkApiHealth(),
    fetchTestOpsData(
      {
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
      },
      isTestMode,
    ),
  ]);
  const governSignals = await getGovernSignals(filters, isTestMode, { testOpsData });

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

  // Top sub-area signals bubbled up to the area overview (Framework A2a).
  const leadSignals = topSignals(governSignals, 3);

  const tabs: ReadonlyArray<ModeTabItem<GovernView>> = [
    { id: "overview", label: "Overview", href: withFilterParam("/testops", filters, activeRole) },
    {
      id: "testops",
      label: "TestOps",
      href: withFilterParam("/testops?view=testops", filters, activeRole),
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="testops" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-col gap-4">
            <BackLink href={withFilterParam("/", filters, activeRole)} />
            <div>
              {/* A6: the area is named by the AREA ("Govern"), not a borrowed leaf. */}
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Govern</p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Govern</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Quality and risk across pipelines, tests, coverage, security, and delivery.
              </p>
            </div>

            {/* Overview: bubble the top sub-area signals up to the area level. */}
            {leadSignals.length > 0 ? (
              <div
                data-testid="govern-overview"
                className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
              >
                {leadSignals.map((signal, index) => (
                  <AreaSignalCard
                    key={signal.id}
                    signal={signal}
                    filters={filters}
                    role={activeRole}
                    emphasized={index === 0}
                  />
                ))}
              </div>
            ) : null}
          </header>

          <ModeTabs items={tabs} activeId={activeView} ariaLabel="Govern views" />

          {activeView === "testops" ? (
            <>
              <GlobalContextBar filters={filters} />
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
            </>
          ) : (
            <AreaHub
              areaId="govern"
              signals={governSignals}
              filters={filters}
              role={activeRole}
              title="Related workflows"
              description="Quality and risk sub-areas, ordered by severity."
            />
          )}
        </main>
      </div>
    </div>
  );
}

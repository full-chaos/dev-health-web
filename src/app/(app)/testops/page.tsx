import { MetricCard } from "@/components/metrics/MetricCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchTestOpsData } from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import { getLatestValue, getSparkline, getDelta } from "@/lib/testops/aggregateSeries";
import { getServerEnv } from "@/lib/config";

import { TestOpsTabs } from "./TestOpsTabs";

type TestOpsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function TestOpsPage({ searchParams }: TestOpsPageProps) {
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
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_SUCCESS_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_FAILURE_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_DURATION_P95",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_QUEUE_TIME",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_RERUN_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "TEST_FLAKE_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "COVERAGE_LINE_PCT",
                        interval: "DAY",
                        dateRange,
                    },
                ],
                breakdowns: [],
            },
            isTestMode,
        ),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
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
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="TestOps"
                subtitle="Pipeline, test, and coverage operations in one durable destination."
            ></PageHeader>

            <TestOpsTabs activeId="overview" filters={filters} role={activeRole} />

            <ScopeBar view="testops" />
            <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    TestOps summary
                </p>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Overview of pipeline stability, test reliability, and coverage health.
                </p>
            </section>

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
                            value={value}
                            unit={
                                def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : ""
                            }
                            delta={delta}
                            deltaUnavailableLabel="Insufficient history"
                            inverseGood={def.goodDirection === "down"}
                            spark={spark}
                            caption={def.description}
                        />
                    );
                })}
            </section>
        </div>
    );
}

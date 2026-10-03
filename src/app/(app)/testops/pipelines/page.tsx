import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FailurePatternsCard } from "@/components/testops/FailurePatternsCard";
import { InvestigateTestOps } from "@/components/testops/InvestigateTestOps";
import { PipelineRateTrendChart } from "@/components/testops/PipelineRateTrendChart";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchTestOpsData } from "@/lib/testops/fetchers";
import { buildFailurePatternsModel } from "@/lib/testops/failure-patterns";
import { buildPipelineRateTrend, hasPipelineRateData } from "@/lib/testops/rateTrend";
import type { BreakdownResult } from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";

import { resolveTestOpsTiles, testOpsEvidenceSubject } from "../testOpsEvidence";
import { TestOpsTabs } from "../TestOpsTabs";

type PipelinesPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PipelinesPage({ searchParams }: PipelinesPageProps) {
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
                ],
                breakdowns: [
                    {
                        dimension: "TEAM",
                        measure: "PIPELINE_FAILURE_RATE",
                        dateRange,
                        topN: 10,
                    },
                ],
            },
            isTestMode,
        ),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    const pipelineTimeseries = testOpsData.pipelines.timeseries || [];
    const pipelineBreakdowns = testOpsData.pipelines.breakdowns || [];
    const fetchFailed = Boolean(testOpsData.fetchFailed);

    const tiles = resolveTestOpsTiles([
        { id: "PIPELINE_SUCCESS_RATE", ts: pipelineTimeseries },
        { id: "PIPELINE_FAILURE_RATE", ts: pipelineTimeseries },
        { id: "PIPELINE_DURATION_P95", ts: pipelineTimeseries },
        { id: "PIPELINE_QUEUE_TIME", ts: pipelineTimeseries },
        { id: "PIPELINE_RERUN_RATE", ts: pipelineTimeseries },
    ]);

    const rateTrend = buildPipelineRateTrend(pipelineTimeseries);
    const failurePatterns = buildFailurePatternsModel(
        pipelineBreakdowns.find((b: BreakdownResult) => b.measure === "PIPELINE_FAILURE_RATE"),
        "%",
    );

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="TestOps"
                subtitle="CI/CD pipeline health and performance."
                actions={
                    <PageHeaderEvidenceAction
                        subject={testOpsEvidenceSubject("TestOps pipelines", tiles)}
                    />
                }
            ></PageHeader>

            {/* Approved order: header, scope bar, tab row, content. */}
            <ScopeBar view="testops" />

            <TestOpsTabs activeId="pipelines" filters={filters} role={activeRole} />

            <MetricStrip data-testid="testops-pipelines-tiles">
                {tiles.map((tile) => (
                    <MetricCard
                        key={tile.id}
                        label={tile.label}
                        value={tile.value}
                        unit={tile.unit}
                        delta={tile.delta}
                        deltaUnavailableLabel="Insufficient history"
                        inverseGood={tile.inverseGood}
                        spark={tile.spark}
                        caption={tile.note}
                    />
                ))}
            </MetricStrip>

            {/* The denominators note stays with the chart it explains (it protects meaning). */}
            <Section
                title="Pipeline trends"
                description={
                    <>
                        Success Rate and Failure Rate are shares of <em>completed</em> pipeline runs
                        and need not sum to 100% — runs can be cancelled or skipped. A sustained dip
                        of the success rate flags CI instability before it blocks delivery.
                    </>
                }
                data-testid="testops-pipeline-trends"
            >
                {fetchFailed ? (
                    <DataState
                        variant="error"
                        title="Pipeline trend could not be loaded"
                        message="Pipeline analytics could not be loaded. The trend will reappear once the data service recovers."
                    />
                ) : !hasPipelineRateData(rateTrend) ? (
                    <DataState
                        variant="no-data-connected"
                        title="Pipeline trend not populated"
                        description="Success-rate history appears here once pipeline runs are ingested for this scope."
                    />
                ) : (
                    <>
                        <p className="text-label-caps uppercase text-(--ink-muted)">Percent</p>
                        <PipelineRateTrendChart points={rateTrend} />
                    </>
                )}
            </Section>

            <div className="grid gap-4.5 lg:grid-cols-2">
                <FailurePatternsCard model={failurePatterns} fetchFailed={fetchFailed} />
                <InvestigateTestOps filters={filters} role={activeRole} />
            </div>
        </div>
    );
}

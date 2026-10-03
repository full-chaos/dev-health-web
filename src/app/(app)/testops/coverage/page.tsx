import { NoOrgNotice } from "@/components/NoOrgNotice";
import { requireSession } from "@/lib/auth";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { CoverageBaselineCard } from "@/components/testops/CoverageBaselineCard";
import { RepositoryCoverageTable } from "@/components/testops/RepositoryCoverageTable";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchCoverageBaselines, fetchCoverageMetrics } from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import { baselineEndDate } from "@/lib/testops/coverageBaselines";
import { BRANCH_BREAKDOWN_TOP_N, buildRepositoryCoverage } from "@/lib/testops/coverageRepos";
import {
    TimeseriesResult,
    TimeseriesBucket,
    NullableBreakdownResult,
} from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";

import { testOpsEvidenceSubject, type TestOpsTile } from "../testOpsEvidence";
import { TestOpsTabs } from "../TestOpsTabs";

type CoveragePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

// The Coverage tab reads the FIRST served series of a measure (not the team roll-up of the other
// TestOps tabs). That is production data logic and stays as it is.
function getLatestValue(timeseries: TimeseriesResult[], measureId: string) {
    const series = timeseries.find((s) => s.measure === measureId);
    if (!series || !series.buckets || series.buckets.length === 0) return undefined;
    // A null latest bucket is "no value" (rendered "--"), never a 0.
    return series.buckets[series.buckets.length - 1].value ?? undefined;
}

function getSparkline(timeseries: TimeseriesResult[], measureId: string) {
    const series = timeseries.find((s) => s.measure === measureId);
    if (!series || !series.buckets) return undefined;
    return series.buckets.map((b: TimeseriesBucket) => ({
        ts: b.date,
        value: b.value,
    }));
}

const COVERAGE_TILES = ["COVERAGE_LINE_PCT", "COVERAGE_BRANCH_PCT", "COVERAGE_DELTA_PCT"];

export default async function CoveragePage({ searchParams }: CoveragePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    // No org on the session: nothing is requested (the TestOps reads reject without one).
    if (!isTestMode && !(await requireSession()).user.org_id) return <NoOrgNotice />;

    const rangeDays = filters?.time?.range_days ?? 14;
    const today = new Date();
    const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
    const startDate =
        filters?.time?.start_date ??
        new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
    const dateRange = { startDate, endDate };

    // The scope of the baseline read: the selected repositories, or the repositories the selected
    // teams own.
    const scopeIds = filters?.scope?.ids?.length ? filters.scope.ids : null;
    const [health, baselines, coverageData] = await Promise.all([
        checkApiHealth(),
        // The baseline of each repository: its own average over the 30 days that end on the
        // window's last day (the API's end date is not included, so it is the day after).
        fetchCoverageBaselines(
            {
                endDate: baselineEndDate(endDate),
                repoIds: filters?.scope?.level === "repo" ? scopeIds : null,
                teamIds: filters?.scope?.level === "team" ? scopeIds : null,
            },
            isTestMode,
        ),
        fetchCoverageMetrics(
            {
                timeseries: [
                    {
                        dimension: "TEAM",
                        measure: "COVERAGE_LINE_PCT",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "COVERAGE_BRANCH_PCT",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "COVERAGE_DELTA_PCT",
                        interval: "DAY",
                        dateRange,
                    },
                ],
                breakdowns: [
                    {
                        dimension: "REPO",
                        measure: "COVERAGE_LINE_PCT",
                        dateRange,
                        topN: 10,
                    },
                    // Branch coverage by repository (CHAOS-8112): one more item of the same
                    // request, so the request text does not change. It asks the largest topN
                    // the API accepts: the answer then lists every repository whenever it can,
                    // and a repository it does not list has no branch figure.
                    {
                        dimension: "REPO",
                        measure: "COVERAGE_BRANCH_PCT",
                        dateRange,
                        topN: BRANCH_BREAKDOWN_TOP_N,
                    },
                ],
            },
            isTestMode,
        ),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    const coverageTimeseries = coverageData.timeseries || [];
    const coverageBreakdowns = coverageData.breakdowns || [];
    const fetchFailed = Boolean(coverageData.fetchFailed);

    const tiles: TestOpsTile[] = COVERAGE_TILES.flatMap((id) => {
        const def = TESTOPS_MEASURES[id];
        if (!def) return [];
        return [
            {
                id,
                label: def.label,
                description: def.description,
                note: def.note,
                unit: def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : "",
                inverseGood: def.goodDirection === "down",
                value: getLatestValue(coverageTimeseries, id),
                // No change value is served on this tab: the tile reads "No prior period".
                delta: undefined,
                spark: getSparkline(coverageTimeseries, id),
            },
        ];
    });

    const lineCoverageSeries = coverageTimeseries.find(
        (s: TimeseriesResult) => s.measure === "COVERAGE_LINE_PCT",
    );
    const timeseriesData = lineCoverageSeries?.buckets
        ? lineCoverageSeries.buckets.map((b: TimeseriesBucket) => ({
              day: b.date,
              value: b.value,
          }))
        : [];

    const repoBreakdown = (measure: string) =>
        coverageBreakdowns.find(
            (b: NullableBreakdownResult) => b.dimension === "REPO" && b.measure === measure,
        );
    const repositories = buildRepositoryCoverage(
        repoBreakdown("COVERAGE_LINE_PCT"),
        repoBreakdown("COVERAGE_BRANCH_PCT"),
    );

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="TestOps"
                subtitle="Code coverage metrics and trends."
                actions={
                    <PageHeaderEvidenceAction
                        subject={testOpsEvidenceSubject("TestOps coverage", tiles)}
                    />
                }
            ></PageHeader>

            {/* Approved order: header, scope bar, tab row, content. */}
            <ScopeBar view="testops" />

            <TestOpsTabs activeId="coverage" filters={filters} role={activeRole} />

            <MetricStrip data-testid="testops-coverage-tiles">
                {tiles.map((tile) => (
                    <MetricCard
                        key={tile.id}
                        label={tile.label}
                        value={tile.value}
                        unit={tile.unit}
                        // The approved Line Coverage tile has no sparkline; its trend is the
                        // "Line Coverage Trend" card below. The other tiles keep their served spark.
                        spark={tile.id === "COVERAGE_LINE_PCT" ? undefined : tile.spark}
                        hideTrend={tile.id === "COVERAGE_LINE_PCT"}
                        caption={tile.note}
                    />
                ))}
            </MetricStrip>

            <CoverageBaselineCard
                repositories={repositories}
                baselines={baselines}
                fetchFailed={fetchFailed}
            />

            <Section title="Repository coverage" data-testid="testops-repository-coverage">
                {fetchFailed ? (
                    <DataState
                        variant="error"
                        title="Repository coverage could not be loaded"
                        message="Coverage analytics could not be loaded. The repositories will reappear once the data service recovers."
                    />
                ) : (
                    <RepositoryCoverageTable rows={repositories} baselines={baselines} />
                )}
            </Section>

            {/* Not in the approved view: kept as a secondary card below it (it is served data). */}
            <ChartFrame
                title="Line Coverage Trend"
                headingLevel="h2"
                interpretation="Line coverage appears over time so drops are visible before they become release risk."
                direction={TESTOPS_MEASURES.COVERAGE_LINE_PCT.goodDirection}
                // The baseline of the whole scope is not served (the API serves one per
                // repository). The fact stays and says so; the web makes no mean of the repository
                // baselines, and the chart draws no baseline line until a scope value is served.
                threshold={{ label: "Target baseline", value: NOT_REPORTED, tone: "info" }}
                isError={fetchFailed}
                stateMessage="Coverage analytics could not be loaded. Coverage history will reappear once the data service recovers."
                isEmpty={!timeseriesData.some((p) => p.value !== null)}
                stateTitle="Coverage trend not populated"
                stateDescription="Coverage history appears here once connected CI coverage data is available for this scope."
            >
                <div className="h-64">
                    {/* No baseline line: no baseline of the whole scope is served. */}
                    <TimeseriesChart data={timeseriesData} valueFormat="percent" />
                </div>
            </ChartFrame>
        </div>
    );
}

import { NoOrgNotice } from "@/components/NoOrgNotice";
import { requireSession } from "@/lib/auth";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
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
import { fetchTeamNames } from "@/lib/api/filterOptions";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import {
    fetchCoverageBaselines,
    fetchCoverageMetrics,
    fetchCoverageScopeBaseline,
} from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import {
    baselineEndDate,
    baselineText,
    scopeBaselineCell,
    scopeBaselineHint,
} from "@/lib/testops/coverageBaselines";
import { testOpsScopeFromFilters } from "@/lib/testops/scope";
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

function getLatestValue(series: TimeseriesResult | undefined) {
    if (!series || !series.buckets || series.buckets.length === 0) return undefined;
    // A null latest bucket is "no value" (rendered "--"), never a 0.
    return series.buckets[series.buckets.length - 1].value ?? undefined;
}

function getSparkline(series: TimeseriesResult | undefined) {
    if (!series || !series.buckets) return undefined;
    return series.buckets.map((b: TimeseriesBucket) => ({
        ts: b.date,
        value: b.value,
    }));
}

const UNRESOLVED_TEAM = "Unresolved";

// A team series is named by the served team name; a team without one reads "Unresolved", never
// its key.
function coverageSeriesName(series: TimeseriesResult, teamNames: Record<string, string>) {
    if (!series.dimensionValue) return "Organization";
    const dimension = series.dimension
        ? `${series.dimension[0]}${series.dimension.slice(1).toLowerCase()}`
        : "Series";
    if (series.dimension === "TEAM") {
        return `${dimension}: ${teamNames[series.dimensionValue]?.trim() || UNRESOLVED_TEAM}`;
    }
    return `${dimension}: ${series.dimensionValue}`;
}

function coverageSeriesPoints(series: TimeseriesResult | undefined) {
    return series?.buckets
        ? series.buckets.map((bucket: TimeseriesBucket) => ({ day: bucket.date, value: bucket.value }))
        : [];
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
    const { analytics: analyticsScope, ...baselineScope } = testOpsScopeFromFilters(filters);
    const isSelectedScope = Boolean(baselineScope.repoIds?.length || baselineScope.teamIds?.length);

    const [health, baselines, scopeBaselineState, coverageData, teamNames] = await Promise.all([
        checkApiHealth(),
        // The baseline of each repository: its own average over the 30 days that end on the
        // window's last day (the API's end date is not included, so it is the day after).
        // Scope arguments keep the repository rows aligned with the selected coverage trend.
        fetchCoverageBaselines({ endDate: baselineEndDate(endDate), ...baselineScope }, isTestMode),
        // The trend baseline covers the same selected scope and 30-day window.
        fetchCoverageScopeBaseline({ endDate: baselineEndDate(endDate), ...baselineScope }, isTestMode),
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
                filters: analyticsScope,
            },
            isTestMode,
        ),
        isTestMode ? Promise.resolve<Record<string, string>>({}) : fetchTeamNames(),
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
        const servedSeries = coverageTimeseries.filter((series) => series.measure === id);
        // Preserve the established three tiles when the API returns one series. When it returns
        // more, each tile keeps the exact served series identity and value: no first-series
        // fallback and no client-side roll-up.
        return (servedSeries.length > 0 ? servedSeries : [undefined]).map((series, index) => ({
                id: `${id}-${series?.dimension ?? "unreported"}-${series?.dimensionValue ?? index}`,
                label:
                    servedSeries.length > 1 && series
                        ? `${def.label} · ${coverageSeriesName(series, teamNames)}`
                        : def.label,
                description: def.description,
                note: def.note,
                unit: def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : "",
                inverseGood: def.goodDirection === "down",
                value: getLatestValue(series),
                // No change value is served on this tab: the tile reads "No prior period".
                delta: undefined,
                spark: getSparkline(series),
            }));
    });

    const lineCoverageSeries = coverageTimeseries.filter(
        (series: TimeseriesResult) => series.measure === "COVERAGE_LINE_PCT",
    );
    const hasMultipleLineCoverageSeries = lineCoverageSeries.length > 1;

    // The served baseline of the trend: a value, "Not reported" (null: fewer than 7 days hold a
    // value) or "Could not be read". The web computes no mean of the repository baselines.
    const scopeBaseline = scopeBaselineCell(scopeBaselineState);

    const repoBreakdown = (measure: string) =>
        coverageBreakdowns.find(
            (b: NullableBreakdownResult) => b.dimension === "REPO" && b.measure === measure,
        );
    const repositories = buildRepositoryCoverage(
        repoBreakdown("COVERAGE_LINE_PCT"),
        repoBreakdown("COVERAGE_BRANCH_PCT"),
    );

    const lineCoverageTrend = (
        series: TimeseriesResult | undefined,
        title: string,
        headingLevel: "h2" | "h3",
    ) => {
        const timeseriesData = coverageSeriesPoints(series);
        const targetLabel = hasMultipleLineCoverageSeries ? "Scope target baseline" : "Target baseline";
        return (
            <ChartFrame
                key={series ? `${series.dimension}-${series.dimensionValue}` : "not-reported"}
                title={title}
                headingLevel={headingLevel}
                interpretation={
                    hasMultipleLineCoverageSeries && series
                        ? `Line coverage for ${coverageSeriesName(series, teamNames)} appears over time so drops are visible before they become release risk.`
                        : "Line coverage appears over time so drops are visible before they become release risk."
                }
                direction={TESTOPS_MEASURES.COVERAGE_LINE_PCT.goodDirection}
                // The fact stays whatever the answer: the served value, "Not reported" or "Could
                // not be read". The target is the running 30-day average of the selected scope's
                // coverage; it is shown as scope context when individual team series are served.
                threshold={{
                    label: targetLabel,
                    value: (
                        <span title={scopeBaselineHint(scopeBaselineState, isSelectedScope)}>
                            {baselineText(scopeBaseline)}
                        </span>
                    ),
                    tone: "info",
                }}
                isError={fetchFailed}
                stateMessage="Coverage analytics could not be loaded. Coverage history will reappear once the data service recovers."
                isEmpty={!timeseriesData.some((point) => point.value !== null)}
                stateTitle="Coverage trend not populated"
                stateDescription="Coverage history appears here once connected CI coverage data is available for this scope."
            >
                <div className="h-64">
                    {/* The baseline line is the served value; no line when none is served. */}
                    <TimeseriesChart
                        data={timeseriesData}
                        valueFormat="percent"
                        {...(scopeBaseline.kind === "value"
                            ? { baseline: { value: scopeBaseline.pct, label: targetLabel } }
                            : {})}
                    />
                </div>
            </ChartFrame>
        );
    };

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
                        spark={tile.id.startsWith("COVERAGE_LINE_PCT-") ? undefined : tile.spark}
                        hideTrend={tile.id.startsWith("COVERAGE_LINE_PCT-")}
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
            {hasMultipleLineCoverageSeries ? (
                <Section title="Line Coverage Trends">
                    <div className="grid gap-6 xl:grid-cols-2">
                        {lineCoverageSeries.map((series) =>
                            lineCoverageTrend(
                                series,
                                `Line Coverage Trend · ${coverageSeriesName(series, teamNames)}`,
                                "h3",
                            ),
                        )}
                    </div>
                </Section>
            ) : (
                lineCoverageTrend(lineCoverageSeries[0], "Line Coverage Trend", "h2")
            )}
        </div>
    );
}

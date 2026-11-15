import { NoOrgNotice } from "@/components/NoOrgNotice";
import { requireSession } from "@/lib/auth";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { filtersFromPageParams } from "@/components/shell/scopeBarConfig";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { checkApiHealth } from "@/lib/api/system";
import { fetchTestOpsData, fetchTestWindow } from "@/lib/testops/fetchers";
import { testOpsScopeFromFilters } from "@/lib/testops/scope";
import { isPartialCoverage, testWindowFailed } from "@/lib/testops/testWindow";
import { testWindowTiles } from "@/lib/testops/testWindowTiles";
import { getSparkline, mergeSeriesByMeasure } from "@/lib/testops/aggregateSeries";
import { isMissingKey, UNATTRIBUTED_LABEL } from "@/lib/testops/failure-patterns";
import { formatMetricValue, formatNumber } from "@/lib/formatters";
import {
    TimeseriesBucket,
    TimeseriesResult,
    BreakdownResult,
    BreakdownItem,
} from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";

import { resolveTestOpsTiles, testOpsEvidenceSubject } from "../testOpsEvidence";
import { TestOpsTabs } from "../TestOpsTabs";

type TestsPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The served daily points of one measure for the trend chart; a null bucket stays a gap. */
function trendPoints(timeseries: TimeseriesResult[], measureId: string) {
    const series = mergeSeriesByMeasure(timeseries, measureId);
    return series
        ? series.buckets.map((b: TimeseriesBucket) => ({ day: b.date, value: b.value }))
        : [];
}

/** Up to this many groups, the flake breakdown is shown as value rows, not as a heatmap. */
const FEW_FLAKY_GROUPS = 3;
/** Height of the one-row flake heatmap (px). */
const FLAKY_HEATMAP_HEIGHT = 160;

export default async function TestsPage({ searchParams }: TestsPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = filtersFromPageParams(encodedFilter, params, { view: "testops" });

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

    const { analytics: _analyticsScope, ...scope } = testOpsScopeFromFilters(filters);
    const [health, testWindow, testOpsData] = await Promise.all([
        checkApiHealth(),
        fetchTestWindow(
            {
                sinceDate: startDate,
                untilDate: endDate,
                repoIds: scope.repoIds ?? null,
                teamIds: scope.teamIds ?? null,
            },
            isTestMode,
        ),
        fetchTestOpsData(
            {
                timeseries: [
                    {
                        dimension: "TEAM",
                        measure: "TEST_PASS_RATE",
                        interval: "DAY",
                        dateRange,
                    },
                    {
                        dimension: "TEAM",
                        measure: "TEST_FAILURE_RATE",
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
                        measure: "TEST_SUITE_DURATION_P95",
                        interval: "DAY",
                        dateRange,
                    },
                ],
                breakdowns: [
                    {
                        dimension: "TEAM",
                        measure: "TEST_FLAKE_RATE",
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

    const testTimeseries = testOpsData.tests.timeseries || [];
    const testBreakdowns = testOpsData.tests.breakdowns || [];
    const fetchFailed = Boolean(testOpsData.fetchFailed);

    // The rate tiles read the window answer (coverage, pass, failure, flake, skipped); the series
    // only draws their sparklines. The suite duration tile still reads its series.
    const tiles = [
        ...testWindowTiles(testWindow, {
            pass: getSparkline(testTimeseries, "TEST_PASS_RATE"),
            failure: getSparkline(testTimeseries, "TEST_FAILURE_RATE"),
            flake: getSparkline(testTimeseries, "TEST_FLAKE_RATE"),
        }),
        ...resolveTestOpsTiles([{ id: "TEST_SUITE_DURATION_P95", ts: testTimeseries }]),
    ];
    const partialCoverage =
        !testWindowFailed(testWindow) && isPartialCoverage(testWindow.coverage.sharePct);

    const passRatePoints = trendPoints(testTimeseries, "TEST_PASS_RATE");
    // The series that feeds the P95 Suite Duration tile (minutes, as the fetcher normalises it).
    const suiteDurationPoints = trendPoints(testTimeseries, "TEST_SUITE_DURATION_P95");

    const flakeBreakdown = testBreakdowns.find(
        (b: BreakdownResult) => b.measure === "TEST_FLAKE_RATE",
    );
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

    const trendCards = [
        {
            id: "pass-rate",
            title: "Pass rate",
            unitLabel: "Percent",
            points: passRatePoints,
            valueFormat: "percent" as const,
            emptyDescription:
                "Pass-rate history appears here once test runs are ingested for this scope.",
        },
        {
            id: "suite-duration",
            title: "Suite duration",
            unitLabel: "P95 · minutes",
            points: suiteDurationPoints,
            valueFormat: "number" as const,
            emptyDescription:
                "Suite-duration history appears here once test runs are ingested for this scope.",
        },
    ];

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="TestOps"
                subtitle="Test suite reliability and performance."
                actions={
                    <PageHeaderEvidenceAction
                        subject={testOpsEvidenceSubject("TestOps tests", tiles)}
                    />
                }
            ></PageHeader>

            {/* Approved order: header, scope bar, tab row, content. */}
            <ScopeBar view="testops" />

            <TestOpsTabs activeId="tests" filters={filters} role={activeRole} />

            <MetricStrip data-testid="testops-tests-tiles" columns={3}>
                {tiles.map((tile) => (
                    <MetricCard
                        key={tile.id}
                        label={tile.label}
                        value={tile.value}
                        valueText={tile.valueText}
                        unit={tile.unit}
                        delta={tile.delta}
                        deltaSlot={tile.noDelta ? <></> : undefined}
                        deltaUnavailableLabel="Insufficient history"
                        inverseGood={tile.inverseGood}
                        spark={tile.spark}
                        caption={tile.note}
                    />
                ))}
            </MetricStrip>

            <Section title="Test trends" data-testid="testops-test-trends">
                <div className="grid gap-4.5 lg:grid-cols-2">
                    {trendCards.map((card) => (
                        <Section
                            key={card.id}
                            as="h3"
                            title={card.title}
                            className="bg-transparent! p-4!"
                            data-testid={`testops-trend-${card.id}`}
                        >
                            {fetchFailed ? (
                                <DataState
                                    variant="error"
                                    title={`${card.title} could not be loaded`}
                                    message="Test analytics could not be loaded. Please try again later."
                                />
                            ) : !card.points.some((point) => point.value !== null) ? (
                                <DataState
                                    variant="no-data-connected"
                                    title={`${card.title} not populated`}
                                    description={card.emptyDescription}
                                />
                            ) : (
                                <>
                                    <p className="text-label-caps uppercase text-(--ink-muted)">
                                        {card.unitLabel}
                                    </p>
                                    <div className="h-64">
                                        <TimeseriesChart
                                            data={card.points}
                                            valueFormat={card.valueFormat}
                                        />
                                    </div>
                                </>
                            )}
                        </Section>
                    ))}
                </div>
            </Section>

            {partialCoverage && !testWindowFailed(testWindow) ? (
                <Notice variant="info" live={false} data-testid="testops-tests-partial-notice">
                    Partial coverage: the pass, failure and flake rates cover{" "}
                    {formatNumber(testWindow.coverage.runsWithTests)} of{" "}
                    {formatNumber(testWindow.coverage.completedRuns)} completed runs, the runs that
                    report tests. Failed runs without a test report appear on Pipelines, and are not
                    in these rates.
                </Notice>
            ) : null}

            {/* Not in the approved view: kept as a secondary card below it (it is served data). */}
            <Section
                title="Flaky Test Patterns"
                description="Flake rate within each group."
                data-testid="testops-flaky-patterns"
            >
                {fetchFailed ? (
                    <DataState
                        variant="error"
                        title="Flaky test patterns could not be loaded"
                        message="Test analytics could not be loaded. Please try again later."
                    />
                ) : heatmapData.cells.length === 0 ? (
                    <DataState
                        variant="detector-enabled-no-findings"
                        title="No flaky test patterns"
                        description="No flake data surfaced for this window or scope."
                    />
                ) : heatmapData.cells.length <= FEW_FLAKY_GROUPS ? (
                    // One to three groups would draw one huge block per group: the served values
                    // read better as fact rows (same values, same format as the tiles).
                    <EvidenceFactList aria-label="Flake rate by group" testId="testops-flaky-rows">
                        {heatmapData.cells.map((cell) => (
                            <EvidenceFact
                                key={cell.x}
                                label={isMissingKey(cell.x) ? UNATTRIBUTED_LABEL : cell.x}
                                value={formatMetricValue(cell.value, "%")}
                            />
                        ))}
                    </EvidenceFactList>
                ) : (
                    // One heatmap row ("Flake Rate"): a fixed, short height keeps cells compact; the
                    // heatmap draws its legend under it.
                    <HeatmapChart data={heatmapData} height={FLAKY_HEATMAP_HEIGHT} />
                )}
            </Section>
        </div>
    );
}

import { NoOrgNotice } from "@/components/NoOrgNotice";
import { requireSession } from "@/lib/auth";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { Section } from "@/components/ui/Section";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { QuadrantChart } from "@/components/charts/QuadrantChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { DataState } from "@/components/ui/DataState";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchRiskMetrics } from "@/lib/testops/fetchers";
import { getServerEnv } from "@/lib/config";
import { nameOrUnresolved } from "@/lib/labels/unresolved";
import { isFiniteNumber, normalizePercent } from "@/lib/guards/numbers";

type RiskPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function RiskPage({ searchParams }: RiskPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;

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

    const [health, riskData] = await Promise.all([
        checkApiHealth(),
        fetchRiskMetrics(
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
                breakdowns: [
                    {
                        dimension: "REPO",
                        measure: "PIPELINE_SUCCESS_RATE",
                        dateRange,
                        topN: 10,
                    },
                ],
            },
            isTestMode,
        ),
    ]);

    if ((!health.ok && !isTestMode) || !riskData) {
        return <ServiceUnavailable landmark={false} />;
    }

    const timeseriesData = riskData.timeseries
        ? riskData.timeseries.map((b: { date: string; riskScore: number }) => ({
              day: b.date,
              value: b.riskScore * 100,
          }))
        : [];

    const dragCategories = riskData.quality_drag_breakdown
        ? riskData.quality_drag_breakdown.map(
              (item: { category: string; hours: number }) => item.category,
          )
        : [];
    const dragValues = riskData.quality_drag_breakdown
        ? riskData.quality_drag_breakdown.map(
              (item: { category: string; hours: number }) => item.hours,
          )
        : [];

    const quadrantPoints = riskData.quadrant_data
        ? riskData.quadrant_data.flatMap(
              (item: {
                  id: string;
                  name?: string;
                  pipeline_success_rate?: number;
                  test_pass_rate?: number;
              }) => {
                  if (
                      !isFiniteNumber(item.pipeline_success_rate) ||
                      !isFiniteNumber(item.test_pass_rate)
                  ) {
                      return [];
                  }
                  return [
                      {
                          entity_id: item.id,
                          entity_label: nameOrUnresolved(item.name),
                          x: normalizePercent(item.pipeline_success_rate),
                          y: normalizePercent(item.test_pass_rate),
                          window_start: startDate,
                          window_end: endDate,
                          evidence_link: "#",
                      },
                  ];
              },
          )
        : [];

    const quadrantData = {
        axes: {
            x: {
                metric: "pipeline_success_rate",
                label: "Pipeline Success Rate",
                unit: "%",
            },
            y: { metric: "test_pass_rate", label: "Test Pass Rate", unit: "%" },
        },
        points: quadrantPoints,
        annotations: [
            {
                type: "zone",
                description: "High Risk",
                x_range: [0, 75] as [number, number],
                y_range: [0, 90] as [number, number],
            },
        ],
    };

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8">
            <PageHeader
                title="Delivery Risk"
                subtitle="Deployment confidence and risk assessment."
            ></PageHeader>

            <ScopeBar view="testops" />
            <MetricStrip data-testid="delivery-risk-tiles">
                <MetricCard
                    label="Release Confidence"
                    value={
                        riskData.release_confidence != null
                            ? riskData.release_confidence * 100
                            : undefined
                    }
                    unit="%"
                    delta={riskData.confidence_delta}
                    spark={riskData.confidence_spark}
                    caption="Overall confidence score for deployments"
                />
                <MetricCard
                    label="Quality Drag"
                    value={riskData.quality_drag_hours}
                    unit="h"
                    delta={riskData.drag_delta}
                    spark={riskData.drag_spark}
                    caption="Hours lost to test/pipeline issues"
                />
                <MetricCard
                    label="Pipeline Stability"
                    value={
                        riskData.pipeline_stability != null
                            ? riskData.pipeline_stability * 100
                            : undefined
                    }
                    unit="%"
                    delta={riskData.stability_delta}
                    spark={riskData.stability_spark}
                    caption="Stability score across all pipelines"
                />
            </MetricStrip>

            <div className="grid gap-4.5 lg:grid-cols-2">
                <Section title="Risk Trend" data-testid="delivery-risk-trend">
                    <div className="h-64">
                        <TimeseriesChart data={timeseriesData} valueFormat="percent" />
                    </div>
                </Section>
                <Section title="Quality Drag Breakdown" data-testid="delivery-risk-drag">
                    <div className="h-64">
                        <HorizontalBarChart
                            categories={dragCategories}
                            values={dragValues}
                            valueFormat="hours"
                        />
                    </div>
                </Section>
            </div>

            <Section
                title="Pipeline success × test pass rate (by repo)"
                data-testid="delivery-risk-scatter"
            >
                {quadrantPoints.length > 0 ? (
                    <div className="h-96" data-testid="risk-throughput-chart">
                        <QuadrantChart data={quadrantData} scopeType="repo" />
                    </div>
                ) : (
                    <DataState
                        variant="insufficient-confidence"
                        title="No repo risk data for this window"
                        description="This scatterplot needs finite repo-level pipeline success and test pass rates before it can be drawn."
                        data-testid="risk-throughput-empty"
                    />
                )}
            </Section>
        </div>
    );
}

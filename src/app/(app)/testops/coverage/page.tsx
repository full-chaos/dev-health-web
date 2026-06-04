import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { QualityCoverageTabs } from "@/components/testops/QualityCoverageTabs";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { checkApiHealth } from "@/lib/api/system";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { fetchCoverageMetrics } from "@/lib/testops/fetchers";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";
import {
	TimeseriesResult,
	TimeseriesBucket,
	BreakdownResult,
	BreakdownItem,
} from "@/lib/graphql/schemas/analytics";
import { getServerEnv } from "@/lib/config";
import { resolveEntityLabels } from "@/lib/labels/entityLabel";

type CoveragePageProps = {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function getLatestValue(timeseries: TimeseriesResult[], measureId: string) {
	const series = timeseries.find((s) => s.measure === measureId);
	if (!series || !series.buckets || series.buckets.length === 0)
		return undefined;
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

export default async function CoveragePage({
	searchParams,
}: CoveragePageProps) {
	const params = (await searchParams) ?? {};
	const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
	const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
	const activeRole = typeof roleParam === "string" ? roleParam : undefined;

	const filters = encodedFilter
		? decodeFilter(encodedFilter)
		: filterFromQueryParams(params);

	const env = getServerEnv();
	const isTestMode =
		env.DEV_HEALTH_TEST_MODE === "true" ||
		env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

	const rangeDays = filters?.time?.range_days ?? 14;
	const today = new Date();
	const endDate = filters?.time?.end_date ?? today.toISOString().slice(0, 10);
	const startDate =
		filters?.time?.start_date ??
		new Date(today.getTime() - rangeDays * 86_400_000)
			.toISOString()
			.slice(0, 10);
	const dateRange = { startDate, endDate };

	const [health, coverageData] = await Promise.all([
		checkApiHealth(),
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
				],
			},
			isTestMode,
		),
	]);

	if (!health.ok && !isTestMode) {
		return <ServiceUnavailable />;
	}

	const coverageTimeseries = coverageData.timeseries || [];
	const coverageBreakdowns = coverageData.breakdowns || [];

	const measures = [
		{ id: "COVERAGE_LINE_PCT", ts: coverageTimeseries },
		{ id: "COVERAGE_BRANCH_PCT", ts: coverageTimeseries },
		{ id: "COVERAGE_DELTA_PCT", ts: coverageTimeseries },
	];

	const lineCoverageSeries = coverageTimeseries.find(
		(s: TimeseriesResult) => s.measure === "COVERAGE_LINE_PCT",
	);
	const repoBreakdown = coverageBreakdowns.find(
		(b: BreakdownResult) => b.measure === "COVERAGE_LINE_PCT",
	);

	const timeseriesData = lineCoverageSeries?.buckets
		? lineCoverageSeries.buckets.map((b: TimeseriesBucket) => ({
				day: b.date,
				value: b.value,
			}))
		: [];

	const repoIds = repoBreakdown?.items
		? repoBreakdown.items.map((item: BreakdownItem) => item.key)
		: [];
	const repoValues = repoBreakdown?.items
		? repoBreakdown.items.map((item: BreakdownItem) => item.value)
		: [];
	// Render-safe labels: never expose a raw repo UUID as an axis label;
	// unresolved ids degrade to a stable short label with the full id in the tooltip.
	const { labels: repoCategories, titles: repoTitles } = resolveEntityLabels(
		repoIds,
		{ unresolvedFallback: "Unresolved" },
	);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
				<PrimaryNav filters={filters} active="coverage" role={activeRole} />
				<main className="flex min-w-0 flex-1 flex-col gap-8">
					<header className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
								TestOps
							</p>
							<h1 className="mt-2 font-(--font-display) text-3xl">Coverage</h1>
							<p className="mt-2 text-sm text-(--ink-muted)">
								Code coverage metrics and trends.
							</p>
						</div>
						<Link
							href={withFilterParam("/", filters, activeRole)}
							className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
						>
							Back to cockpit
						</Link>
					</header>

					<QualityCoverageTabs filters={filters} role={activeRole} />

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
									unit={
										def.unit === "percentage"
											? "%"
											: def.unit === "duration"
												? "m"
												: ""
									}
									spark={spark}
									caption={def.description}
								/>
							);
						})}
					</section>

					<section className="grid gap-6 lg:grid-cols-2">
						<div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
							<h2 className="font-(--font-display) text-xl mb-4">
								Line Coverage Trend
							</h2>
							<div className="h-64">
								<TimeseriesChart data={timeseriesData} valueFormat="percent" />
							</div>
						</div>
						<div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
							<h2 className="font-(--font-display) text-xl mb-4">
								Coverage by Repository
							</h2>
							<div className="h-64">
								<HorizontalBarChart
									categories={repoCategories}
									values={repoValues}
									categoryTitles={repoTitles}
									valueFormat="percent"
								/>
							</div>
						</div>
					</section>
				</main>
			</div>
		</div>
	);
}

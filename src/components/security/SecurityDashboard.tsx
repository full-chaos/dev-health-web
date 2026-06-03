"use client";

import { useSecurityOverview } from "@/lib/graphql/hooks/useSecurity";
import type { SecurityFilter } from "@/lib/filters/security";
import { KpiTile } from "./KpiTile";
import { SeverityStackedBar } from "./SeverityStackedBar";
import { TopReposChart } from "./TopReposChart";
import { TrendChart } from "./TrendChart";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { DataState } from "@/components/ui/DataState";
import type {
	SeverityBucketData,
	RepoAlertCountData,
	TrendPointData,
} from "./types";

interface SecurityDashboardProps {
	filter: SecurityFilter;
}

/** Thin inline error placeholder rendered inside each testid wrapper in degraded mode. */
function DegradedTile({ label }: { label: string }) {
	return (
		<DataState
			variant="error"
			title={`${label} unavailable`}
			message="This security view could not be loaded. Please retry."
		/>
	);
}

export function SecurityDashboard({ filter }: SecurityDashboardProps) {
	const { data, fetching, error } = useSecurityOverview(filter);

	const kpis = data?.securityOverview?.kpis;
	const severityBreakdown = data?.securityOverview?.severityBreakdown ?? [];
	const topRepos = data?.securityOverview?.topRepos ?? [];
	const trend = data?.securityOverview?.trend ?? [];

	// Cast to narrowed types expected by chart components
	const buckets = severityBreakdown as SeverityBucketData[];
	const repos = topRepos as RepoAlertCountData[];
	const trendPoints = trend as TrendPointData[];

	const mttfValue =
		kpis?.meanDaysToFix30d != null
			? `${kpis.meanDaysToFix30d.toFixed(1)}d`
			: "No data";

	return (
		<div className="flex flex-col gap-6">
			{/* Banner-level error notice — does NOT replace the grid structure */}
			{error && (
				<ErrorCard
					title="Failed to load security overview"
					message={error.message}
				/>
			)}

			{/* Row 1: KPI tiles — testid wrappers always in the DOM (required by Playwright) */}
			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<div data-testid="kpi-open">
					{error ? (
						<DegradedTile label="Open Alerts" />
					) : (
						<KpiTile
							label="Open Alerts"
							value={kpis?.openTotal ?? 0}
							delta={fetching ? undefined : kpis?.openDelta30d}
							tone={kpis && kpis.openTotal > 0 ? "warn" : "default"}
							loading={fetching}
						/>
					)}
				</div>
				<div data-testid="kpi-critical">
					{error ? (
						<DegradedTile label="Critical" />
					) : (
						<KpiTile
							label="Critical"
							value={kpis?.critical ?? 0}
							tone={kpis && kpis.critical > 0 ? "danger" : "default"}
							loading={fetching}
						/>
					)}
				</div>
				<div data-testid="kpi-high">
					{error ? (
						<DegradedTile label="High" />
					) : (
						<KpiTile
							label="High"
							value={kpis?.high ?? 0}
							tone={kpis && kpis.high > 0 ? "warn" : "default"}
							loading={fetching}
						/>
					)}
				</div>
				<div data-testid="kpi-mttf">
					{error ? (
						<DegradedTile label="Mean Days to Fix (30d)" />
					) : (
						<KpiTile
							label="Mean Days to Fix (30d)"
							value={mttfValue}
							tone="default"
							loading={fetching}
						/>
					)}
				</div>
			</div>

			{/* Row 2: Severity breakdown + Top repos */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
					<p className="mb-3 text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
						By Severity
					</p>
					{error ? (
						<DegradedTile label="Severity breakdown" />
					) : (
						<SeverityStackedBar buckets={buckets} loading={fetching} />
					)}
				</div>
				<div
					className="rounded-2xl border border-(--card-stroke) bg-card p-4"
					data-testid="top-repos-chart"
				>
					<p className="mb-3 text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
						Top Repos by Alert Count
					</p>
					{error ? (
						<DegradedTile label="Top repos chart" />
					) : (
						<TopReposChart repos={repos} loading={fetching} />
					)}
				</div>
			</div>

			{/* Row 3: Trend chart */}
			<div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
				<p className="mb-3 text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
					Trend (last 30 days)
				</p>
				{error ? (
					<DegradedTile label="Trend chart" />
				) : (
					<TrendChart points={trendPoints} loading={fetching} />
				)}
			</div>
		</div>
	);
}

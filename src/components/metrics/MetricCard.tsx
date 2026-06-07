import Link from "next/link";
import { LineagePopover } from "@/app/(app)/data-health/_components/LineagePopover";

import { SparklineChart } from "@/components/charts/SparklineChart";
import { MetricDelta } from "@/components/shared/MetricDelta";
import { formatMetricValue } from "@/lib/formatters";
import type { SparkPoint } from "@/lib/types";

type MetricCardProps = {
	label: string;
	href: string;
	value?: number;
	unit?: string;
	delta?: number;
	/** Label shown in the delta slot when no delta is available (never a bare "--"). */
	deltaUnavailableLabel?: string;
	spark?: SparkPoint[];
	caption?: string;
	className?: string;
	lineageMetricId?: string;
};

export function MetricCard({
	label,
	href,
	value,
	unit,
	delta,
	deltaUnavailableLabel = "No prior period",
	spark,
	caption,
	className,
	lineageMetricId,
}: MetricCardProps) {
	const sparkValues = spark?.map((point) => point.value) ?? [];
	const sparkLabels = spark?.map((point) => point.ts) ?? [];

	return (
		<Link
			href={href}
			className={`group rounded-3xl border border-(--card-stroke) bg-card p-4 transition hover:-translate-y-1 hover:shadow-lg ${className ?? ""}`}
		>
			<div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
				<div className="flex items-center">
					<span>{label}</span>
					{lineageMetricId && <LineagePopover metricId={lineageMetricId} />}
				</div>
				<MetricDelta value={delta} unavailableLabel={deltaUnavailableLabel} />
			</div>
			<div className="mt-3 flex items-center justify-between gap-4">
				<div>
					<p className="text-2xl font-semibold metric-hero">
						{value === undefined || value === null
							? "--"
							: formatMetricValue(value, unit ?? "")}
					</p>
					<p className="mt-2 text-xs text-(--ink-muted)">
						{caption ?? "Open in Explore"}
					</p>
				</div>
				<div className="h-16 w-full">
					{sparkValues.length > 1 ? (
						<SparklineChart
							data={sparkValues}
							categories={sparkLabels}
							height={64}
						/>
					) : (
						<div
							title="Not enough data points to plot a trend yet"
							className="flex h-full items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-2 text-center text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
						>
							No trend yet
						</div>
					)}
				</div>
			</div>
		</Link>
	);
}

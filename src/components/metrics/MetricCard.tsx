import Link from "next/link";
import { LineagePopover } from "@/app/(app)/data-health/_components/LineagePopover";

import { SparklineChart } from "@/components/charts/SparklineChart";
import { MetricDelta } from "@/components/shared/MetricDelta";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatMetricValue } from "@/lib/formatters";
import type { SparkPoint } from "@/lib/types";

type MetricCardProps = {
    label: string;
    /**
     * Drill-down destination. When omitted the card renders as a non-link
     * (no fake hover affordance, no "Open evidence" caption) instead of a
     * placeholder `href="#"` that goes nowhere.
     */
    href?: string;
    value?: number;
    unit?: string;
    delta?: number;
    /** Label shown in the delta slot when no delta is available (never a bare "--"). */
    deltaUnavailableLabel?: string;
    /** Lower-is-better metric: an increase is colored as negative (forwarded to MetricDelta). */
    inverseGood?: boolean;
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
    inverseGood,
    spark,
    caption,
    className,
    lineageMetricId,
}: MetricCardProps) {
    const sparkValues = spark?.map((point) => point.value) ?? [];
    const sparkLabels = spark?.map((point) => point.ts) ?? [];
    // Only a real destination earns the clickable affordance + "Open evidence" cue.
    const captionText = caption ?? (href ? CTA_LABELS.openEvidence : null);
    const cardClassName = `group rounded-3xl border border-(--card-stroke) bg-card p-4 ${
        href ? "transition hover:-translate-y-1 hover:shadow-lg" : ""
    } ${className ?? ""}`;

    const body = (
        <>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                <div className="flex items-center">
                    <span>{label}</span>
                    {lineageMetricId && <LineagePopover metricId={lineageMetricId} />}
                </div>
                <MetricDelta
                    value={delta}
                    unavailableLabel={deltaUnavailableLabel}
                    inverseGood={inverseGood}
                />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                    <p className="text-2xl font-semibold metric-hero">
                        {value === undefined || value === null
                            ? "--"
                            : formatMetricValue(value, unit ?? "")}
                    </p>
                    {captionText && (
                        <p className="mt-2 text-xs text-(--ink-muted)">{captionText}</p>
                    )}
                </div>
                <div className="h-16 w-full">
                    {sparkValues.length > 1 ? (
                        <SparklineChart data={sparkValues} categories={sparkLabels} height={64} />
                    ) : (
                        <div
                            title="Not enough data points to plot a trend yet"
                            className="flex h-full items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-2 text-center text-label-caps uppercase tracking-[0.2em] text-(--ink-muted)"
                        >
                            No trend yet
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    if (!href) {
        return <div className={cardClassName}>{body}</div>;
    }

    return (
        <div className={`relative ${cardClassName}`}>
            <Link
                href={href}
                className="absolute inset-0 z-10 rounded-3xl"
                aria-label={`${label}: ${captionText}`}
            >
                <span className="sr-only" aria-hidden="true">
                    ↗
                </span>
            </Link>
            {body}
        </div>
    );
}

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
    const hasSpark = sparkValues.filter((v) => v !== null).length > 1;
    const hasValue = value !== undefined && value !== null;
    // Concept `.metric` (theme.css min-height 124, style.css padding 18px 20px,
    // theme.css radius 10). Tiles stay in each page's grid.
    const cardClassName = `group relative min-h-[124px] min-w-0 rounded-[10px] border border-(--card-stroke) bg-card px-5 py-[18px] ${
        href ? "transition hover:-translate-y-1 hover:shadow-lg" : ""
    } ${className ?? ""}`;

    const body = (
        <>
            {/* Concept `.metric-title`; label-caps is the design-system rule for uppercase descriptors. */}
            <div className="flex items-center text-label-caps uppercase text-(--ink-muted)">
                <span>{label}</span>
                {lineageMetricId && <LineagePopover metricId={lineageMetricId} />}
            </div>
            {/* Concept `.metric-value` (theme.css 28px, tabular figures, no gradient). */}
            <p
                className={`mt-2.5 text-[28px] font-semibold leading-tight tabular-nums ${
                    hasValue ? "text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {hasValue ? formatMetricValue(value, unit ?? "") : "--"}
            </p>
            {/* Concept `.metric-meta`: `delta · note` as running text; the dot sits only between the two. */}
            <div className={`mt-2 text-xs text-(--ink-muted) ${hasSpark ? "max-w-[55%]" : ""}`}>
                <MetricDelta
                    value={delta}
                    unavailableLabel={deltaUnavailableLabel}
                    inverseGood={inverseGood}
                    leadingDot={false}
                />
                {captionText ? (
                    <>
                        <span aria-hidden="true"> · </span>
                        <span>{captionText}</span>
                    </>
                ) : null}
            </div>
            {/* Concept `.metric .spark` (87x31, bottom-right). End dot, weight and tone: CHAOS-7602. */}
            <div className="absolute bottom-[26px] right-4 h-[31px] w-[87px]">
                {hasSpark ? (
                    <SparklineChart data={sparkValues} categories={sparkLabels} height={31} />
                ) : (
                    <span
                        title="Not enough data points to plot a trend yet"
                        className="flex h-full items-center justify-end text-label-caps uppercase text-(--ink-muted)"
                    >
                        No trend yet
                    </span>
                )}
            </div>
        </>
    );

    if (!href) {
        return <div className={cardClassName}>{body}</div>;
    }

    return (
        <div className={cardClassName}>
            <Link
                href={href}
                className="absolute inset-0 z-10 rounded-[10px]"
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

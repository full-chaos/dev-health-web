import type { ReactNode } from "react";
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
    /** Shown in place of the value when there is none (default "--"). */
    valueUnavailableLabel?: string;
    /** Lower-is-better metric: an increase is colored as negative (forwarded to MetricDelta). */
    inverseGood?: boolean;
    spark?: SparkPoint[];
    caption?: string;
    className?: string;
    lineageMetricId?: string;
    /**
     * Opt-in, for the evidence tiles of the Metrics page. Replaces the delta (`MetricDelta`) with
     * the caller's own node, byte for byte: that page has no per-metric polarity, so it keeps its
     * own sign and tone rule instead of `MetricDelta`'s good / bad coloring.
     */
    deltaSlot?: ReactNode;
    /**
     * Opt-in. Renders the "Open evidence" cue as a button that calls this (an evidence panel),
     * in the note position after the delta. Independent of `href` (the whole-card link).
     */
    onOpenEvidence?: () => void;
    /** Opt-in. A second "Open evidence" link in a footer line under the tile (Explore). */
    evidenceHref?: string;
    /** Text shown in the trend slot when there is nothing to plot. */
    noTrendLabel?: string;
    /** Root element; the Metrics page tiles are `article`s. */
    as?: "div" | "article";
};

export function MetricCard({
    label,
    href,
    value,
    unit,
    delta,
    deltaUnavailableLabel = "No prior period",
    valueUnavailableLabel = "--",
    inverseGood,
    spark,
    caption,
    className,
    lineageMetricId,
    deltaSlot,
    onOpenEvidence,
    evidenceHref,
    noTrendLabel = "No trend yet",
    as: Root = "div",
}: MetricCardProps) {
    const sparkValues = spark?.map((point) => point.value) ?? [];
    const sparkLabels = spark?.map((point) => point.ts) ?? [];
    // Only a real destination earns the clickable affordance + "Open evidence" cue.
    const captionText = caption ?? (href ? CTA_LABELS.openEvidence : null);
    const hasSpark = sparkValues.filter((v) => v !== null).length > 1;
    const hasValue = value !== undefined && value !== null;
    // Concept `.metric` (theme.css min-height 124, style.css padding 18px 20px,
    // theme.css radius 10). Tiles stay in each page's grid.
    const cardClassName = `group relative min-h-31 min-w-0 rounded-(--radius-md) border border-(--card-stroke) bg-card px-5 py-4.5 ${
        href || onOpenEvidence ? "transition hover:-translate-y-1 hover:shadow-lg" : ""
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
                className={`mt-2.5 text-[1.75rem] font-semibold leading-tight tabular-nums ${
                    hasValue ? "text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {hasValue ? formatMetricValue(value, unit ?? "") : valueUnavailableLabel}
            </p>
            {/* Concept `.metric-meta`: `delta · note` as running text; the dot sits only between the two. */}
            <div className={`mt-2 text-xs text-(--ink-muted) ${hasSpark ? "max-w-[55%]" : ""}`}>
                {deltaSlot ?? (
                    <MetricDelta
                        value={delta}
                        unavailableLabel={deltaUnavailableLabel}
                        inverseGood={inverseGood}
                        leadingDot={false}
                    />
                )}
                {onOpenEvidence ? (
                    <>
                        <span aria-hidden="true"> · </span>
                        <button
                            type="button"
                            onClick={onOpenEvidence}
                            className="text-left text-(--accent-2) underline-offset-4 hover:underline"
                        >
                            {CTA_LABELS.openEvidence}
                        </button>
                    </>
                ) : captionText ? (
                    <>
                        <span aria-hidden="true"> · </span>
                        <span>{captionText}</span>
                    </>
                ) : null}
            </div>
            {/* Concept `.metric .spark` (87x31, bottom-right). End dot, weight and tone: CHAOS-7602. */}
            {/* With a footer link the slot sits from the top, so the two never overlap. */}
            <div
                className={`absolute right-4 h-7.75 w-21.75 ${evidenceHref ? "top-15" : "bottom-6.5"}`}
            >
                {hasSpark ? (
                    <SparklineChart data={sparkValues} categories={sparkLabels} height={31} />
                ) : (
                    <span
                        title="Not enough data points to plot a trend yet"
                        className="flex h-full items-center justify-end text-label-caps uppercase text-(--ink-muted)"
                    >
                        {noTrendLabel}
                    </span>
                )}
            </div>
            {evidenceHref && (
                <a
                    href={evidenceHref}
                    className="mt-3 block text-label-caps uppercase text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.openEvidence}
                </a>
            )}
        </>
    );

    if (!href) {
        return <Root className={cardClassName}>{body}</Root>;
    }

    return (
        <Root className={cardClassName}>
            <Link
                href={href}
                className="absolute inset-0 z-10 rounded-(--radius-md)"
                aria-label={`${label}: ${captionText}`}
            >
                <span className="sr-only" aria-hidden="true">
                    ↗
                </span>
            </Link>
            {body}
        </Root>
    );
}

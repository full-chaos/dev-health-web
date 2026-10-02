import { Fragment, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { LineagePopover } from "@/app/(app)/data-health/_components/LineagePopover";

import { SparklineChart } from "@/components/charts/SparklineChart";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { metricDeltaParts } from "@/components/shared/MetricDelta";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatMetricParts } from "@/lib/formatters";
import type { SparkPoint } from "@/lib/types";

type MetricCardProps = {
    label: string;
    /**
     * Drill-down destination. The whole tile is then one link (an overlay), named
     * "<label>: <caption, or Open evidence>". When omitted the tile is not a link: no
     * placeholder `href="#"` that goes nowhere.
     */
    href?: string;
    value?: number;
    unit?: string;
    delta?: number;
    /** Shown in the meta line when no delta is available (never a bare "--"). */
    deltaUnavailableLabel?: string;
    /** Lower-is-better metric: an increase is colored as negative (the `MetricDelta` rule). */
    inverseGood?: boolean;
    spark?: SparkPoint[];
    /** The note of the meta line, after the delta: "<delta> · <caption>". */
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
     * Opt-in. Makes the whole tile one button, named "<label>: Open evidence", that calls this
     * (an evidence panel). The tile face carries no "Open evidence" text. When `href` is also
     * given, the button wins: the tile opens the panel.
     */
    onOpenEvidence?: () => void;
    /** Opt-in. A second "Open evidence" link in a footer line under the tile (Explore). */
    evidenceHref?: string;
    /** Shown in the meta line when there is no series to plot. "" shows nothing. */
    noTrendLabel?: string;
    /** Root element; the Metrics page tiles are `article`s. */
    as?: "div" | "article";
    /**
     * Opt-in, for tiles whose value is already a string (Cognitive Load). Shown as the value in
     * place of `value`, as given: a string is never cut into a number and a unit. A missing
     * value is then the caller's own string, not "Not reported".
     */
    valueText?: string;
    /** Opt-in. A muted description line after the meta row. */
    description?: string;
    /** Opt-in. No trend at all: no sparkline and no "No trend yet" text. */
    hideTrend?: boolean;
    /** Opt-in. `data-testid` on the root element. */
    testId?: string;
};

/** `<></>`: a caller that wants no delta at all passes an empty fragment as `deltaSlot`. */
const isEmptyFragment = (node: ReactNode) =>
    isValidElement<{ children?: ReactNode }>(node) &&
    node.type === Fragment &&
    (node.props.children === undefined || node.props.children === null);

/**
 * The shared metric tile, as the approved prototype `metrics()` draws it:
 * title, value with a small unit, one meta line "<delta> · <note>", and a trend mark bottom right.
 */
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
    deltaSlot,
    onOpenEvidence,
    evidenceHref,
    noTrendLabel = "No trend yet",
    as: Root = "div",
    valueText,
    description,
    hideTrend,
    testId,
}: MetricCardProps) {
    const sparkValues = spark?.map((point) => point.value) ?? [];
    const sparkLabels = spark?.map((point) => point.ts) ?? [];
    const hasSpark = !hideTrend && sparkValues.filter((v) => v !== null).length > 1;
    const numericValue = value !== undefined && value !== null ? value : null;
    const hasValue = valueText !== undefined || numericValue !== null;
    // Number and unit apart, from the number and the served unit (never from a display string).
    const parts = numericValue !== null ? formatMetricParts(numericValue, unit ?? "") : null;
    const deltaParts = metricDeltaParts(delta, { inverseGood });
    const interactive = Boolean(href || onOpenEvidence);

    // Prototype `.metric-meta`: "<delta> · <note>" as running text; a dot only between two parts.
    const meta: Array<{ key: string; node: ReactNode }> = [];
    if (deltaSlot !== undefined && deltaSlot !== null) {
        if (!isEmptyFragment(deltaSlot)) meta.push({ key: "delta", node: deltaSlot });
    } else if (deltaParts) {
        meta.push({
            key: "delta",
            node: (
                <span
                    data-testid="metric-delta"
                    title={deltaParts.polarity === "flat" ? "No change" : undefined}
                    className={`font-medium ${deltaParts.toneClass}`}
                >
                    {deltaParts.label}
                </span>
            ),
        });
    } else {
        meta.push({
            key: "delta",
            node: (
                <span title="No prior period available to compute a change">
                    {deltaUnavailableLabel}
                </span>
            ),
        });
    }
    if (caption) meta.push({ key: "note", node: <span>{caption}</span> });
    // No series is its own state, and it is said in words: a flat line is never drawn for it.
    if (!hideTrend && !hasSpark && noTrendLabel) {
        meta.push({
            key: "trend",
            node: <span title="Not enough data points to plot a trend yet">{noTrendLabel}</span>,
        });
    }

    // Prototype `.metric`: padding 18px 20px, min-height 124px, radius 10px. Under the prototype's
    // 1150px breakpoint (71.9375rem) the padding is 15px and the trend mark is 65px wide.
    const cardClassName = `group relative min-h-31 min-w-0 rounded-(--radius-md) border border-(--card-stroke) bg-card p-3.75 min-[71.9375rem]:px-5 min-[71.9375rem]:py-4.5 ${className ?? ""}`;
    const overlayClassName =
        "absolute inset-0 z-10 rounded-(--radius-md) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--accent-2)";

    return (
        <Root className={cardClassName.trim()} data-testid={testId}>
            {onOpenEvidence ? (
                <button
                    type="button"
                    onClick={onOpenEvidence}
                    aria-label={`${label}: ${CTA_LABELS.openEvidence}`}
                    className={`${overlayClassName} cursor-pointer`}
                />
            ) : href ? (
                <Link
                    href={href}
                    className={overlayClassName}
                    aria-label={`${label}: ${caption ?? CTA_LABELS.openEvidence}`}
                >
                    <span className="sr-only" aria-hidden="true">
                        ↗
                    </span>
                </Link>
            ) : null}
            {/* Prototype `.metric-title`: 12px, medium, muted, as written (not uppercase). */}
            <div
                data-testid="metric-title"
                className={`mb-2.5 flex items-center text-xs leading-5.5 font-medium text-(--ink-muted) ${
                    interactive ? "transition-colors group-hover:text-foreground" : ""
                }`.trim()}
            >
                <span>{label}</span>
                {lineageMetricId && <LineagePopover metricId={lineageMetricId} />}
            </div>
            {/* Prototype `.metric-value`: 28px bold, tight tracking, the unit small and muted beside it. */}
            <p
                data-testid="metric-value"
                className={`flex items-baseline gap-1.25 text-[1.75rem] leading-[1.1] font-bold tracking-[-0.05rem] ${
                    hasValue ? "text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {valueText !== undefined ? (
                    valueText
                ) : parts ? (
                    <>
                        <span>{parts.value}</span>
                        {/* A real space, so the text reads "1.5 days" when copied or read aloud; the flex gap draws it. */}
                        {parts.unit ? " " : null}
                        {parts.unit ? (
                            <span
                                data-testid="metric-unit"
                                className="text-xs font-normal tracking-normal text-(--ink-muted)"
                            >
                                {parts.unit}
                            </span>
                        ) : null}
                    </>
                ) : (
                    NOT_REPORTED
                )}
            </p>
            {meta.length > 0 ? (
                <div
                    data-testid="metric-meta"
                    className={`mt-2.25 text-label-caps leading-5.5 tracking-normal text-(--ink-muted) ${
                        hasSpark ? "max-w-[55%]" : "max-w-[90%]"
                    }`}
                >
                    {meta.map((part, index) => (
                        <Fragment key={part.key}>
                            {index > 0 ? <span aria-hidden="true"> · </span> : null}
                            {part.node}
                        </Fragment>
                    ))}
                </div>
            ) : null}
            {description ? (
                <p
                    data-testid="metric-description"
                    className="mt-3 text-sm leading-6 text-(--ink-muted)"
                >
                    {description}
                </p>
            ) : null}
            {/* Prototype `.metric .spark`: 87x31 (65 wide under 1150px), 16px from the right, 26px from the bottom. */}
            {/* With a footer link the mark sits from the top, so the two never overlap. */}
            {/* On a button tile the mark stays above the overlay, so its hover tooltip still works; a click on it opens the same evidence. */}
            {hasSpark ? (
                <div
                    data-testid="metric-spark"
                    onClick={onOpenEvidence}
                    className={`absolute right-4 h-7.75 w-16.25 opacity-95 min-[71.9375rem]:w-21.75 ${
                        evidenceHref ? "top-15" : "bottom-6.5"
                    } ${onOpenEvidence ? "z-20 cursor-pointer" : ""}`.trim()}
                >
                    {/* The line is muted; the end dot is the series color, or the negative color when the delta is a regression. */}
                    <SparklineChart
                        variant="tile"
                        data={sparkValues}
                        categories={sparkLabels}
                        height={31}
                        tone={!deltaSlot && deltaParts?.polarity === "bad" ? "bad" : "default"}
                    />
                </div>
            ) : null}
            {evidenceHref && (
                <a
                    href={evidenceHref}
                    className="relative z-20 mt-3 block text-label-caps uppercase text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.openEvidence}
                </a>
            )}
        </Root>
    );
}

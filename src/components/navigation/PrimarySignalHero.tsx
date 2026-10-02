import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
    AREA_STATE_LABEL,
    AREA_STATE_PILL,
    AREA_STATE_VALUE_COLOR,
} from "@/components/home/severityTokens";
import { buttonClassName } from "@/components/shared/Button";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

// Concept `.hero-signal`: a 3px left edge in the severity color. The badge word still says the
// state; the edge only repeats it.
const HERO_EDGE: Record<Exclude<AreaSignal["state"], "unavailable">, string> = {
    critical: "border-l-(--accent-negative)",
    high: "border-l-(--accent-3)",
    medium: "border-l-(--accent-2)",
    low: "border-l-(--ink-muted)",
    neutral: "border-l-(--ink-muted)",
};

type PrimarySignalHeroProps = {
    /** The signal chosen by the caller's severity rule. Never an unavailable one. */
    signal: AreaSignal & { state: Exclude<AreaSignal["state"], "unavailable"> };
    filters: MetricFilter;
    role?: string;
    /**
     * Visible action text, supplied by the caller from the approved prototype copy for that view
     * (for example "Inspect code"). Without it the whole hero is the link (no invented copy).
     */
    actionLabel?: string;
    /**
     * The caller's own primary action (for example a button that opens the evidence drawer). It
     * takes the place of the link: with it the hero draws no link, and `signal.href` and
     * `actionLabel` are not used.
     */
    action?: ReactNode;
    /**
     * Heading element of the signal name. Default `h3` (the hero under a section heading). A page
     * where the hero comes right after the page title passes `h2`, so no heading level is skipped.
     */
    titleAs?: "h2" | "h3";
};

/**
 * Shared primary-signal hero (prototype `hero()`): severity badge and "Primary signal" eyebrow,
 * the sub-area name, an optional caption, the headline value exactly as served, its metric name,
 * and one primary action: the caller's own `action` node, or a link into the sub-area with the
 * prototype action text; with neither, the whole hero links there.
 *
 * Presentational. It shows the served `value`, `metricLabel` and `driver` and picks nothing:
 * the caller chooses the signal (existing severity rule).
 */
export function PrimarySignalHero({
    signal,
    filters,
    role,
    actionLabel,
    action,
    titleAs: TitleTag = "h3",
}: PrimarySignalHeroProps) {
    const href = withFilterParam(signal.href, filters, role);
    return (
        <div
            data-testid="area-signal-card"
            data-signal-id={signal.id}
            data-state={signal.state}
            data-emphasized="true"
            className={`relative flex flex-wrap items-center justify-between gap-5.5 rounded-(--radius-md) border border-l-3 border-(--card-stroke) bg-(--card) p-6.25 ${HERO_EDGE[signal.state]}`}
        >
            {action || actionLabel ? null : (
                <Link
                    href={href}
                    aria-label={signal.label}
                    data-testid="area-signal-hero-link"
                    className="absolute inset-0 rounded-(--radius-md)"
                />
            )}
            <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                    <span
                        data-testid="area-signal-badge"
                        className={`shrink-0 rounded-sm px-1.75 py-0.75 text-xs font-semibold ${AREA_STATE_PILL[signal.state]}`}
                    >
                        {AREA_STATE_LABEL[signal.state]}
                    </span>
                    <span className="text-label-caps uppercase text-(--ink-muted)">
                        Primary signal
                    </span>
                </div>
                <TitleTag className="mt-2 font-(--font-display) text-xl leading-7 text-foreground">
                    {signal.label}
                </TitleTag>
                {signal.driver ? (
                    <p
                        data-testid="area-signal-driver"
                        className="mt-1.5 text-xs text-(--ink-muted)"
                    >
                        {signal.driver}
                    </p>
                ) : null}
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
                {signal.value ? (
                    <span
                        data-testid="area-signal-value"
                        className={`text-[2.3125rem] font-semibold leading-tight tabular-nums ${AREA_STATE_VALUE_COLOR[signal.state]}`}
                    >
                        {signal.value}
                    </span>
                ) : null}
                <span className="text-xs text-(--ink-muted)">{signal.metricLabel}</span>
                {action ? (
                    <div data-testid="area-signal-hero-action" className="mt-3">
                        {action}
                    </div>
                ) : actionLabel ? (
                    <Link href={href} className={buttonClassName("primary", "md", "mt-3")}>
                        {actionLabel}
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

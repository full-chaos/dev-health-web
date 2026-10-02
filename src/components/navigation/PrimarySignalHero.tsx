import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AREA_STATE_BADGE, AREA_STATE_LABEL } from "@/components/home/severityTokens";
import { buttonClassName } from "@/components/shared/Button";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { CTA_LABELS } from "@/lib/design/cta";
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
};

/**
 * Shared primary-signal hero (prototype `hero()`): severity badge and "Primary signal" eyebrow,
 * the sub-area name, an optional caption, the headline value exactly as served, its metric name,
 * and one primary action into the sub-area.
 *
 * Presentational. It shows the served `value`, `metricLabel` and `driver` and picks nothing:
 * the caller chooses the signal (existing severity rule).
 */
export function PrimarySignalHero({ signal, filters, role }: PrimarySignalHeroProps) {
    const href = withFilterParam(signal.href, filters, role);
    return (
        <div
            data-testid="area-signal-card"
            data-signal-id={signal.id}
            data-state={signal.state}
            data-emphasized="true"
            className={`flex flex-wrap items-center justify-between gap-5.5 rounded-(--radius-md) border border-l-3 border-(--card-stroke) bg-(--card) p-6.25 ${HERO_EDGE[signal.state]}`}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                    <span
                        data-testid="area-signal-badge"
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.18em] ${AREA_STATE_BADGE[signal.state]}`}
                    >
                        {AREA_STATE_LABEL[signal.state]}
                    </span>
                    <span className="text-label-caps uppercase text-(--ink-muted)">
                        Primary signal
                    </span>
                </div>
                <h3 className="mt-2 font-(--font-display) text-xl leading-7 text-foreground">
                    {signal.label}
                </h3>
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
                        className="text-[2.3125rem] font-semibold leading-tight tabular-nums text-foreground"
                    >
                        {signal.value}
                    </span>
                ) : null}
                <span className="text-xs text-(--ink-muted)">{signal.metricLabel}</span>
                <Link href={href} className={buttonClassName("primary", "md", "mt-3")}>
                    {CTA_LABELS.openSignal} {signal.label}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}

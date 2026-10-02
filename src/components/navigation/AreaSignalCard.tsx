import Link from "next/link";

import { DataState } from "@/components/ui/DataState";
import {
    AREA_STATE_LABEL,
    AREA_STATE_PILL,
    DIRECTION_GLYPH,
} from "@/components/home/severityTokens";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { AREA_UNAVAILABLE_EMPTY_STATE } from "@/lib/design/emptyState";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

// ── AreaSignalCard (CHAOS-2074) ───────────────────────────────────────────────
//
// One sub-area rendered as a signal card on its area's landing page (Framework
// A2a): a severity badge + metric label + state value + drill-in affordance,
// matching {@link SignalCard}'s visual language via the shared severity tokens.
// An RSC (no client state) — the whole card is a link into the sub-area.
//
// Honest states (owner decision 1): a signal whose value is genuinely
// unavailable renders an inline {@link DataState} instead of a fabricated
// number. Demoted signals (R4 low-value single surfaces) render visually
// secondary — tighter padding, no emphasis — within their cluster.

// Concept `.hero-signal`: a 3px left edge in the severity color. The word on the badge still says
// the state; the edge only repeats it.
const HERO_EDGE: Record<Exclude<AreaSignal["state"], "unavailable">, string> = {
    critical: "border-l-(--accent-negative)",
    high: "border-l-(--accent-3)",
    medium: "border-l-(--accent-2)",
    low: "border-l-(--ink-muted)",
    neutral: "border-l-(--ink-muted)",
};

type AreaSignalCardProps = {
    signal: AreaSignal;
    filters: MetricFilter;
    role?: string;
    /** Top-signal emphasis (mirrors RankedSignals' lead card). */
    emphasized?: boolean;
};

export function AreaSignalCard({ signal, filters, role, emphasized = false }: AreaSignalCardProps) {
    const href = withFilterParam(signal.href, filters, role);
    const demoted = signal.demoted === true;
    // Preview sub-area: its route does not exist yet (nav child `preview: true`).
    // Render the card NON-CLICKABLE so it stays visible + honest but can't 404.
    // Keyed on the explicit `preview` flag, NOT on `state === "unavailable"`,
    // which is shared by areas whose routes DO exist and must stay clickable.
    const isPreview = signal.preview === true;

    // Unavailable → inline DataState (never a fabricated value). A real (routed)
    // sub-area stays a link so it remains reachable; a preview sub-area renders as
    // a plain <div> (same visual) so the dead route is never linked.
    if (signal.state === "unavailable") {
        // The dashed box is the DataState inside (3.6); only ROUTED (clickable) cards get the hover
        // affordance — a preview card must not look interactive.
        const unavailableBaseClassName =
            "group block min-h-30 overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-(--card) p-4.75";
        const unavailableClassName = `${unavailableBaseClassName} transition hover:border-(--accent)`;
        const body = (
            <>
                <h3 className="font-(--font-display) text-base leading-tight text-foreground">
                    {signal.label}
                </h3>
                <DataState
                    variant="detector-unavailable"
                    title={AREA_UNAVAILABLE_EMPTY_STATE.title}
                    description={AREA_UNAVAILABLE_EMPTY_STATE.description}
                    className="mt-3"
                    compact
                    data-testid="area-signal-unavailable"
                />
            </>
        );

        if (isPreview) {
            return (
                <div
                    data-testid="area-signal-card"
                    data-signal-id={signal.id}
                    data-state="unavailable"
                    data-tier="muted"
                    data-preview="true"
                    aria-disabled="true"
                    className={unavailableBaseClassName}
                >
                    {body}
                </div>
            );
        }

        return (
            <Link
                href={href}
                data-testid="area-signal-card"
                data-signal-id={signal.id}
                data-state="unavailable"
                data-tier="muted"
                className={unavailableClassName}
            >
                {body}
            </Link>
        );
    }

    const badge = AREA_STATE_PILL[signal.state];
    const stateLabel = AREA_STATE_LABEL[signal.state];

    return (
        <Link
            href={href}
            data-testid="area-signal-card"
            data-signal-id={signal.id}
            data-state={signal.state}
            data-demoted={demoted ? "true" : "false"}
            data-emphasized={emphasized ? "true" : "false"}
            className={
                emphasized
                    ? `group relative block overflow-hidden rounded-(--radius-md) border border-l-3 border-(--card-stroke) bg-(--card) p-6 transition hover:-translate-y-0.5 hover:border-(--accent) ${HERO_EDGE[signal.state]}`
                    : demoted
                      ? "group block rounded-(--radius-md) border border-(--card-stroke) bg-(--card-70) px-4 py-3 transition hover:border-(--accent)"
                      : "group block min-h-30 overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-(--card) p-4.75 transition hover:-translate-y-0.5 hover:border-(--accent)"
            }
        >
            {emphasized ? (
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--accent-text)">
                    Top signal
                </p>
            ) : null}

            <header className="mt-1 flex items-start justify-between gap-3">
                <h3
                    className={
                        emphasized
                            ? "font-(--font-display) text-xl leading-7 text-foreground"
                            : demoted
                              ? "text-sm font-medium text-foreground"
                              : "font-(--font-display) text-base leading-tight text-foreground"
                    }
                >
                    {signal.label}
                </h3>
                <span
                    data-testid="area-signal-badge"
                    className={`shrink-0 rounded-sm px-1.75 py-0.75 text-xs font-semibold ${badge}`}
                >
                    {stateLabel}
                </span>
            </header>

            {/* Metric label + formatted value (+ optional trend glyph). A value-less
          neutral card (navigational sub-area) shows just its descriptor copy. */}
            {signal.value ? (
                <>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                            data-testid="area-signal-value"
                            className={
                                demoted
                                    ? "text-lg font-semibold tabular-nums text-foreground"
                                    : emphasized
                                      ? "text-[2.3125rem] font-semibold leading-tight tabular-nums text-foreground"
                                      : "text-2xl font-semibold tabular-nums text-foreground"
                            }
                        >
                            {signal.value}
                        </span>
                        {signal.direction ? (
                            <span aria-hidden className="text-xs text-(--ink-muted)">
                                {DIRECTION_GLYPH[signal.direction]}
                            </span>
                        ) : null}
                    </div>
                    {/* Approved `.signal small`: the metric name sits below the value as link text with an arrow. */}
                    <p
                        data-testid="area-signal-metric"
                        className="mt-1 text-xs text-(--accent-2) group-hover:underline"
                    >
                        {signal.metricLabel} <span aria-hidden="true">→</span>
                    </p>
                </>
            ) : (
                <p className="mt-2 text-sm text-(--ink-muted)">{signal.metricLabel}</p>
            )}

            {/* The number that set the state, when it is not the headline value. */}
            {signal.driver ? (
                <p data-testid="area-signal-driver" className="mt-1.5 text-xs text-(--ink-muted)">
                    {signal.driver}
                </p>
            ) : null}
        </Link>
    );
}

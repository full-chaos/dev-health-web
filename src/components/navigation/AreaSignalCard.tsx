import Link from "next/link";

import { DataState } from "@/components/ui/DataState";
import {
    AREA_STATE_BADGE,
    AREA_STATE_LABEL,
    AREA_STATE_TAB,
    DIRECTION_GLYPH,
} from "@/components/home/severityTokens";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { cardClassName } from "@/lib/design/card";
import { AREA_UNAVAILABLE_EMPTY_STATE } from "@/lib/design/emptyState";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

// ── AreaSignalCard (CHAOS-2074, visual: CHAOS-2109) ──────────────────────────
//
// One sub-area rendered as a signal card on its area's landing page (Framework
// A2a): the Penpot Area Card chrome — severity accent tab + title + state badge
// + metric line — on the canonical C4 card shell. An RSC (no client state) —
// the whole card is a link into the sub-area.
//
// Honest states (owner decision 1): a signal whose value is genuinely
// unavailable renders an inline {@link DataState} instead of a fabricated
// number. Demoted signals (R4 low-value single surfaces) render visually
// secondary — tighter padding, no emphasis, no accent tab — within their
// cluster.

type AreaSignalCardProps = {
    signal: AreaSignal;
    filters: MetricFilter;
    role?: string;
    /** Top-signal emphasis (mirrors RankedSignals' lead card). */
    emphasized?: boolean;
};

/**
 * The Penpot Area Card accent tab: a thin severity-tinted strip across the top
 * of the card chrome. The hero card's tab is always accent-colored; grid cards
 * tint by state. Rendered OUTSIDE the padded body so it bleeds to the card edge.
 */
function AccentTab({ className }: { className: string }) {
    return (
        <span
            aria-hidden
            data-testid="area-signal-accent-tab"
            className={`absolute inset-x-0 top-0 h-1 ${className}`}
        />
    );
}

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
        // Base dashed treatment (no accent tab — there is no signal to tint by);
        // only ROUTED (clickable) cards get the hover affordance — a preview card
        // must not look interactive.
        const unavailableBaseClassName =
            "group block rounded-(--radius-lg) border border-dashed border-(--border) bg-(--surface)/60 p-4 opacity-70 transition";
        const unavailableClassName = `${unavailableBaseClassName} hover:border-(--card-stroke-active) hover:opacity-100`;
        const body = (
            <>
                <p className="text-label-caps uppercase text-(--text-muted)">{signal.label}</p>
                <DataState
                    variant="detector-unavailable"
                    title={AREA_UNAVAILABLE_EMPTY_STATE.title}
                    description={AREA_UNAVAILABLE_EMPTY_STATE.description}
                    className="mt-3"
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

    const badge = AREA_STATE_BADGE[signal.state];
    const stateLabel = AREA_STATE_LABEL[signal.state];
    // Hero cards always carry the area accent; grid cards tint by severity.
    const tab = emphasized ? "bg-(--accent)" : AREA_STATE_TAB[signal.state];

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
                    ? cardClassName(
                          "group relative block overflow-hidden bg-gradient-to-br from-(--surface-raised) to-(--surface) p-6 transition hover:-translate-y-1 hover:border-(--card-stroke-active)",
                      )
                    : demoted
                      ? "group block rounded-(--radius-md) border border-(--border) bg-(--surface) px-4 py-3 transition hover:border-(--card-stroke-active)"
                      : cardClassName(
                            "group relative block overflow-hidden p-4 transition hover:-translate-y-1 hover:border-(--card-stroke-active)",
                        )
            }
        >
            {/* Demoted R4 surfaces stay visually secondary: no accent tab. */}
            {demoted ? null : <AccentTab className={tab} />}

            {emphasized ? (
                <p className="text-label-caps uppercase text-(--accent)">Top signal</p>
            ) : null}

            <header className="mt-1 flex items-start justify-between gap-3">
                <h3
                    className={
                        emphasized
                            ? "font-(--font-display) text-xl leading-tight text-(--text-primary)"
                            : demoted
                              ? "text-sm font-medium text-(--text-primary)"
                              : "font-(--font-display) text-base leading-tight text-(--text-primary)"
                    }
                >
                    {signal.label}
                </h3>
                <span
                    data-testid="area-signal-badge"
                    className={`text-label-caps shrink-0 rounded-(--radius-pill) border px-2.5 py-0.5 uppercase ${badge}`}
                >
                    {stateLabel}
                </span>
            </header>

            {/* Metric label + formatted value (+ optional trend glyph). A value-less
          neutral card (navigational sub-area) shows just its descriptor copy. */}
            {signal.value ? (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span
                        data-testid="area-signal-value"
                        className={
                            demoted
                                ? "metric-hero text-lg font-semibold text-(--text-primary)"
                                : "metric-hero text-2xl font-semibold text-(--text-primary)"
                        }
                    >
                        {signal.value}
                    </span>
                    {signal.direction ? (
                        <span aria-hidden className="text-xs text-(--text-muted)">
                            {DIRECTION_GLYPH[signal.direction]}
                        </span>
                    ) : null}
                    <span className="text-label-caps uppercase text-(--text-muted)">
                        {signal.metricLabel}
                    </span>
                </div>
            ) : (
                <p className="mt-2 text-sm text-(--text-secondary)">{signal.metricLabel}</p>
            )}
        </Link>
    );
}

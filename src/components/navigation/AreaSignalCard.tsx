import Link from "next/link";

import { DataState } from "@/components/ui/DataState";
import {
  AREA_STATE_BADGE,
  AREA_STATE_LABEL,
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

  // Unavailable → inline DataState (never a fabricated value). Still a link so
  // the sub-area stays reachable from the card.
  if (signal.state === "unavailable") {
    return (
      <Link
        href={href}
        data-testid="area-signal-card"
        data-signal-id={signal.id}
        data-state="unavailable"
        className="group block rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 transition hover:border-(--accent)"
      >
        <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">{signal.label}</p>
        <DataState
          variant="detector-unavailable"
          title={AREA_UNAVAILABLE_EMPTY_STATE.title}
          description={AREA_UNAVAILABLE_EMPTY_STATE.description}
          className="mt-3"
          data-testid="area-signal-unavailable"
        />
      </Link>
    );
  }

  const badge = AREA_STATE_BADGE[signal.state];
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
          ? "group relative block overflow-hidden rounded-3xl border border-(--accent)/30 bg-gradient-to-br from-(--card) to-(--card-80) p-6 shadow-lg ring-1 ring-(--accent)/10 transition hover:-translate-y-1 hover:border-(--accent)"
          : demoted
            ? "group block rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3 transition hover:border-(--accent)"
            : "group block overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card) p-4 transition hover:-translate-y-1 hover:border-(--accent)"
      }
    >
      {emphasized ? (
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--accent)">
          Top signal
        </p>
      ) : null}

      <header className="mt-1 flex items-start justify-between gap-3">
        <h3
          className={
            emphasized
              ? "font-(--font-display) text-xl leading-tight text-foreground"
              : demoted
                ? "text-sm font-medium text-foreground"
                : "font-(--font-display) text-base leading-tight text-foreground"
          }
        >
          {signal.label}
        </h3>
        <span
          data-testid="area-signal-badge"
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.18em] ${badge}`}
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
                ? "metric-hero text-lg font-semibold text-foreground"
                : "metric-hero text-2xl font-semibold text-foreground"
            }
          >
            {signal.value}
          </span>
          {signal.direction ? (
            <span aria-hidden className="text-xs text-(--ink-muted)">
              {DIRECTION_GLYPH[signal.direction]}
            </span>
          ) : null}
          <span className="text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
            {signal.metricLabel}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-(--ink-muted)">{signal.metricLabel}</p>
      )}
    </Link>
  );
}

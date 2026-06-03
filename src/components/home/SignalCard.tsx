"use client";

import { formatDelta, formatMetricValue } from "@/lib/formatters";

/**
 * Cockpit signal contract (CHAOS-2050).
 *
 * PROVISIONAL: these types are proposed to cockpit-lead and will move to the
 * canonical `web/src/lib/types.ts` once published on the enriched HomeResponse
 * (`signals: CockpitSignal[]`). On integration, swap the local imports for
 * `import type { CockpitSignal } from "@/lib/types"`. Field names/enum values
 * are derived directly from the CHAOS-2050 acceptance criteria and aligned with
 * the EvidenceConfidence band in `@/components/evidence/contract.ts`.
 */
export type SignalSeverity = "critical" | "high" | "medium" | "low";
export type SignalConfidence = "high" | "medium" | "low";
export type SignalDirection = "up" | "down" | "flat";

export type CockpitSignal = {
  id: string;
  /** Human-facing claim/title for the signal. */
  title: string;
  /** Metric key the signal is grounded in. */
  metric: string;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  /** Human label for the affected blast-radius, e.g. "3 repos · payments". */
  affected_scope: string;
  /** Count of traceable artifacts backing the signal. */
  evidence_count: number;
  /** Current-window metric value. */
  current: number;
  /** Prior-window value, or null when no comparable prior period exists. */
  prior: number | null;
  /** Percentage change between prior and current. */
  delta_pct: number;
  /** Unit for current/prior (drives formatting): "%", "days", "hours", "loc"... */
  unit: string;
  direction: SignalDirection;
  /** Plain-language "so what" — why this signal deserves attention. */
  why_it_matters: string;
  /** The single recommended next action (also surfaced as a cockpit CTA). */
  recommended_action: string;
  /** apiUrl the EvidencePanel fetches to populate claim/value/evidence/action. */
  evidence_ref: string;
};

/** Callback into the panel owner (RankedSignals / cockpit-lead's CockpitClient). */
export type OpenEvidence = (title: string, params: { apiUrl?: string; metric?: string }) => void;

export type SignalCardProps = {
  signal: CockpitSignal;
  /** When true, render the emphasized "top signal" treatment. */
  emphasized?: boolean;
  onOpenEvidence: OpenEvidence;
};

const SEVERITY_BADGE: Record<SignalSeverity, string> = {
  critical: "border-red-500/30 bg-red-500/15 text-red-300",
  high: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  medium: "border-(--accent-2)/30 bg-(--accent-2)/12 text-(--accent-2)",
  low: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
};

const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const CONFIDENCE_DOT: Record<SignalConfidence, string> = {
  high: "bg-(--accent-3)",
  medium: "bg-amber-400",
  low: "bg-(--ink-muted)",
};

const CONFIDENCE_TEXT: Record<SignalConfidence, string> = {
  high: "text-(--accent-3)",
  medium: "text-amber-300",
  low: "text-(--ink-muted)",
};

const DIRECTION_GLYPH: Record<SignalDirection, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

const directionAccent = (direction: SignalDirection) =>
  direction === "up"
    ? "text-(--accent-3)"
    : direction === "down"
      ? "text-(--accent-negative)"
      : "text-(--ink-muted)";

export function SignalCard({ signal, emphasized = false, onOpenEvidence }: SignalCardProps) {
  const open = () => onOpenEvidence(signal.title, { apiUrl: signal.evidence_ref || undefined });

  const hasPrior = signal.prior !== null;

  return (
    <article
      data-testid="signal-card"
      data-severity={signal.severity}
      data-confidence={signal.confidence}
      data-direction={signal.direction}
      data-emphasized={emphasized ? "true" : "false"}
      className={
        emphasized
          ? "relative overflow-hidden rounded-3xl border border-(--accent)/30 bg-gradient-to-br from-(--card) to-(--card-80) p-6 shadow-lg ring-1 ring-(--accent)/10"
          : "relative overflow-hidden rounded-3xl border border-(--card-stroke) bg-(--card) p-5"
      }
    >
      {emphasized && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-(--accent)">
          Top signal
        </p>
      )}

      {/* Title + severity badge */}
      <header className="mt-1 flex items-start justify-between gap-3">
        <h3
          className={
            emphasized
              ? "font-(--font-display) text-2xl leading-tight text-foreground"
              : "font-(--font-display) text-lg leading-tight text-foreground"
          }
        >
          {signal.title}
        </h3>
        <span
          data-testid="signal-severity"
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${SEVERITY_BADGE[signal.severity]}`}
        >
          {SEVERITY_LABEL[signal.severity]}
        </span>
      </header>

      {/* Current / prior / delta + direction */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          data-testid="signal-current"
          className="metric-hero text-3xl font-semibold text-foreground"
        >
          {formatMetricValue(signal.current, signal.unit)}
        </span>
        <span
          data-testid="signal-delta"
          className={`flex items-center gap-1 text-sm font-medium ${directionAccent(signal.direction)}`}
        >
          <span aria-hidden>{DIRECTION_GLYPH[signal.direction]}</span>
          {formatDelta(signal.delta_pct)}
        </span>
        {hasPrior ? (
          <span className="text-xs text-(--ink-muted)">
            from {formatMetricValue(signal.prior as number, signal.unit)} prior
          </span>
        ) : (
          <span className="text-xs text-(--ink-muted)">no prior period</span>
        )}
      </div>

      {/* The four required encodings: severity (above) + confidence, scope, evidence count */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          data-testid="signal-confidence"
          className={`inline-flex items-center gap-1.5 rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 font-medium uppercase tracking-[0.12em] ${CONFIDENCE_TEXT[signal.confidence]}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[signal.confidence]}`} />
          {signal.confidence} confidence
        </span>
        <span
          data-testid="signal-scope"
          className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 text-(--ink-muted)"
        >
          {signal.affected_scope}
        </span>
        <span
          data-testid="signal-evidence-count"
          className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 text-(--ink-muted)"
        >
          {signal.evidence_count} {signal.evidence_count === 1 ? "artifact" : "artifacts"}
        </span>
      </div>

      {/* Why it matters */}
      <p data-testid="signal-why" className="mt-4 text-sm leading-6 text-(--ink-muted)">
        {signal.why_it_matters}
      </p>

      {/* Recommended action — explicit, not buried in the drawer */}
      <div
        data-testid="signal-recommended-action"
        className="mt-4 rounded-2xl border border-(--accent)/20 bg-(--accent)/8 p-3"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
          Recommended action
        </p>
        <p className="mt-1 text-sm leading-5 text-foreground">{signal.recommended_action}</p>
      </div>

      {/* Evidence affordance */}
      <button
        type="button"
        data-testid="signal-open-evidence"
        onClick={open}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.18em] text-(--ink-muted) transition-colors hover:border-(--accent)/40 hover:bg-(--accent)/10 hover:text-(--accent)"
      >
        Open evidence
        <span aria-hidden>↗</span>
      </button>
    </article>
  );
}

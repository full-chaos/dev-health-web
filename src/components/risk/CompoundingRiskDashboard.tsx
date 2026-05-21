/**
 * CompoundingRiskDashboard — visual surface for the Compounding Risk composite
 * (CHAOS-1642).
 *
 * Renders:
 *   1. A scope-aware banner with headline score, severity chip, and a trend sparkline.
 *   2. A component-breakdown card showing each normalized contribution + its raw value.
 *   3. A sortable per-scope table linking out to Work Graph evidence.
 *
 * Every value shown to the user maps to a persisted field on
 * ``compounding_risk_daily`` — the score is fully inspectable.
 *
 * Per the no-surveillance contract, this surface intentionally has no
 * person/developer breakout.
 */

import Link from "next/link";

function buildRiskDrilldownUrl({
  scope,
}: {
  scope: { kind: "repo" | "team"; id: string };
}): string {
  const params = new URLSearchParams({
    tab: "graph",
    risk_scope_kind: scope.kind,
    risk_scope_id: scope.id,
  });
  return `/work?${params.toString()}`;
}

export type CompoundingRiskSeverity =
  | "unknown"
  | "low"
  | "elevated"
  | "high";

export type CompoundingRiskScope = "repo" | "team";

export type CompoundingRiskComponentsView = {
  churnNorm: number | null;
  complexityNorm: number | null;
  ownershipNorm: number | null;
  reviewNorm: number | null;
  reworkChurn: number | null;
  complexityDelta: number | null;
  busFactor: number | null;
  ownershipGini: number | null;
  singleOwnerRatio: number | null;
  reviewLatencyP90h: number | null;
};

export type CompoundingRiskWeightsView = {
  churn: number;
  complexity: number;
  ownership: number;
  review: number;
};

export type CompoundingRiskThresholdsView = {
  elevated: number;
  high: number;
};

export type CompoundingRiskRowView = {
  day: string;
  scope: CompoundingRiskScope;
  scopeId: string;
  scopeLabel: string;
  score: number | null;
  severity: CompoundingRiskSeverity;
  components: CompoundingRiskComponentsView;
  weights: CompoundingRiskWeightsView;
  thresholds: CompoundingRiskThresholdsView;
  computedAt: string;
};

export type CompoundingRiskTrendPointView = {
  day: string;
  score: number | null;
  severity: CompoundingRiskSeverity;
};

export type CompoundingRiskDashboardProps = {
  orgId: string;
  breakout: CompoundingRiskScope;
  rows: CompoundingRiskRowView[];
  trend: CompoundingRiskTrendPointView[];
  generatedAt: string;
};

const SEVERITY_COPY: Record<CompoundingRiskSeverity, { label: string; tone: string }> = {
  unknown: {
    label: "Unknown",
    tone: "border-slate-400/40 bg-slate-100/60 text-slate-700",
  },
  low: {
    label: "Low",
    tone: "border-emerald-400/40 bg-emerald-50/70 text-emerald-800",
  },
  elevated: {
    label: "Elevated",
    tone: "border-amber-400/40 bg-amber-50/70 text-amber-900",
  },
  high: {
    label: "High",
    tone: "border-rose-400/40 bg-rose-50/70 text-rose-900",
  },
};

function fmtScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function fmtPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function fmtRawNumber(value: number | null, suffix?: string): string {
  if (value === null || Number.isNaN(value)) return "—";
  const formatted = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return suffix ? `${formatted}${suffix}` : formatted;
}

function selectHeadlineRow(
  rows: CompoundingRiskRowView[],
): CompoundingRiskRowView | null {
  if (rows.length === 0) return null;
  const scored = rows.find((r) => r.score !== null);
  return scored ?? rows[0];
}

function SeverityChip({ severity }: { severity: CompoundingRiskSeverity }) {
  const { label, tone } = SEVERITY_COPY[severity];
  return (
    <span
      data-testid="severity-chip"
      data-severity={severity}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {label}
    </span>
  );
}

function TrendSparkline({
  trend,
}: {
  trend: CompoundingRiskTrendPointView[];
}) {
  if (trend.length === 0) {
    return (
      <p className="text-xs text-(--ink-muted)">
        Trend data is not yet available for this scope.
      </p>
    );
  }
  const max = Math.max(0.01, ...trend.map((p) => p.score ?? 0));
  return (
    <div
      aria-label="30-day compounding-risk trend"
      className="mt-4 flex h-20 items-end gap-1"
      data-testid="trend-sparkline"
    >
      {trend.map((point) => {
        const height = point.score === null ? 4 : Math.max(4, (point.score / max) * 70);
        return (
          <div
            key={point.day}
            className="flex-1 rounded-t-sm bg-(--accent)"
            style={{ height: `${height}px`, opacity: point.score === null ? 0.25 : 1 }}
            title={`${point.day}: ${fmtScore(point.score)}`}
          />
        );
      })}
    </div>
  );
}

function ComponentBars({ row }: { row: CompoundingRiskRowView }) {
  const components: Array<{
    key: keyof CompoundingRiskComponentsView;
    label: string;
    weight: number;
    raw: string;
  }> = [
    {
      key: "churnNorm",
      label: "Churn",
      weight: row.weights.churn,
      raw: `rework churn ${fmtPercent(row.components.reworkChurn)}`,
    },
    {
      key: "complexityNorm",
      label: "Complexity",
      weight: row.weights.complexity,
      raw: `Δ ${fmtPercent(row.components.complexityDelta)}`,
    },
    {
      key: "ownershipNorm",
      label: "Ownership",
      weight: row.weights.ownership,
      raw: `gini ${fmtScore(row.components.ownershipGini)} · single-owner ${fmtPercent(row.components.singleOwnerRatio)}`,
    },
    {
      key: "reviewNorm",
      label: "Review latency",
      weight: row.weights.review,
      raw: `p90 ${fmtRawNumber(row.components.reviewLatencyP90h, "h")}`,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {components.map((component) => {
        const norm = row.components[component.key];
        const width = norm === null ? 0 : Math.max(2, norm * 100);
        return (
          <article
            key={component.key}
            className="rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-sm"
            data-testid={`component-${component.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
                {component.label}
              </p>
              <p className="text-xs text-(--ink-muted)">
                weight {component.weight.toFixed(2)}
              </p>
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums">
              {fmtScore(norm)}
            </p>
            <p className="mt-1 text-xs text-(--ink-muted)">{component.raw}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-(--card-stroke)/40">
              <div
                className="h-full rounded-full bg-(--accent)"
                style={{ width: `${width}%` }}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ScopeTable({
  rows,
  breakout,
}: {
  rows: CompoundingRiskRowView[];
  breakout: CompoundingRiskScope;
}) {
  if (rows.length === 0) {
    return (
      <p
        className="rounded-2xl border border-(--card-stroke) bg-card p-6 text-sm text-(--ink-muted)"
        data-testid="empty-state"
      >
        No Compounding Risk data is available for this org yet. Run{" "}
        <code className="font-mono text-[0.85em]">dev-hops metrics daily</code> to
        populate <code className="font-mono text-[0.85em]">compounding_risk_daily</code>.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card-90) shadow-sm">
      <table className="w-full text-sm" data-testid="compounding-risk-table">
        <thead className="bg-(--card-60) text-xs font-semibold uppercase tracking-[0.18em] text-(--ink-muted)">
          <tr>
            <th className="px-5 py-3 text-left">
              {breakout === "team" ? "Team" : "Repo"}
            </th>
            <th className="px-5 py-3 text-right">Score</th>
            <th className="px-5 py-3 text-left">Severity</th>
            <th className="px-5 py-3 text-right">Churn</th>
            <th className="px-5 py-3 text-right">Complexity</th>
            <th className="px-5 py-3 text-right">Ownership</th>
            <th className="px-5 py-3 text-right">Review</th>
            <th className="px-5 py-3 text-left">Drilldown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const workGraphHref = buildRiskDrilldownUrl({
              scope:
                breakout === "team"
                  ? { kind: "team", id: row.scopeId }
                  : { kind: "repo", id: row.scopeId },
            });
            return (
              <tr
                key={row.scopeId}
                data-testid="risk-row"
                data-scope-id={row.scopeId}
                data-severity={row.severity}
                className="border-t border-(--card-stroke)/60 hover:bg-(--card-60)/60"
              >
                <td className="px-5 py-3 align-middle font-medium">
                  {row.scopeLabel}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {fmtScore(row.score)}
                </td>
                <td className="px-5 py-3">
                  <SeverityChip severity={row.severity} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {fmtScore(row.components.churnNorm)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {fmtScore(row.components.complexityNorm)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {fmtScore(row.components.ownershipNorm)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {fmtScore(row.components.reviewNorm)}
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={workGraphHref}
                    className="text-xs font-semibold uppercase tracking-[0.18em] text-(--accent) hover:underline"
                    data-testid="open-in-work-graph"
                  >
                    Open in Work Graph →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CompoundingRiskDashboard({
  orgId,
  breakout,
  rows,
  trend,
  generatedAt,
}: CompoundingRiskDashboardProps) {

  const hasRows = rows.length > 0;
  const allScoresNull = !hasRows || rows.every((r) => r.score === null);
  if (allScoresNull) {
    const missingInputs: string[] = [];
    if (hasRows) {
      if (rows.every((r) => r.components.churnNorm === null)) {
        missingInputs.push("rework churn");
      }
      if (rows.every((r) => r.components.complexityNorm === null)) {
        missingInputs.push("complexity delta (rising cyclomatic_per_kloc trend)");
      }
      if (rows.every((r) => r.components.ownershipNorm === null)) {
        missingInputs.push("ownership concentration (gini and single-owner ratio)");
      }
      if (rows.every((r) => r.components.reviewNorm === null)) {
        missingInputs.push("review latency (p90h)");
      }
    }

    return (
      <div className="flex flex-col gap-6" data-testid="compounding-risk-dashboard">
        <section
          className="rounded-2xl border border-(--card-stroke) bg-card p-8 shadow-sm"
          data-testid="all-scores-null-state"
        >
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Scores currently unavailable
          </h1>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-(--ink-muted) md:text-base">
            Compounding Risk is a deterministic composite of four normalized inputs: rework churn, complexity trend, ownership concentration, and review latency. The score cannot be computed until all four are populated for the current scope.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-(--ink-muted) md:text-base">
            {hasRows
              ? `This usually clears once more PR review activity or recent complexity data is recorded. The page will populate automatically when the next daily metrics run completes.`
              : `No compounding_risk_daily rows are available yet for this org. Run `}
            {!hasRows && (
              <code className="font-mono text-[0.85em]">dev-hops metrics daily</code>
            )}
            {!hasRows && ` to populate the metric, then refresh this page.`}
          </p>

          {missingInputs.length > 0 && (
            <div className="mt-8 rounded-2xl border border-(--card-stroke) bg-(--card-60) p-6">
              <h3 className="text-sm font-semibold tracking-tight">
                Missing inputs across all {breakout}s:
              </h3>
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-(--ink-muted)">
                {missingInputs.map((input) => (
                  <li key={input}>{input}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-8 text-xs text-(--ink-muted)">
            Org <span className="font-mono">{orgId}</span> · generated{" "}
            <time dateTime={generatedAt}>{generatedAt.replace("T", " ").slice(0, 16)}</time>
          </p>
        </section>
      </div>
    );
  }

  const headline = selectHeadlineRow(rows);

  return (
    <div className="flex flex-col gap-6" data-testid="compounding-risk-dashboard">
      <section className="overflow-hidden rounded-[2rem] border border-(--card-stroke) bg-(--card-80) shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-8">
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Where change pressure is compounding risk.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-muted) md:text-base">
              A deterministic composite of churn, complexity trend, ownership
              concentration, and review-latency tail. Every score is fully
              inspectable: weights, thresholds, and raw inputs are persisted
              alongside the composite so historical rows stay auditable.
            </p>
            <p className="mt-3 text-xs text-(--ink-muted)">
              Org <span className="font-mono">{orgId}</span> · generated{" "}
              <time dateTime={generatedAt}>{generatedAt.replace("T", " ").slice(0, 16)}</time>
            </p>
          </div>
          <div className="border-t border-(--card-stroke) bg-(--card-60) p-8 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
              Headline
            </p>
            {headline ? (
              <>
                <div className="mt-3 flex items-baseline gap-3">
                  <p
                    className="text-5xl font-semibold tabular-nums"
                    data-testid="headline-score"
                  >
                    {fmtScore(headline.score)}
                  </p>
                  <SeverityChip severity={headline.severity} />
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">
                  {headline.scopeLabel}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-(--ink-muted)">No data yet.</p>
            )}
            <TrendSparkline trend={trend} />
          </div>
        </div>
      </section>

      {headline && (
        <section
          className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
          data-testid="component-breakdown"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Component breakdown
            </h2>
            <p className="text-xs text-(--ink-muted)">
              thresholds: elevated ≥ {headline.thresholds.elevated.toFixed(2)} ·
              high ≥ {headline.thresholds.high.toFixed(2)}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-(--ink-muted)">
            Each bar shows the normalized [0, 1] contribution; the raw input
            value is printed beneath. Weights persist with the row.
          </p>
          <div className="mt-5">
            <ComponentBars row={headline} />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {breakout === "team" ? "By team" : "By repo"}
          </h2>
          <p className="text-xs text-(--ink-muted)">
            sorted by score · {rows.length} {breakout}
            {rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <ScopeTable rows={rows} breakout={breakout} />
      </section>
    </div>
  );
}

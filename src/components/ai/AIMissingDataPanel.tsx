type AIMissingDataPanelProps = {
  title: string;
  reason: string;
  needed?: string;
};

/**
 * Per-card "this metric is intentionally not shipped yet" marker.
 *
 * Use when a specific card in an otherwise-populated dashboard cannot
 * render because the underlying signal isn't exposed in the schema yet or
 * was deliberately deferred (e.g. reviewer concentration, deferred until
 * an aggregate-only distribution ships without per-person ranking). The
 * implication is "this is on the roadmap; here's the data source needed",
 * not "data does not exist".
 *
 * For whole-view "no data exists for this scope" coverage, use
 * {@link AIEmptyState} instead.
 */
export function AIMissingDataPanel({ title, reason, needed }: AIMissingDataPanelProps) {
  return (
    <section className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-80) p-5" data-testid="ai-missing-data-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
        Missing data
      </p>
      <h3 className="mt-2 font-(--font-display) text-lg">{title}</h3>
      <p className="mt-2 text-sm text-(--ink-muted)">{reason}</p>
      {needed && (
        <p className="mt-3 rounded-2xl bg-background/60 px-3 py-2 text-xs text-(--ink-muted)">
          Data source needed: {needed}
        </p>
      )}
    </section>
  );
}

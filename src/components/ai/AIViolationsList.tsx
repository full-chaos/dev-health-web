import type { AiGovernanceViolationRow } from "@/lib/graphql/__generated__/types";

type AIViolationsListProps = {
  violations: AiGovernanceViolationRow[];
  loading?: boolean;
};

export function AIViolationsList({ violations, loading }: AIViolationsListProps) {
  if (loading) {
    return (
      <section
        className="rounded-3xl border border-(--card-stroke) bg-card p-5"
        data-testid="ai-violations-list"
      >
        <h3 className="font-(--font-display) text-lg">Security findings</h3>
        <p className="mt-3 text-sm text-(--ink-muted)">Loading governance findings…</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-3xl border border-(--card-stroke) bg-card p-5"
      data-testid="ai-violations-list"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-(--font-display) text-lg">Security findings</h3>
          <p className="mt-1 text-sm text-(--ink-muted)">
            Recent PR-scoped policy violations associated with AI workflow artifacts.
          </p>
        </div>
        <span className="rounded-full bg-background px-3 py-1 text-sm font-semibold tabular-nums">
          {violations.length}
        </span>
      </div>

      {violations.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-background/60 px-4 py-3 text-sm text-(--ink-muted)">
          No PR-scoped governance violations appear in this range.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-(--card-stroke)">
          {violations.slice(0, 8).map((violation) => (
            <li
              key={`${violation.ruleId}-${violation.subjectId}-${violation.observedAt}`}
              className="py-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold uppercase text-red-600">
                  {violation.severity}
                </span>
                <span className="font-medium">{violation.ruleId}</span>
                <span className="text-(--ink-muted)">PR {violation.subjectId}</span>
              </div>
              <p className="mt-1 text-sm text-(--ink-muted)">{violation.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

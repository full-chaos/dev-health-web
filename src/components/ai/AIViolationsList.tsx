import type { AiGovernanceViolationRow } from "@/lib/graphql/__generated__/types";

type AIViolationsListProps = {
    violations: AiGovernanceViolationRow[];
    loading?: boolean;
};

const SHELL = "rounded-(--radius-md) border border-(--card-stroke) bg-card p-5";

export function AIViolationsList({ violations, loading }: AIViolationsListProps) {
    if (loading) {
        return (
            <section className={SHELL} data-testid="ai-violations-list">
                <h3 className="text-h3 font-semibold">Security findings</h3>
                <p className="mt-3 text-sm text-(--ink-muted)">Loading governance findings…</p>
            </section>
        );
    }

    return (
        <section className={SHELL} data-testid="ai-violations-list">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-h3 font-semibold">Security findings</h3>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Recent PR-scoped policy violations associated with AI workflow artifacts.
                    </p>
                </div>
                <span className="rounded-full border border-(--card-stroke) bg-background px-3 py-1 text-sm font-semibold tabular-nums">
                    {violations.length}
                </span>
            </div>

            {violations.length === 0 ? (
                <p className="mt-4 rounded-(--radius-sm) border border-dashed border-(--card-stroke) px-4 py-3 text-sm text-(--ink-muted)">
                    No PR-scoped governance violations appear in this range.
                </p>
            ) : (
                <div className="mt-4 overflow-x-auto rounded-(--radius-md) border border-(--card-stroke)">
                    <table className="w-full text-left text-sm">
                        <thead className="whitespace-nowrap border-b border-(--card-stroke) bg-background text-label-caps uppercase text-(--ink-muted)">
                            <tr>
                                <th className="px-3 py-2.75 font-medium">Severity</th>
                                <th className="px-3 py-2.75 font-medium">Rule</th>
                                <th className="px-3 py-2.75 font-medium">PR</th>
                                <th className="px-3 py-2.75 font-medium">Evidence</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-(--card-stroke)">
                            {violations.slice(0, 8).map((violation) => (
                                <tr
                                    key={`${violation.ruleId}-${violation.subjectId}-${violation.observedAt}`}
                                >
                                    <td className="px-3 py-3.25 align-top">
                                        <span className="rounded-full bg-(--negative)/12 px-2 py-0.5 text-xs font-semibold uppercase text-(--negative)">
                                            {violation.severity}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3.25 align-top font-medium">
                                        {violation.ruleId}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-3.25 align-top text-(--ink-muted)">
                                        PR {violation.subjectId}
                                    </td>
                                    <td className="px-3 py-3.25 align-top text-(--ink-muted)">
                                        {violation.evidence}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

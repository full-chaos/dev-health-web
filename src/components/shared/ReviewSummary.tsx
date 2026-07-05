import type { ReactNode } from "react";

export type ReviewSummaryRow = {
    /** Stable row key; falls back to `label` when omitted. */
    id?: string;
    label: string;
    value: ReactNode;
};

type ReviewSummaryProps = {
    rows: ReviewSummaryRow[];
    /** Destructive-change callouts shown below the rows (DestructiveWarning tone). */
    warnings?: string[];
    className?: string;
};

/**
 * Review-before-submit summary block (shared primitive, CHAOS-2845
 * Foundations lane): a label/value row list plus an optional warnings slot
 * for irreversible or destructive staged changes.
 */
export function ReviewSummary({ rows, warnings, className }: ReviewSummaryProps) {
    return (
        <div className={`space-y-4 ${className ?? ""}`.trim()}>
            <dl className="divide-y divide-(--card-stroke) rounded-2xl border border-(--card-stroke) bg-(--card-80)">
                {rows.map((row) => (
                    <div
                        key={row.id ?? row.label}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                        <dt className="text-label-caps uppercase text-(--ink-muted)">{row.label}</dt>
                        <dd className="text-right text-sm text-foreground">{row.value}</dd>
                    </div>
                ))}
            </dl>

            {warnings && warnings.length > 0 ? (
                <div
                    role="alert"
                    className="space-y-1.5 rounded-lg border border-(--caution)/30 bg-(--caution)/10 p-3 text-xs text-(--caution)"
                >
                    {warnings.map((warning) => (
                        <p key={warning}>⚠ {warning}</p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

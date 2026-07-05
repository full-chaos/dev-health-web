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

/** Inline warning-triangle glyph (design system forbids emoji-as-icon). */
function WarningIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 3.5 2.5 16h15L10 3.5Z" />
            <path strokeLinecap="round" d="M10 8v4" />
            <path strokeLinecap="round" d="M10 14.5h.01" />
        </svg>
    );
}

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
                        <p key={warning} className="flex items-start gap-1.5">
                            <WarningIcon />
                            <span>{warning}</span>
                        </p>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

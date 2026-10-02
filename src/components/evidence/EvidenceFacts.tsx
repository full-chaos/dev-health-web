import type { ReactNode } from "react";

/** Shown for a field the API did not serve. */
export const NOT_REPORTED = "Not reported";

/**
 * The fact rows of the evidence drawer: one row per field, label left and value right.
 * A field with no served value shows "Not reported"; the web never fills a value in.
 */
export function EvidenceFactList({
    children,
    "aria-label": ariaLabel,
}: {
    children: ReactNode;
    "aria-label"?: string;
}) {
    return (
        <dl data-testid="evidence-facts" aria-label={ariaLabel} className="text-xs">
            {children}
        </dl>
    );
}

/**
 * One fact row. Leave `value` undefined when the API did not serve the field.
 * `stacked` puts the value under the label, for a long value such as a file path.
 */
export function EvidenceFact({
    label,
    value,
    stacked = false,
}: {
    label: string;
    value?: ReactNode;
    stacked?: boolean;
}) {
    const reported = value !== undefined && value !== null;
    return (
        <div
            data-testid="evidence-fact"
            data-reported={reported}
            className={`flex gap-x-3 gap-y-1 border-b border-(--card-stroke) py-2.5 last:border-b-0 ${
                stacked ? "flex-col" : "items-center"
            }`}
        >
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd
                className={`min-w-0 tabular-nums ${stacked ? "" : "ml-auto text-right"} ${
                    reported ? "font-semibold text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {reported ? value : NOT_REPORTED}
            </dd>
        </div>
    );
}

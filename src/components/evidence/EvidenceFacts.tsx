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

/** One fact row. Leave `value` undefined when the API did not serve the field. */
export function EvidenceFact({ label, value }: { label: string; value?: ReactNode }) {
    const reported = value !== undefined && value !== null;
    return (
        <div
            data-testid="evidence-fact"
            data-reported={reported}
            className="flex items-center gap-3 border-b border-(--card-stroke) py-2.5 last:border-b-0"
        >
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd
                className={`ml-auto min-w-0 text-right tabular-nums ${
                    reported ? "font-semibold text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {reported ? value : NOT_REPORTED}
            </dd>
        </div>
    );
}

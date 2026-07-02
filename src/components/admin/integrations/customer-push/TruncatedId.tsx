"use client";

import { toast } from "sonner";

type TruncatedIdProps = {
    value: string;
    /** Accessible label, e.g. "Source ID", "Ingestion ID", "Token ID". */
    label: string;
    className?: string;
    /** Omit the copy button — use inside an ancestor `<a>`/`<button>` where nesting interactive controls is invalid. */
    readOnly?: boolean;
};

/**
 * Renders a customer-push identifier (source_id/ingestion_id/token_id) as a
 * truncated monospace value with the full id in a `title` attribute and a
 * copy-to-clipboard action (CHAOS-2714 D10). These are not work-graph
 * entities, so `resolveEntityLabel`/`EntityLabel` do not apply — there is no
 * human-readable label to resolve, only the primary key the customer must
 * correlate against their own CI logs.
 */
export function TruncatedId({ value, label, className, readOnly = false }: TruncatedIdProps) {
    if (readOnly) {
        return (
            /* design-lint-disable-next-line no-raw-id-in-jsx -- source/ingestion/token identifiers are the primary key the customer must correlate against their own CI logs; no human label exists */
            <span
                title={value}
                className={`font-mono text-xs text-(--ink-muted) ${className ?? ""}`.trim()}
            >
                {value.slice(0, 8)}…
            </span>
        );
    }

    const handleCopy = async () => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
        }
    };

    return (
        <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`.trim()}>
            {/* design-lint-disable-next-line no-raw-id-in-jsx -- source/ingestion/token identifiers are the primary key the customer must correlate against their own CI logs; no human label exists */}
            <span title={value} className="font-mono text-xs text-(--ink-muted)">
                {value.slice(0, 8)}…
            </span>
            <button
                type="button"
                onClick={handleCopy}
                aria-label={`Copy ${label}`}
                className="text-(--ink-muted) hover:text-foreground"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                >
                    <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h4A1.5 1.5 0 0 1 14 3.5v1h.5A1.5 1.5 0 0 1 16 6v9a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 7 15V3.5Zm1.5-.5a.5.5 0 0 0-.5.5V15a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.5-.5H14v7.5A1.5 1.5 0 0 1 12.5 14h-4a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
                    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H6v9.5A1.5 1.5 0 0 0 7.5 15H12v.5a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5H4Z" />
                </svg>
            </button>
        </span>
    );
}

import { CopyIdButton } from "./CopyIdButton";

type AuditIdentityLabelProps = {
    /** Raw actor/resource identifier from the audit-log API. */
    id: string | null;
    /** Authoritative API display name, or null when the audited object is unavailable. */
    displayName?: string | null;
    /** Rendered when `id` is null — e.g. "System" for an unattributed action. */
    emptyLabel: string;
    /** Description passed to the copy affordance, e.g. "actor ID". */
    copyLabel: string;
    /** "stacked" for compact table cells, "inline" for the wider detail drawer. */
    layout?: "stacked" | "inline";
    /** Print the full served id as a second item. On in the detail drawer only. */
    showFullId?: boolean;
};

/**
 * Resolved actor/resource identity display (CHAOS-2843, CHAOS-8701).
 *
 * Shows the served `*_display_name` when it is a non-blank string. A null, blank or absent name
 * shows the "Unresolved" badge only: never an id, a piece of one, or a name derived from another
 * field. The id stays available in the tooltip and the Copy action, and in the drawer's full-id item.
 */
export function AuditIdentityLabel({
    id,
    displayName,
    emptyLabel,
    copyLabel,
    layout = "stacked",
    showFullId = false,
}: AuditIdentityLabelProps) {
    const name = displayName?.trim();
    if (!id) {
        return <span className="text-xs text-(--ink-muted)">{emptyLabel}</span>;
    }

    const containerClass =
        layout === "stacked" ? "flex items-center gap-1.5" : "flex flex-wrap items-center gap-2";

    return (
        <div className={containerClass}>
            {name ? (
                <span className="text-xs font-medium" title={id} data-resolved="true">
                    {name}
                </span>
            ) : (
                <span
                    className="rounded-full border border-(--card-stroke) bg-(--card-70) px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-muted)"
                    title={id}
                    data-resolved="false"
                >
                    Unresolved
                </span>
            )}
            <div className="flex items-center gap-1.5">
                {showFullId ? (
                    <span className="font-mono text-xs text-(--ink-muted)">{id}</span>
                ) : null}
                <CopyIdButton value={id} label={copyLabel} />
            </div>
        </div>
    );
}

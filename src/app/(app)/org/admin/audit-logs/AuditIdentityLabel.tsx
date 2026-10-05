import { EntityLabel } from "@/components/labels/EntityLabel";
import { CopyIdButton } from "./CopyIdButton";

type AuditIdentityLabelProps = {
    /** Raw actor/resource identifier from the audit-log API. */
    id: string | null;
    /** Authoritative API display name, or null when the audited object is unavailable. */
    displayName: string | null;
    /** Rendered when `id` is null — e.g. "System" for an unattributed action. */
    emptyLabel: string;
    /** Description passed to the copy affordance, e.g. "actor ID". */
    copyLabel: string;
    /** "stacked" for compact table cells, "inline" for the wider detail drawer. */
    layout?: "stacked" | "inline";
    /**
     * Print the full served id with the identity label. The audit-log table and
     * detail drawer enable this so the name never replaces audit traceability.
     */
    showFullId?: boolean;
};

/**
 * Resolved actor/resource identity display (CHAOS-2843, design system A7).
 *
 * The org audit-log API serves a nullable authoritative display name alongside
 * each actor or resource identifier. `EntityLabel` renders that name when it
 * exists and keeps the established identifier-safe treatment when it is null.
 * This component never derives a name from another field.
 */
export function AuditIdentityLabel({
    id,
    displayName,
    emptyLabel,
    copyLabel,
    layout = "stacked",
    showFullId = false,
}: AuditIdentityLabelProps) {
    if (!id) {
        return <span className="text-xs text-(--ink-muted)">{emptyLabel}</span>;
    }

    const containerClass =
        layout === "stacked" ? "flex items-center gap-1.5" : "flex flex-wrap items-center gap-2";

    return (
        <div className={containerClass}>
            <EntityLabel id={id} displayName={displayName} className="text-xs font-medium" />
            <div className="flex items-center gap-1.5">
                {showFullId ? (
                    <span className="font-mono text-xs text-(--ink-muted)">{id}</span>
                ) : null}
                <CopyIdButton value={id} label={copyLabel} />
            </div>
        </div>
    );
}

import { EntityLabel } from "@/components/labels/EntityLabel";
import { CopyIdButton } from "./CopyIdButton";

type AuditIdentityLabelProps = {
    /** Raw actor/resource identifier from the audit-log API. */
    id: string | null;
    /** Rendered when `id` is null — e.g. "System" for an unattributed action. */
    emptyLabel: string;
    /** Description passed to the copy affordance, e.g. "actor ID". */
    copyLabel: string;
    /** "stacked" for compact table cells, "inline" for the wider detail drawer. */
    layout?: "stacked" | "inline";
    /**
     * Print the full raw id as a second line. Off in table cells (design AD-3: the cell shows the
     * name, or a short id + "Unresolved", and an icon Copy; the full id is the copied value and the
     * title); on in the detail drawer, which keeps the full id.
     */
    showFullId?: boolean;
};

/**
 * Resolved actor/resource identity display (CHAOS-2843, design system A7).
 *
 * The audit-log API currently returns only a bare id for `user_id` and
 * `resource_id` — no display name field exists on `AuditLog` yet. `EntityLabel`
 * is still the canonical primitive: it renders the name when one IS available
 * (once the API adds one) and otherwise shows the explicit "Unresolved"
 * treatment rather than a raw id as the primary label. A table cell shows no second id line: the
 * Copy icon copies the full id (design AD-3). The detail drawer passes `showFullId` and keeps it.
 */
export function AuditIdentityLabel({
    id,
    emptyLabel,
    copyLabel,
    layout = "stacked",
    showFullId = false,
}: AuditIdentityLabelProps) {
    if (!id) {
        return <span className="text-xs text-(--ink-muted)">{emptyLabel}</span>;
    }

    const containerClass =
        layout === "stacked" ? "flex flex-col gap-1" : "flex flex-wrap items-center gap-2";

    return (
        <div className={containerClass}>
            <EntityLabel id={id} className="text-xs font-medium" />
            <div className="flex items-center gap-1.5">
                {showFullId ? (
                    <span className="font-mono text-xs text-(--ink-muted)">{id}</span>
                ) : null}
                <CopyIdButton value={id} label={copyLabel} />
            </div>
        </div>
    );
}

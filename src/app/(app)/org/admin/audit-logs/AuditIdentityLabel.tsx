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
};

/**
 * Resolved actor/resource identity display (CHAOS-2843, design system A7).
 *
 * The audit-log API currently returns only a bare id for `user_id` and
 * `resource_id` — no display name field exists on `AuditLog` yet. `EntityLabel`
 * is still the canonical primitive: it renders the name when one IS available
 * (once the API adds one) and otherwise shows the explicit "Unresolved"
 * treatment rather than a raw id as the primary label. The full id is always
 * shown as secondary, copyable text alongside it so investigators can still
 * trace the record without the id ever being the primary label.
 */
export function AuditIdentityLabel({
    id,
    emptyLabel,
    copyLabel,
    layout = "stacked",
}: AuditIdentityLabelProps) {
    if (!id) {
        return <span className="text-xs text-(--ink-muted)">{emptyLabel}</span>;
    }

    const containerClass = layout === "stacked" ? "flex flex-col gap-1" : "flex flex-wrap items-center gap-2";

    return (
        <div className={containerClass}>
            <EntityLabel id={id} className="text-xs font-medium" />
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-(--ink-muted)">{id}</span>
                <CopyIdButton value={id} label={copyLabel} />
            </div>
        </div>
    );
}

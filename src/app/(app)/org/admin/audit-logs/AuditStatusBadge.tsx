import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";

import { StatusPill } from "@/components/admin/StatusPill";

type AuditStatusBadgeProps = {
    status: string | null | undefined;
};

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Token-based status pill for audit-log rows/detail (CHAOS-2843, design system Part C2): the shared
 * admin pill, icon + word. The API only documents a `status` string, so any non-"success" value is
 * treated as negative rather than assuming a fixed enum the backend hasn't committed to.
 */
export function AuditStatusBadge({ status }: AuditStatusBadgeProps) {
    const normalized = status?.trim().toLowerCase();
    const label = status?.trim() ? capitalize(status.trim()) : "Unknown";

    if (normalized === "success") {
        return (
            <StatusPill tone="positive" icon={CircleCheck}>
                {label}
            </StatusPill>
        );
    }
    if (normalized) {
        return (
            <StatusPill tone="negative" icon={TriangleAlert}>
                {label}
            </StatusPill>
        );
    }
    return (
        <StatusPill tone="muted" icon={CircleHelp}>
            {label}
        </StatusPill>
    );
}

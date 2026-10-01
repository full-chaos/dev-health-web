import { STATUS_PILL } from "@/lib/statusPill";
import type { SecuritySeverity } from "@/lib/filters/security";

const SEVERITY_CLASSES: Record<SecuritySeverity, string> = {
    critical: STATUS_PILL.negative,
    high: STATUS_PILL.caution,
    medium: STATUS_PILL.caution,
    low: STATUS_PILL.muted,
    unknown: STATUS_PILL.muted,
};

const SEVERITY_LABELS: Record<SecuritySeverity, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    unknown: "Unknown",
};

interface SeverityBadgeProps {
    severity: SecuritySeverity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
    const colorClass = SEVERITY_CLASSES[severity] ?? SEVERITY_CLASSES.unknown;
    const label = SEVERITY_LABELS[severity] ?? severity;

    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colorClass}`}
        >
            {label}
        </span>
    );
}

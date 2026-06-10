import type { SecuritySeverity } from "@/lib/filters/security";

const SEVERITY_CLASSES: Record<SecuritySeverity, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-amber-400 text-gray-900",
    low: "bg-slate-400 text-white",
    unknown: "bg-slate-300 text-gray-900",
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

type AuditStatusBadgeProps = {
    status: string | null | undefined;
};

const TONE_CLASSES = {
    positive: "border-(--positive)/30 bg-(--positive)/15 text-(--positive)",
    negative: "border-(--negative)/30 bg-(--negative)/15 text-(--negative)",
    muted: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
} as const;

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Token-based status badge for audit-log rows/detail (CHAOS-2843, design
 * system Part C2: semantic status tokens, not raw hex). The API only
 * documents a `status` string, so any non-"success" value is treated as
 * negative rather than assuming a fixed enum the backend hasn't committed to.
 */
export function AuditStatusBadge({ status }: AuditStatusBadgeProps) {
    const normalized = status?.trim().toLowerCase();
    const tone = normalized === "success" ? "positive" : normalized ? "negative" : "muted";
    const label = status?.trim() ? capitalize(status.trim()) : "Unknown";

    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
        >
            {label}
        </span>
    );
}

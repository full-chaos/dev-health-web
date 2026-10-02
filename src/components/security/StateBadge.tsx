import { STATUS_PILL } from "@/lib/statusPill";
import type { SecurityState } from "@/lib/filters/security";

type StateTone = "warn" | "success" | "muted";

const STATE_TONE: Record<SecurityState, StateTone> = {
    open: "warn",
    detected: "warn",
    confirmed: "warn",
    fixed: "success",
    resolved: "success",
    dismissed: "muted",
};

const TONE_CLASSES: Record<StateTone, string> = {
    warn: STATUS_PILL.caution,
    success: STATUS_PILL.positive,
    muted: STATUS_PILL.muted,
};

const STATE_LABELS: Record<SecurityState, string> = {
    open: "Open",
    fixed: "Fixed",
    dismissed: "Dismissed",
    detected: "Detected",
    confirmed: "Confirmed",
    resolved: "Resolved",
};

interface StateBadgeProps {
    state: SecurityState;
}

export function StateBadge({ state }: StateBadgeProps) {
    const tone = STATE_TONE[state] ?? "muted";
    const colorClass = TONE_CLASSES[tone];
    const label = STATE_LABELS[state] ?? state;

    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colorClass}`}
        >
            {label}
        </span>
    );
}

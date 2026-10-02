import { STATUS_PILL } from "@/lib/statusPill";
import {
    CONFIDENCE_SHOW_THRESHOLD,
    CONFIDENCE_WARN_THRESHOLD,
    CONTEXT_LABELS,
} from "@/lib/feature-flags/interpretation";

type ConfidenceLevel = "high" | "medium" | "low";

function resolveLevel(score: number): ConfidenceLevel {
    if (score >= CONFIDENCE_SHOW_THRESHOLD) return "high";
    if (score >= CONFIDENCE_WARN_THRESHOLD) return "medium";
    return "low";
}

const LEVEL_STYLES: Record<ConfidenceLevel, string> = {
    high: STATUS_PILL.positive,
    medium: STATUS_PILL.caution,
    low: STATUS_PILL.negative,
};

interface ConfidenceBadgeProps {
    score: number;
    label?: string;
}

export function ConfidenceBadge({ score, label }: ConfidenceBadgeProps) {
    const level = resolveLevel(score);
    const displayLabel = label ?? CONTEXT_LABELS.confidenceScore;
    const pct = `${Math.round(score * 100)}%`;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${LEVEL_STYLES[level]}`}
            title={`${displayLabel}: ${pct}`}
        >
            {displayLabel} {pct}
        </span>
    );
}

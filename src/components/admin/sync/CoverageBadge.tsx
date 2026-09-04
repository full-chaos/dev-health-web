import type { SyncCoverageHealth, SyncCoverageStatus } from "@/lib/admin/types";

/**
 * Shared semantic-tone vocabulary for coverage/gap surfaces (CHAOS-2791/2792/2793).
 *
 * Color is never the only signal (web AGENTS a11y rule): every tone pairs a
 * design-system status token with a glyph AND a text label, so a colorblind
 * or non-visual reader gets the same information as a sighted one.
 */
export type CoverageTone = "positive" | "caution" | "negative" | "info" | "muted";

const TONE_CLASSES: Record<CoverageTone, string> = {
    positive: "border-(--positive)/30 bg-(--positive)/15 text-(--positive)",
    caution: "border-(--caution)/30 bg-(--caution)/15 text-(--caution)",
    negative: "border-(--negative)/30 bg-(--negative)/15 text-(--negative)",
    info: "border-(--info)/30 bg-(--info)/15 text-(--info)",
    muted: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
};

const TONE_GLYPH: Record<CoverageTone, string> = {
    positive: "\u2713", // check
    caution: "\u26A0", // warning triangle
    negative: "\u2715", // x
    info: "\u2139", // info
    muted: "\u2022", // bullet
};

interface CoverageBadgeProps {
    tone: CoverageTone;
    label: string;
    className?: string;
}

export function CoverageBadge({ tone, label, className = "" }: CoverageBadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
        >
            <span aria-hidden="true">{TONE_GLYPH[tone]}</span>
            {label}
        </span>
    );
}

/** Overall coverage health tone (deterministic precedence: failed > gaps > stale > healthy). */
export function healthTone(health: SyncCoverageHealth): CoverageTone {
    switch (health) {
        case "healthy":
            return "positive";
        case "stale":
            return "caution";
        case "gaps":
            return "caution";
        case "failed":
            return "negative";
        case "insufficient_data":
            return "info";
        default:
            return "muted";
    }
}

const HEALTH_LABEL: Record<SyncCoverageHealth, string> = {
    healthy: "Healthy",
    stale: "Stale",
    gaps: "Gaps detected",
    failed: "Failed",
    insufficient_data: "Insufficient data",
};

export function healthLabel(health: SyncCoverageHealth): string {
    return HEALTH_LABEL[health] ?? "Insufficient data";
}

/** Per-dataset / per-source coverage status tone, widening health with scheduling context. */
export function statusTone(status: SyncCoverageStatus): CoverageTone {
    switch (status) {
        case "healthy":
            return "positive";
        case "stale":
        case "gaps":
            return "caution";
        case "failed":
            return "negative";
        case "insufficient_data":
            return "info";
        case "running":
            return "info";
        case "paused":
        case "not_scheduled":
        case "not_enabled":
            return "muted";
        default:
            return "muted";
    }
}

const STATUS_LABEL: Record<SyncCoverageStatus, string> = {
    healthy: "Healthy",
    stale: "Stale",
    gaps: "Gaps",
    failed: "Failed",
    insufficient_data: "Insufficient data",
    paused: "Paused",
    not_scheduled: "Not scheduled",
    running: "Running",
    not_enabled: "Not enabled",
};

export function statusLabel(status: SyncCoverageStatus): string {
    return STATUS_LABEL[status] ?? "Insufficient data";
}

/**
 * Job-level coverage-result vocabulary (CHAOS-2792), derived ONLY from
 * persisted job status + sync_run unit counts — never from client-side
 * interval/coverage math.
 */
export type JobCoverageResult = "complete" | "partial" | "gap" | "failed";

export function jobCoverageTone(result: JobCoverageResult): CoverageTone {
    switch (result) {
        case "complete":
            return "positive";
        case "partial":
            return "caution";
        case "gap":
            return "caution";
        case "failed":
            return "negative";
        default:
            return "muted";
    }
}

const JOB_RESULT_LABEL: Record<JobCoverageResult, string> = {
    complete: "Complete",
    partial: "Partial",
    gap: "Gap",
    failed: "Failed",
};

export function jobCoverageLabel(result: JobCoverageResult): string {
    return JOB_RESULT_LABEL[result];
}

import type { SyncJob } from "@/lib/admin/types";
import { formatDateUTC, formatNumber, parseTimestampDate } from "@/lib/formatters";
import type { JobCoverageResult } from "./CoverageBadge";

export const PAGE_SIZE = 10;

export const HEADINGS = [
    "Trigger",
    "Mode",
    "Requested range",
    "Covered range",
    "Status",
    "Scope",
    "Units",
    "Started",
    "Duration",
    "Actions",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function formatRange(range: { since: string; before: string } | null | undefined): string {
    if (!range) return "—";
    return `${formatDateUTC(range.since)} → ${formatDateUTC(range.before)}`;
}

export function getDuration(job: SyncJob): string {
    if (job.duration_seconds != null) return `${Math.round(job.duration_seconds)}s`;
    if (job.completed_at && job.started_at) {
        const completedAt = parseTimestampDate(job.completed_at);
        const startedAt = parseTimestampDate(job.started_at);
        if (completedAt && startedAt) {
            return `${Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)}s`;
        }
    }
    return "—";
}

export function getBadgeStatus(status: SyncJob["status"]) {
    switch (status) {
        case "success":
            return "success" as const;
        case "failed":
        case "cancelled":
            return "failed" as const;
        case "running":
            return "running" as const;
        case "pending":
            return "idle" as const;
        default:
            return "never" as const;
    }
}

export function getBadgeLabel(status: SyncJob["status"]) {
    switch (status) {
        case "pending":
            return "Queued";
        case "cancelled":
            return "Cancelled";
        default:
            return undefined;
    }
}

/**
 * Derive the coverage-result label for a planner-backed job (CHAOS-2792),
 * using ONLY persisted job status + sync_run unit counts. Never re-derives
 * from range/interval comparisons (platform ban on client-side coverage math).
 * Returns null for non-terminal jobs or legacy rows (no sync_run block) —
 * those render the plain job status badge instead.
 *
 * Precedence is deliberate and pinned by tests: failed > partial > gap >
 * complete. A terminal failed/cancelled run is a STRONGER signal than an
 * unsettled-units gap — so a failed/cancelled run with unsettled units
 * (settled < total_units) still reports "failed"/"partial", never "gap".
 * Only a terminal SUCCESS run with unsettled units reports "gap".
 */
export function deriveJobCoverageResult(job: SyncJob): JobCoverageResult | null {
    const sr = job.sync_run;
    if (!sr) return null;
    if (job.status === "pending" || job.status === "running") return null;

    const settled = sr.completed_units + sr.failed_units;

    if (job.status === "failed" || job.status === "cancelled") {
        return sr.completed_units === 0 ? "failed" : "partial";
    }
    if (sr.total_units === 0) return "complete";
    if (sr.failed_units > 0 && sr.completed_units > 0) return "partial";
    if (sr.failed_units > 0 && sr.completed_units === 0) return "failed";
    if (settled < sr.total_units) return "gap";
    return "complete";
}

export function getRunId(job: SyncJob): string | null {
    if (job.sync_run?.sync_run_id) return job.sync_run.sync_run_id;
    if (isRecord(job.result) && typeof job.result.sync_run_id === "string") {
        return job.result.sync_run_id;
    }
    return null;
}

export function getScopeLabel(job: SyncJob): string {
    const sr = job.sync_run;
    if (!sr) {
        const datasetKey =
            isRecord(job.result) && typeof job.result.dataset_key === "string"
                ? job.result.dataset_key
                : null;
        return datasetKey ?? "—";
    }
    const sourceIds = new Set<string>([
        ...(sr.requested_range?.source_ids ?? []),
        ...(sr.covered_range?.source_ids ?? []),
    ]);
    if (sourceIds.size === 0) return "—";
    return `${formatNumber(sourceIds.size)} source${sourceIds.size === 1 ? "" : "s"}`;
}

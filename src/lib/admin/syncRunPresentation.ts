import type { SyncRun, SyncRunUnitSummary } from "@/lib/admin/types";
import { type SyncStatus, mapPlannerRunStatus } from "@/lib/sync-types";

export interface SyncRunCounts {
    total: number;
    completed: number;
    failed: number;
    settled: number;
    active: number;
}

export interface SyncRunPresentation {
    effectiveStatus: string;
    badgeStatus: SyncStatus;
    label: string;
    progressLabel: string;
    description: string | null;
    terminal: boolean;
    counts: SyncRunCounts;
}

function statusCount(summary: SyncRunUnitSummary | null, status: string): number | null {
    if (!summary) return null;
    return summary.by_status[status] ?? 0;
}

export function getSyncRunCounts(run: SyncRun, summary: SyncRunUnitSummary | null): SyncRunCounts {
    const total = summary ? Math.max(summary.unit_count, run.total_units) : run.total_units;
    const completed = statusCount(summary, "success") ?? run.completed_units;
    const failed = statusCount(summary, "failed") ?? run.failed_units;
    const settled = Math.min(total, completed + failed);
    return {
        total,
        completed,
        failed,
        settled,
        active: Math.max(0, total - settled),
    };
}

export function getEffectiveSyncRunStatus(
    run: SyncRun,
    summary: SyncRunUnitSummary | null,
): string {
    if (!summary) return run.status;

    const counts = getSyncRunCounts(run, summary);
    if (counts.total > 0 && counts.settled >= counts.total) {
        if (counts.failed === 0) return "success";
        if (counts.completed === 0) return "failed";
        return "partial_failed";
    }
    if (
        counts.settled > 0 ||
        (statusCount(summary, "running") ?? 0) > 0 ||
        (statusCount(summary, "retrying") ?? 0) > 0
    ) {
        return "running";
    }
    if ((statusCount(summary, "dispatching") ?? 0) > 0) return "dispatching";
    if ((statusCount(summary, "planned") ?? 0) > 0) return "planned";
    return run.status;
}

function unitPhrase(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

export function getSyncRunPresentation(
    run: SyncRun,
    summary: SyncRunUnitSummary | null,
): SyncRunPresentation {
    const counts = getSyncRunCounts(run, summary);
    const effectiveStatus = getEffectiveSyncRunStatus(run, summary);
    const badgeStatus = mapPlannerRunStatus(effectiveStatus);
    const terminal =
        effectiveStatus === "success" ||
        effectiveStatus === "failed" ||
        effectiveStatus === "partial_failed";

    if (!terminal && counts.failed > 0) {
        return {
            effectiveStatus,
            badgeStatus,
            label: "Running with failures",
            progressLabel: "Syncing with failures...",
            description: `${unitPhrase(counts.failed, "unit")} failed; ${unitPhrase(counts.active, "unit")} ${counts.active === 1 ? "is" : "are"} still processing.`,
            terminal,
            counts,
        };
    }

    switch (effectiveStatus) {
        case "partial_failed":
            return {
                effectiveStatus,
                badgeStatus,
                label: "Completed with failures",
                progressLabel: "Sync completed with failures",
                description: `${unitPhrase(counts.completed, "unit")} completed and ${unitPhrase(counts.failed, "unit")} failed.`,
                terminal,
                counts,
            };
        case "failed":
            return {
                effectiveStatus,
                badgeStatus,
                label: "Failed",
                progressLabel: "Sync failed",
                description:
                    counts.failed > 0 ? `${unitPhrase(counts.failed, "unit")} failed.` : null,
                terminal,
                counts,
            };
        case "success":
            return {
                effectiveStatus,
                badgeStatus,
                label: "Completed",
                progressLabel: "Sync completed",
                description: null,
                terminal,
                counts,
            };
        case "planned":
            return {
                effectiveStatus,
                badgeStatus,
                label: "Planned",
                progressLabel: "Syncing...",
                description: null,
                terminal,
                counts,
            };
        case "dispatching":
            return {
                effectiveStatus,
                badgeStatus,
                label: "Dispatching",
                progressLabel: "Syncing...",
                description: null,
                terminal,
                counts,
            };
        default:
            return {
                effectiveStatus,
                badgeStatus,
                label: "Running",
                progressLabel: "Syncing...",
                description: null,
                terminal,
                counts,
            };
    }
}

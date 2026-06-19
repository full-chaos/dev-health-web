import type { SyncConfig as ApiSyncConfig, SyncTriggerResult } from "@/lib/admin/types";

export type SyncStatus = "idle" | "running" | "failed" | "success" | "never";

export type SyncConfig = {
    id: string;
    name: string;
    provider: string;
    last_sync_at: string | null;
    status: SyncStatus;
    schedule?: string;
};

export function toSyncConfig(apiConfig: ApiSyncConfig): SyncConfig {
    let status: SyncStatus = "never";
    if (apiConfig.last_sync_at) {
        status = apiConfig.last_sync_success ? "success" : "failed";
    }
    return {
        id: apiConfig.id,
        name: apiConfig.name,
        provider: apiConfig.provider,
        last_sync_at: apiConfig.last_sync_at,
        status,
    };
}

export type SyncJob = {
    id: string;
    config_id: string;
    started_at: string;
    completed_at: string | null;
    status: SyncStatus;
    items_synced: number;
    errors: string[];
};

// ---------------------------------------------------------------------------
// Live-status polling helpers (CHAOS-2557a)
//
// A manual "Sync Now" routes through one of two backends. The trigger response
// tells us which endpoint to poll, and each backend has its own status
// vocabulary that we normalize onto the shared `SyncStatus` union so the card
// can transition (current) -> Running -> Success/Failed without a page refresh.
// ---------------------------------------------------------------------------

/** Where to poll for live status after a manual trigger. */
export type SyncPollTarget =
    | { kind: "planner"; runId: string }
    | { kind: "legacy"; configId: string };

/**
 * Decide which endpoint to poll from a trigger response.
 *
 * Planner / fan-out runs return `sync_run_id` and MUST be polled via
 * GET /sync-runs/{id} — the legacy jobs endpoint cannot see them. Legacy runs
 * return `run_id`/`task_id` and are polled via /sync-configs/{id}/jobs.
 * Returns null when the response carries no usable run identifier.
 */
export function resolveSyncPollTarget(
    result: SyncTriggerResult,
    configId: string,
): SyncPollTarget | null {
    if (result.sync_run_id) {
        return { kind: "planner", runId: result.sync_run_id };
    }
    if (result.run_id || result.task_id) {
        return { kind: "legacy", configId };
    }
    return null;
}

/**
 * Map a planner SyncRun.status (planned|dispatching|running|success|failed,
 * plus the unit-level partial_failed) onto the shared UI status union.
 * Unknown / not-yet-terminal values keep the spinner up as "running".
 */
export function mapPlannerRunStatus(status: string): SyncStatus {
    switch (status) {
        case "planned":
        case "dispatching":
        case "running":
            return "running";
        case "success":
            return "success";
        case "failed":
        case "partial_failed":
            return "failed";
        default:
            return "running";
    }
}

/**
 * Map a legacy SyncJob.status (pending|running|success|failed) onto the shared
 * UI status union. Unknown / not-yet-terminal values keep "running".
 */
export function mapLegacyJobStatus(status: string): SyncStatus {
    switch (status) {
        case "pending":
        case "running":
            return "running";
        case "success":
            return "success";
        case "failed":
            return "failed";
        default:
            return "running";
    }
}

/** Terminal UI statuses — polling stops once one of these is reached. */
export function isTerminalSyncStatus(status: SyncStatus): boolean {
    return status === "success" || status === "failed";
}

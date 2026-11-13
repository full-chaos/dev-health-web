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
    { kind: "planner"; runId: string } | { kind: "legacy"; configId: string; runId: string };

/**
 * Decide which endpoint to poll from a trigger response.
 *
 * Planner / fan-out runs return `sync_run_id` and MUST be polled via
 * GET /sync-runs/{id} — the legacy jobs endpoint cannot see them. Legacy runs
 * return `run_id` and are polled via /sync-configs/{id}/jobs, matched by
 * `run_id` so we never resolve terminal off an unrelated head job.
 *
 * Returns null when the response carries no usable run identifier. A legacy
 * response with only `task_id` (no `run_id`) is NOT pollable: without a
 * `run_id` we cannot distinguish our run from an unrelated scheduled/concurrent
 * job at the head of the list, so the caller must do a single router.refresh()
 * instead of resolving a (possibly false) terminal status.
 */
export function resolveSyncPollTarget(
    result: SyncTriggerResult,
    configId: string,
): SyncPollTarget | null {
    if (result.sync_run_id) {
        return { kind: "planner", runId: result.sync_run_id };
    }
    if (result.run_id) {
        return { kind: "legacy", configId, runId: result.run_id };
    }
    return null;
}

export type SyncTriggerOutcome =
    | { kind: "started"; message: string }
    | { kind: "pending"; message: string }
    | { kind: "disabled"; message: string }
    | { kind: "failed"; message: string; reasonCode?: string };

const QUARANTINE_REASON_PREFIX = "scheduled sync occurrence quarantined: ";

export const SYNC_START_FAILED_MESSAGE = "Unable to start sync. Try again.";

export const SYNC_LAST_FAILURE_MESSAGE =
    "The first sync didn’t complete. Retry to continue — your setup is preserved.";

const GENERIC_SYNC_FAILURE = "Sync failed. Check the integration's status and try again.";

const SYNC_FAILURE_TEXT: Record<string, string> = {
    invalid_plan:
        "Sync failed: the window is too large to plan. Choose a narrower window and try again.",
    identity_conflict:
        "Sync failed: the sync configuration changed while the run was queued. Try again.",
    retry_exhausted: "Sync failed: planning kept failing and was stopped. Try again later.",
};

/**
 * Plain words for a failed 202. The backend reason carries an internal error
 * code; the code is returned for logging only and never reaches the user.
 */
export function describeSyncFailure(reason: string | undefined): {
    message: string;
    reasonCode?: string;
} {
    if (!reason?.startsWith(QUARANTINE_REASON_PREFIX)) return { message: GENERIC_SYNC_FAILURE };
    const reasonCode = reason.slice(QUARANTINE_REASON_PREFIX.length).trim();
    if (!reasonCode) return { message: GENERIC_SYNC_FAILURE };
    const known = Object.hasOwn(SYNC_FAILURE_TEXT, reasonCode)
        ? SYNC_FAILURE_TEXT[reasonCode]
        : null;
    return { message: known ?? GENERIC_SYNC_FAILURE, reasonCode };
}

/**
 * What a 202 from the Sync-now route means. Only a `triggered` status that
 * names a pollable run is a start; an absent or unknown status is a failure.
 */
export function classifySyncTrigger(
    result: SyncTriggerResult,
    configId: string,
): SyncTriggerOutcome {
    switch (result.status) {
        case "triggered":
            return resolveSyncPollTarget(result, configId)
                ? { kind: "started", message: "Sync triggered — use Refresh to check status" }
                : { kind: "failed", message: "Sync was accepted but no run was started" };
        case "pending":
            return { kind: "pending", message: "Sync is planning — check the job list" };
        case "disabled":
            return { kind: "disabled", message: "Sync planned nothing to run" };
        case "failed":
            return { kind: "failed", ...describeSyncFailure(result.reason) };
        default:
            return { kind: "failed", message: "Sync returned an unknown status" };
    }
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
 * Map a legacy SyncJob.status (pending|running|success|failed|cancelled) onto the shared
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
        case "cancelled":
            return "failed";
        default:
            return "running";
    }
}

/**
 * Resolve the live status for a legacy poll from the jobs list.
 *
 * Jobs come back most-recent-first, but the freshly triggered run is NOT
 * guaranteed to be the head: a scheduled retry, a concurrent admin click, or
 * backend ordering lag can surface an UNRELATED job first. We ALWAYS match the
 * triggered `runId` explicitly so we never report completion off the wrong run.
 * If the triggered row isn't visible yet we return "running" so the caller keeps
 * polling (the caller's max-timeout still ends things gracefully if it never
 * appears). There is deliberately no head-of-list fallback: a legacy poll target
 * only exists when a `run_id` is known (see resolveSyncPollTarget).
 */
export function resolveLegacyJobStatus(
    jobs: ReadonlyArray<{ id: string; status: string }>,
    runId: string,
): SyncStatus {
    const job = jobs.find((j) => j.id === runId);
    if (!job) {
        return "running";
    }
    return mapLegacyJobStatus(job.status);
}

/** Terminal UI statuses — polling stops once one of these is reached. */
export function isTerminalSyncStatus(status: SyncStatus): boolean {
    return status === "success" || status === "failed";
}

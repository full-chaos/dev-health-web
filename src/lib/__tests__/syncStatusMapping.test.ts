import { describe, it, expect } from "vitest";
import {
    resolveSyncPollTarget,
    mapPlannerRunStatus,
    mapLegacyJobStatus,
    isTerminalSyncStatus,
    resolveLegacyJobStatus,
    type SyncJob,
} from "../sync-types";
import type { SyncTriggerResult } from "../admin/types";

describe("resolveSyncPollTarget", () => {
    it("routes planner runs (sync_run_id) to the /sync-runs endpoint", () => {
        const result: SyncTriggerResult = {
            status: "triggered",
            config_id: "cfg-1",
            sync_run_id: "run-abc",
            total_units: 5,
        };
        expect(resolveSyncPollTarget(result, "cfg-1")).toEqual({
            kind: "planner",
            runId: "run-abc",
        });
    });

    it("routes legacy runs (run_id) to the legacy jobs path keyed by configId", () => {
        const result: SyncTriggerResult = {
            status: "triggered",
            config_id: "cfg-1",
            task_id: "celery-1",
            run_id: "jobrun-xyz",
        };
        expect(resolveSyncPollTarget(result, "cfg-1")).toEqual({
            kind: "legacy",
            configId: "cfg-1",
            runId: "jobrun-xyz",
        });
    });

    it("prefers the planner id when both are present", () => {
        const result: SyncTriggerResult = {
            sync_run_id: "run-abc",
            run_id: "jobrun-xyz",
        };
        expect(resolveSyncPollTarget(result, "cfg-1")).toEqual({
            kind: "planner",
            runId: "run-abc",
        });
    });

    it("treats a task_id-only response as a legacy run", () => {
        const result: SyncTriggerResult = {
            status: "triggered",
            task_id: "celery-1",
        };
        expect(resolveSyncPollTarget(result, "cfg-1")).toEqual({
            kind: "legacy",
            configId: "cfg-1",
            runId: null,
        });
    });

    it("returns null when no pollable id is present", () => {
        const result: SyncTriggerResult = {
            status: "triggered",
            config_id: "cfg-1",
        };
        expect(resolveSyncPollTarget(result, "cfg-1")).toBeNull();
    });
});

describe("mapPlannerRunStatus", () => {
    it.each(["planned", "dispatching", "running"])(
        "maps non-terminal planner status %s to running",
        (status) => {
            expect(mapPlannerRunStatus(status)).toBe("running");
        },
    );

    it("maps success to success", () => {
        expect(mapPlannerRunStatus("success")).toBe("success");
    });

    it.each(["failed", "partial_failed"])("maps planner status %s to failed", (status) => {
        expect(mapPlannerRunStatus(status)).toBe("failed");
    });

    it("keeps the spinner up for unknown statuses", () => {
        expect(mapPlannerRunStatus("something-new")).toBe("running");
    });
});

describe("mapLegacyJobStatus", () => {
    it.each(["pending", "running"])("maps non-terminal legacy status %s to running", (status) => {
        expect(mapLegacyJobStatus(status)).toBe("running");
    });

    it("maps success to success", () => {
        expect(mapLegacyJobStatus("success")).toBe("success");
    });

    it("maps failed to failed", () => {
        expect(mapLegacyJobStatus("failed")).toBe("failed");
    });

    it("keeps the spinner up for unknown statuses", () => {
        expect(mapLegacyJobStatus("weird")).toBe("running");
    });
});

describe("isTerminalSyncStatus", () => {
    it("treats success and failed as terminal", () => {
        expect(isTerminalSyncStatus("success")).toBe(true);
        expect(isTerminalSyncStatus("failed")).toBe(true);
    });

    it("treats running/idle/never as non-terminal", () => {
        expect(isTerminalSyncStatus("running")).toBe(false);
        expect(isTerminalSyncStatus("idle")).toBe(false);
        expect(isTerminalSyncStatus("never")).toBe(false);
    });
});

describe("resolveLegacyJobStatus", () => {
    const job = (id: string, status: string): SyncJob => ({
        id,
        config_id: "cfg-1",
        started_at: "2024-01-01T00:00:00Z",
        completed_at: null,
        status: status as SyncJob["status"],
        items_synced: 0,
        errors: [],
    });

    it("tracks the triggered run id even when another terminal job is listed first", () => {
        // Regression (CHAOS-2557a): the legacy jobs endpoint returns
        // most-recent-first, and an UNRELATED terminal job can lead the list
        // (scheduled retry / concurrent click / ordering lag). We must report
        // the status of the run we triggered, not the head of the list.
        const jobs: SyncJob[] = [job("other-run", "success"), job("jobrun-xyz", "running")];
        expect(resolveLegacyJobStatus(jobs, "jobrun-xyz")).toBe("running");
    });

    it("resolves terminal only when the matched run reaches terminal", () => {
        const jobs: SyncJob[] = [job("other-run", "running"), job("jobrun-xyz", "failed")];
        expect(resolveLegacyJobStatus(jobs, "jobrun-xyz")).toBe("failed");
    });

    it("keeps polling (running) when the triggered row is not yet visible", () => {
        const jobs: SyncJob[] = [job("other-run", "success")];
        expect(resolveLegacyJobStatus(jobs, "jobrun-xyz")).toBe("running");
    });

    it("keeps polling (running) when the jobs array is empty", () => {
        expect(resolveLegacyJobStatus([], "jobrun-xyz")).toBe("running");
    });

    it("falls back to the head of the list when no run id is known", () => {
        const jobs: SyncJob[] = [job("head", "success"), job("tail", "running")];
        expect(resolveLegacyJobStatus(jobs, null)).toBe("success");
    });
});

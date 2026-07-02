import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/utils";
import { SyncProgressBar } from "./SyncProgressBar";
import { getSyncJobs, getSyncRunStatus } from "@/lib/admin/server";
import type { SyncJob, SyncRun, SyncRunJobEnrichment } from "@/lib/admin/types";

// The component polls the admin server actions directly (CHAOS-2799 —
// config-scoped polling replaces the org+provider GraphQL subscription), so
// stub them out the same way SyncRunDetail.test.tsx does.
vi.mock("@/lib/admin/server", () => ({
    getSyncJobs: vi.fn(),
    getSyncRunStatus: vi.fn(),
}));

function buildEnrichment(overrides: Partial<SyncRunJobEnrichment> = {}): SyncRunJobEnrichment {
    return {
        mode: "incremental",
        triggered_by: "admin@devhealth.example",
        requested_range: null,
        covered_range: null,
        total_units: 10,
        completed_units: 0,
        failed_units: 0,
        sync_run_id: "run-1",
        ...overrides,
    };
}

function buildJob(overrides: Partial<SyncJob> = {}): SyncJob {
    return {
        id: "job-1",
        status: "running",
        started_at: "2024-01-01T00:00:00.000Z",
        completed_at: null,
        duration_seconds: null,
        items_synced: 0,
        sync_run: buildEnrichment(),
        ...overrides,
    };
}

function buildRun(overrides: Partial<SyncRun> = {}): SyncRun {
    return {
        id: "run-1",
        org_id: "org-1",
        integration_id: "integration-1",
        triggered_by: "admin@devhealth.example",
        mode: "incremental",
        status: "running",
        total_units: 10,
        completed_units: 0,
        failed_units: 0,
        started_at: "2024-01-01T00:00:00.000Z",
        completed_at: null,
        result: null,
        error: null,
        created_at: "2024-01-01T00:00:00.000Z",
        ...overrides,
    };
}

async function flush() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

describe("SyncProgressBar", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders nothing when no active run is discovered for the config", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({
            data: [buildJob({ status: "success", sync_run: null })],
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncRunStatus).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("discovers a manually-triggered run from the config's recent jobs and polls it", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 4, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncJobs).toHaveBeenCalledWith("cfg-1", 5);
        expect(getSyncRunStatus).toHaveBeenCalledWith("run-1");
        expect(screen.getByText("Syncing...")).toBeInTheDocument();
        expect(screen.getByText(/4 \/ 10/)).toBeInTheDocument();
    });

    it("discovers a scheduled (not-yet-started) run via a pending job", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({
            data: [
                buildJob({
                    status: "pending",
                    sync_run: buildEnrichment({
                        sync_run_id: "run-scheduled",
                        triggered_by: "scheduler",
                    }),
                }),
            ],
        });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ id: "run-scheduled", status: "planned", completed_units: 0 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncRunStatus).toHaveBeenCalledWith("run-scheduled");
        expect(screen.getByText("Syncing...")).toBeInTheDocument();
    });

    it("stops polling the tracked run once it reaches a terminal status", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ status: "success", completed_units: 10, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Sync completed")).toBeInTheDocument();

        // Further ticks resume discovery for the NEXT run rather than
        // repeatedly re-polling the run that already finished.
        vi.mocked(getSyncJobs).mockClear();
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [] }); // no more active jobs
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });
        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);
        expect(getSyncJobs).toHaveBeenCalled();
    });

    it("keeps two concurrent same-provider configs isolated (no cross-contamination)", async () => {
        vi.mocked(getSyncJobs).mockImplementation(async (configId: string) => {
            const runId = configId === "cfg-a" ? "run-a" : "run-b";
            return { data: [buildJob({ sync_run: buildEnrichment({ sync_run_id: runId }) })] };
        });
        vi.mocked(getSyncRunStatus).mockImplementation(async (runId: string) => {
            if (runId === "run-a") {
                return { data: buildRun({ id: "run-a", completed_units: 2, total_units: 10 }) };
            }
            return { data: buildRun({ id: "run-b", completed_units: 8, total_units: 10 }) };
        });

        render(
            <>
                <SyncProgressBar configId="cfg-a" />
                <SyncProgressBar configId="cfg-b" />
            </>,
        );
        await flush();

        expect(getSyncJobs).toHaveBeenCalledWith("cfg-a", 5);
        expect(getSyncJobs).toHaveBeenCalledWith("cfg-b", 5);
        // Each bar renders ITS OWN config's counts — neither leaks into the other.
        expect(screen.getByText(/2 \/ 10/)).toBeInTheDocument();
        expect(screen.getByText(/8 \/ 10/)).toBeInTheDocument();
    });

    it("never polls a live API in testMode", async () => {
        render(<SyncProgressBar configId="cfg-1" testMode />);
        await flush();

        expect(getSyncJobs).not.toHaveBeenCalled();
        expect(getSyncRunStatus).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows elapsed time computed from the persisted started_at", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 4, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(65_000);
        });

        expect(screen.getByText(/Elapsed 01:05/)).toBeInTheDocument();
    });

    it("shows ETA once enough units have settled", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 4, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(40_000);
        });

        expect(screen.getByText("~1m 0s remaining")).toBeInTheDocument();
    });

    it("shows Calculating when fewer than 2 units have settled", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 1, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByText("Calculating...")).toBeInTheDocument();
    });
});

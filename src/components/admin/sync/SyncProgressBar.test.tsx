import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/utils";
import { SyncProgressBar } from "./SyncProgressBar";
import { getSyncJobs, getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import type {
    SyncJob,
    SyncRun,
    SyncRunJobEnrichment,
    SyncRunUnit,
    SyncRunUnitSummary,
} from "@/lib/admin/types";

// The component polls the admin server actions directly (CHAOS-2799 —
// config-scoped polling replaces the org+provider GraphQL subscription), so
// stub them out the same way SyncRunDetail.test.tsx does.
vi.mock("@/lib/admin/server", () => ({
    getSyncJobs: vi.fn(),
    getSyncRunStatus: vi.fn(),
    getSyncRunUnits: vi.fn(),
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

function buildUnit(overrides: Partial<SyncRunUnit> = {}): SyncRunUnit {
    return {
        id: "unit-1",
        org_id: "org-1",
        sync_run_id: "run-1",
        integration_id: "integration-1",
        source_id: "source-1",
        source_name: "source",
        source_full_name: "org/source",
        provider: "github",
        dataset_key: "git",
        cost_class: "rest",
        mode: "incremental",
        since_at: null,
        before_at: null,
        status: "running",
        attempts: 1,
        available_at: null,
        rate_limit_deferrals: 0,
        duration_seconds: null,
        error: null,
        error_category: null,
        last_heartbeat_at: null,
        result: null,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function buildSummary(overrides: Partial<SyncRunUnitSummary> = {}): SyncRunUnitSummary {
    return {
        by_status: { running: 10 },
        by_source: {},
        by_dataset: {},
        by_cost_class: {},
        slowest_unit_ids: [],
        failed_unit_ids: [],
        failed_unit_count: 0,
        unit_count: 10,
        partial_failure_summary: null,
        next_retry_at: null,
        units: [],
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
        vi.mocked(getSyncRunUnits).mockResolvedValue({ error: "Unit rollups unavailable" });
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

        expect(getSyncJobs).toHaveBeenCalledWith("cfg-1", 25);
        expect(getSyncRunStatus).toHaveBeenCalledWith("run-1");
        expect(getSyncRunUnits).toHaveBeenCalledWith("run-1");
        expect(screen.getByText("Syncing...")).toBeInTheDocument();
        expect(screen.getByText(/4 \/ 10/)).toBeInTheDocument();
    });

    it("uses unit rollups for active-run progress when run counters are stale", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 0, failed_units: 0, total_units: 4 }),
        });
        vi.mocked(getSyncRunUnits).mockResolvedValue({
            data: buildSummary({
                by_status: { success: 2, failed: 1, running: 1 },
                unit_count: 4,
                failed_unit_count: 1,
                units: [
                    buildUnit({ id: "unit-success-1", status: "success" }),
                    buildUnit({ id: "unit-success-2", status: "success" }),
                    buildUnit({ id: "unit-failed", status: "failed" }),
                    buildUnit({ id: "unit-running", status: "running" }),
                ],
            }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByText("Syncing with failures...")).toBeInTheDocument();
        expect(screen.getByText(/3 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/75% complete/)).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Sync progress" })).toHaveAttribute(
            "aria-valuenow",
            "75",
        );
    });

    it("labels a terminal mixed result as completed with failures", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({
                status: "partial_failed",
                completed_units: 3,
                failed_units: 1,
                total_units: 4,
            }),
        });
        vi.mocked(getSyncRunUnits).mockResolvedValue({
            data: buildSummary({
                by_status: { success: 3, failed: 1 },
                failed_unit_count: 1,
                unit_count: 4,
                units: [
                    buildUnit({ id: "success-1", status: "success" }),
                    buildUnit({ id: "success-2", status: "success" }),
                    buildUnit({ id: "success-3", status: "success" }),
                    buildUnit({ id: "failed-1", status: "failed" }),
                ],
            }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByText("Sync completed with failures")).toBeInTheDocument();
    });

    it("CHAOS-4318: renders the unit rollup from the single mount check and never re-fetches it on its own", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 0, failed_units: 0, total_units: 4 }),
        });
        vi.mocked(getSyncRunUnits).mockResolvedValue({
            data: buildSummary({
                by_status: { success: 2, running: 2 },
                unit_count: 4,
                units: [
                    buildUnit({ id: "unit-success-1", status: "success" }),
                    buildUnit({ id: "unit-success-2", status: "success" }),
                    buildUnit({ id: "unit-running-1", status: "running" }),
                    buildUnit({ id: "unit-running-2", status: "running" }),
                ],
            }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByText(/2 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/50% complete/)).toBeInTheDocument();
        expect(getSyncRunUnits).toHaveBeenCalledTimes(1);

        // No setInterval survives — time passing alone triggers no re-fetch.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });

        expect(screen.getByText(/2 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/50% complete/)).toBeInTheDocument();
        expect(getSyncRunUnits).toHaveBeenCalledTimes(1);
    });

    it("does not rediscover a stale running job whose unit rollup is already terminal", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({
            data: [
                buildJob({
                    status: "running",
                    sync_run: buildEnrichment({
                        total_units: 4,
                        completed_units: 4,
                        failed_units: 0,
                    }),
                }),
            ],
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncJobs).toHaveBeenCalledWith("cfg-1", 25);
        expect(getSyncRunStatus).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("keeps active-run progress non-terminal when unit rows are incomplete", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 0, failed_units: 0, total_units: 4 }),
        });
        vi.mocked(getSyncRunUnits).mockResolvedValue({
            data: buildSummary({
                by_status: { success: 1 },
                unit_count: 1,
                units: [buildUnit({ status: "success" })],
            }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByText("Syncing...")).toBeInTheDocument();
        expect(screen.getByText(/1 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/25% complete/)).toBeInTheDocument();
    });

    it("uses unit rows over a stale terminal run status", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({
                status: "success",
                completed_units: 4,
                failed_units: 0,
                total_units: 4,
            }),
        });
        vi.mocked(getSyncRunUnits).mockResolvedValue({
            data: buildSummary({
                by_status: { success: 1, running: 3 },
                unit_count: 4,
                units: [
                    buildUnit({ id: "unit-success", status: "success" }),
                    buildUnit({ id: "unit-running-1", status: "running" }),
                    buildUnit({ id: "unit-running-2", status: "running" }),
                    buildUnit({ id: "unit-running-3", status: "running" }),
                ],
            }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByText("Syncing...")).toBeInTheDocument();
        expect(screen.getByText(/1 \/ 4/)).toBeInTheDocument();
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

    it("CHAOS-4318: never re-checks a terminal run automatically — only a manual Refresh does", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ status: "success", completed_units: 10, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Sync completed")).toBeInTheDocument();

        // No setInterval left to fire — time passing alone must never
        // trigger another Python API request (CHAOS-4318). Stay under the
        // 5s terminal-display grace period so the bar (and its Refresh
        // control) is still on screen to click.
        vi.mocked(getSyncJobs).mockClear();
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [] });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);
        expect(getSyncJobs).not.toHaveBeenCalled();

        // An explicit Refresh click re-runs discovery for the NEXT run.
        await act(async () => {
            screen.getByTestId("refresh-control-button").click();
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(getSyncJobs).toHaveBeenCalledTimes(1);
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

        expect(getSyncJobs).toHaveBeenCalledWith("cfg-a", 25);
        expect(getSyncJobs).toHaveBeenCalledWith("cfg-b", 25);
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

    it("CHAOS-4318: renders a last-updated Refresh control and never re-fetches on its own, however long the bar stays open", async () => {
        vi.mocked(getSyncJobs).mockResolvedValue({ data: [buildJob({ status: "running" })] });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 4, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
        const callsAfterMount = vi.mocked(getSyncRunStatus).mock.calls.length;

        // A run stays non-terminal indefinitely (10 minutes and beyond) with
        // zero additional Python API requests — no setInterval survives.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 3500);
        });
        expect(getSyncRunStatus).toHaveBeenCalledTimes(callsAfterMount);
        expect(getSyncJobs).toHaveBeenCalledTimes(1);
    });

    it("clears the previous config's run once configId changes and the new config has no active run (stale-config leak regression, CHAOS-2799)", async () => {
        vi.mocked(getSyncJobs).mockImplementation(async (configId: string) => {
            if (configId === "cfg-a") {
                return { data: [buildJob({ status: "running" })] };
            }
            return { data: [] }; // cfg-b: nothing active
        });
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ completed_units: 4, total_units: 10 }),
        });

        const { rerender } = render(<SyncProgressBar configId="cfg-a" />);
        await flush();

        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.getByText(/4 \/ 10/)).toBeInTheDocument();

        rerender(<SyncProgressBar configId="cfg-b" />);
        await flush();

        // cfg-b has no active run: cfg-a's progress bar must NOT persist —
        // this is the exact leak CHAOS-2799 exists to kill.
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("discovers a still-running job even when several newer terminal jobs precede it in the discovery window (SHOULD-FIX 3, CHAOS-2799)", async () => {
        const terminalJobs = Array.from({ length: 5 }, (_, i) =>
            buildJob({ id: `job-terminal-${i}`, status: "success", sync_run: null }),
        );
        const runningJob = buildJob({
            id: "job-running",
            status: "running",
            sync_run: buildEnrichment({ sync_run_id: "run-buried" }),
        });
        const allJobs = [...terminalJobs, runningJob];

        // Mirrors the real enriched /jobs endpoint: `limit` bounds how many
        // of the most-recent jobs come back. With the old limit of 5, the
        // running job (6th) would never be seen.
        vi.mocked(getSyncJobs).mockImplementation(async (_configId: string, limit?: number) => ({
            data: allJobs.slice(0, limit ?? allJobs.length),
        }));
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: buildRun({ id: "run-buried", completed_units: 3, total_units: 10 }),
        });

        render(<SyncProgressBar configId="cfg-1" />);
        await flush();

        expect(getSyncJobs).toHaveBeenCalledWith("cfg-1", 25);
        expect(getSyncRunStatus).toHaveBeenCalledWith("run-buried");
        expect(screen.getByText("Syncing...")).toBeInTheDocument();
    });

    it("never calls setState or logs a warning when a discovery poll resolves after unmount", async () => {
        let resolveJobs!: (value: { data: SyncJob[] }) => void;
        vi.mocked(getSyncJobs).mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveJobs = resolve;
                }),
        );
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        const { unmount } = render(<SyncProgressBar configId="cfg-1" />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        unmount();

        // Resolve the in-flight discovery call AFTER unmount — the seqRef
        // guard must drop this stale response rather than calling setState
        // on an unmounted component.
        await act(async () => {
            resolveJobs({ data: [buildJob({ status: "running" })] });
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(getSyncRunStatus).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });
});

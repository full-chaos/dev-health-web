import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/utils";
import { BackfillStatus } from "./BackfillStatus";
import { getBackfillJobStatus } from "@/lib/admin/server";
import type { BackfillJob } from "@/lib/admin/types";

vi.mock("@/lib/admin/server", () => ({
    getBackfillJobStatus: vi.fn(),
}));

const RUNNING_JOB: BackfillJob = {
    id: "job-1",
    sync_config_id: "cfg-1",
    status: "running",
    since_date: "2026-06-20",
    before_date: "2026-06-26",
    total_chunks: 6,
    completed_chunks: 3,
    failed_chunks: 0,
    progress_pct: 50,
    error_message: null,
    started_at: "2026-07-02T15:05:00.000Z",
    completed_at: null,
    created_at: "2026-07-02T15:00:00.000Z",
    updated_at: "2026-07-02T15:05:00.000Z",
};

describe("BackfillStatus", () => {
    it("renders nothing when there is no persisted active job", () => {
        const { container } = render(<BackfillStatus initialJob={null} testMode />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders persisted progress from the initial job without any client-derived state", () => {
        render(<BackfillStatus initialJob={RUNNING_JOB} testMode />);

        expect(screen.getByTestId("backfill-status")).toBeInTheDocument();
        expect(screen.getByText("Processing chunk 3 of 6")).toBeInTheDocument();
        expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("renders a terminal completed job without a live-polling indicator", () => {
        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "completed", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        expect(screen.queryByText("Live — refreshing…")).not.toBeInTheDocument();
    });

    it("renders a terminal fanout 'success' job without a live-polling indicator", () => {
        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "success", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        expect(screen.queryByText("Live — refreshing…")).not.toBeInTheDocument();
    });

    it("renders a terminal fanout 'partial_failed' job with a completed-with-failures label", () => {
        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "partial_failed", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Completed with failures")).toBeInTheDocument();
        expect(screen.queryByText("Live — refreshing…")).not.toBeInTheDocument();
    });

    it("translates a backend failure code for a terminal backfill", () => {
        render(
            <BackfillStatus
                initialJob={{
                    ...RUNNING_JOB,
                    status: "partial_failed",
                    progress_pct: 100,
                    error_message: "provider_unit_exhausted",
                }}
                testMode
            />,
        );

        expect(screen.getByText("Provider retries exhausted")).toBeInTheDocument();
        expect(screen.queryByText("provider_unit_exhausted")).not.toBeInTheDocument();
    });

    it("renders a fanout 'planned' job as non-terminal and waiting", () => {
        render(<BackfillStatus initialJob={{ ...RUNNING_JOB, status: "planned" }} testMode />);

        expect(screen.getByText("Waiting to start...")).toBeInTheDocument();
        expect(screen.getByText("Live — refreshing…")).toBeInTheDocument();
    });

    it("re-syncs local state when initialJob transitions to a terminal status on the SAME job id (CHAOS-2868)", () => {
        const { rerender } = render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "dispatching", progress_pct: 0 }}
                testMode
            />,
        );

        expect(screen.getByText("Dispatching work...")).toBeInTheDocument();
        expect(screen.getByText("Live — refreshing…")).toBeInTheDocument();

        // Same job id, status-only change — BackfillOperations keys by id alone,
        // so a real remount would not happen here either; this re-renders the
        // SAME component instance to prove the local state re-syncs from props.
        rerender(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "completed", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        expect(screen.queryByText("Live — refreshing…")).not.toBeInTheDocument();
    });
});

describe("BackfillStatus — live poll", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("polls persisted status for a non-terminal job and stops once terminal", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({
            data: { ...RUNNING_JOB, status: "completed", completed_chunks: 6, progress_pct: 100 },
        });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });

        expect(getBackfillJobStatus).toHaveBeenCalledWith("job-1");
        expect(screen.getByText("Backfill complete")).toBeInTheDocument();

        // Polling stopped: advancing further triggers no additional calls.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 4);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
    });

    it("stops polling once a poll resolves the fanout 'success' status", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({
            data: { ...RUNNING_JOB, status: "success", completed_chunks: 6, progress_pct: 100 },
        });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 4);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
    });

    it("stops polling once a poll resolves the fanout 'partial_failed' status", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({
            data: {
                ...RUNNING_JOB,
                status: "partial_failed",
                completed_chunks: 5,
                progress_pct: 83,
            },
        });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });

        expect(screen.getByText("Completed with failures")).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 4);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
    });

    it("does not poll a live API in test mode", async () => {
        render(<BackfillStatus initialJob={RUNNING_JOB} testMode />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 3);
        });

        expect(getBackfillJobStatus).not.toHaveBeenCalled();
    });

    it("stops polling and keeps the last good snapshot when a poll returns { error }", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({ error: "Unauthorized (401)" });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Processing chunk 3 of 6")).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 4);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
    });

    it("gives up polling and stops the Live indicator after a bounded zero-progress window (CHAOS-2868)", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({
            data: { ...RUNNING_JOB, status: "dispatching", progress_pct: 0 },
        });

        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "dispatching", progress_pct: 0 }}
            />,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        });

        expect(screen.queryByText("Live — refreshing…")).not.toBeInTheDocument();
        expect(screen.getByText("Live updates paused")).toBeInTheDocument();

        // Polling stopped: advancing further triggers no additional calls.
        const callsAtGiveUp = vi.mocked(getBackfillJobStatus).mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 5);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(callsAtGiveUp);
    });

    it("never starts an overlapping poll while a request is in flight, so a slow response can't be resurrected after a terminal one (CHAOS-2868)", async () => {
        let resolveSlowPoll: (result: { data: BackfillJob }) => void = () => {};
        const slowPoll = new Promise<{ data: BackfillJob }>((resolve) => {
            resolveSlowPoll = resolve;
        });
        vi.mocked(getBackfillJobStatus).mockReturnValue(slowPoll);

        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "dispatching", progress_pct: 0 }}
            />,
        );

        // First tick fires and is left unresolved, simulating a slow response.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);

        // Several more poll cycles elapse while that request is still in
        // flight. The in-flight guard must skip every one of them rather than
        // dispatching an overlapping request that could resolve out of order
        // and be overwritten by — or overwrite — whatever the slow response
        // eventually applies (the exact race that used to resurrect a stale
        // zombie banner after a terminal result).
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 3);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);

        // The slow request finally resolves with a terminal result.
        await act(async () => {
            resolveSlowPoll({
                data: { ...RUNNING_JOB, status: "completed", progress_pct: 100 },
            });
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        expect(screen.queryByText("Live — refreshing…")).not.toBeInTheDocument();
        expect(screen.queryByText("Live updates paused")).not.toBeInTheDocument();

        // No overlapping/late response can resurrect the banner afterward.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000 * 4);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
    });
});

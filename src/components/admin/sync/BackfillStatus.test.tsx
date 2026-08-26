import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test/utils";
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

    it("renders a terminal completed job without a Refresh control", () => {
        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "completed", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        expect(screen.queryByTestId("refresh-control-button")).not.toBeInTheDocument();
    });

    it("renders a terminal fanout 'success' job without a Refresh control", () => {
        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "success", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        expect(screen.queryByTestId("refresh-control-button")).not.toBeInTheDocument();
    });

    it("renders a terminal fanout 'partial_failed' job with a completed-with-failures label", () => {
        render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "partial_failed", progress_pct: 100 }}
                testMode
            />,
        );

        expect(screen.getByText("Completed with failures")).toBeInTheDocument();
        expect(screen.queryByTestId("refresh-control-button")).not.toBeInTheDocument();
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

    it("renders a fanout 'planned' job as non-terminal with a Refresh control", () => {
        render(<BackfillStatus initialJob={{ ...RUNNING_JOB, status: "planned" }} testMode />);

        expect(screen.getByText("Waiting to start...")).toBeInTheDocument();
        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();
    });

    it("re-syncs local state when initialJob transitions to a terminal status on the SAME job id (CHAOS-2868)", () => {
        const { rerender } = render(
            <BackfillStatus
                initialJob={{ ...RUNNING_JOB, status: "dispatching", progress_pct: 0 }}
                testMode
            />,
        );

        expect(screen.getByText("Dispatching work...")).toBeInTheDocument();
        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();

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
        expect(screen.queryByTestId("refresh-control-button")).not.toBeInTheDocument();
    });
});

describe("BackfillStatus — CHAOS-4318 manual refresh (no timer-driven polling)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function clickRefresh() {
        // fireEvent (not userEvent) — userEvent's internal pointer-event
        // simulation needs real timers and hangs under vi.useFakeTimers().
        await act(async () => {
            fireEvent.click(screen.getByTestId("refresh-control-button"));
            await vi.advanceTimersByTimeAsync(0);
        });
    }

    it("fetches once on mount, then never again on its own — even after many minutes", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({
            data: { ...RUNNING_JOB, status: "completed", completed_chunks: 6, progress_pct: 100 },
        });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        });

        expect(getBackfillJobStatus).not.toHaveBeenCalled();
        expect(screen.getByText("Processing chunk 3 of 6")).toBeInTheDocument();
        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();
    });

    it("reads persisted status on an explicit Refresh click and shows the terminal result", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({
            data: { ...RUNNING_JOB, status: "completed", completed_chunks: 6, progress_pct: 100 },
        });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);
        await clickRefresh();

        expect(getBackfillJobStatus).toHaveBeenCalledWith("job-1");
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        // Terminal now — the Refresh control is gone, so clicking again is moot.
        expect(screen.queryByTestId("refresh-control-button")).not.toBeInTheDocument();
    });

    it("does not fetch a live API in test mode even when Refresh is clicked", async () => {
        render(<BackfillStatus initialJob={RUNNING_JOB} testMode />);
        await clickRefresh();

        expect(getBackfillJobStatus).not.toHaveBeenCalled();
    });

    it("keeps the last good snapshot and stays refreshable when a Refresh click returns { error }", async () => {
        vi.mocked(getBackfillJobStatus).mockResolvedValue({ error: "Unauthorized (401)" });

        render(<BackfillStatus initialJob={RUNNING_JOB} />);
        await clickRefresh();

        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Processing chunk 3 of 6")).toBeInTheDocument();
        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();

        // A second click can retry — no state got stuck from the failed one.
        await clickRefresh();
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(2);
    });

    it("disables the Refresh control while a request is in flight, so it can't be double-fired", async () => {
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

        const button = screen.getByTestId("refresh-control-button");
        await act(async () => {
            fireEvent.click(button);
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("refresh-control-button")).toBeDisabled();

        await act(async () => {
            resolveSlowPoll({
                data: { ...RUNNING_JOB, status: "completed", progress_pct: 100 },
            });
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByText("Backfill complete")).toBeInTheDocument();
        // Still only ever the one request the click issued.
        expect(getBackfillJobStatus).toHaveBeenCalledTimes(1);
    });
});

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
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/utils";
import { SyncRunDetailLive } from "./SyncRunDetailLive";
import { SAMPLE_SYNC_RUN, SAMPLE_SYNC_RUN_UNIT_SUMMARY } from "@/data/syncRunDetailSample";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";

// The detail component imports the admin server actions for live polling. The
// real module pulls in next-auth (which fails to resolve next/server under
// vitest), and test-mode never invokes them, so stub them out at module load.
vi.mock("@/lib/admin/server", () => ({
    getSyncRunStatus: vi.fn(),
    getSyncRunUnits: vi.fn(),
}));

function renderDetail() {
    return render(
        <SyncRunDetailLive
            initialRun={SAMPLE_SYNC_RUN}
            initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
            testMode
        />,
    );
}

describe("SyncRunDetailLive", () => {
    it("renders overall progress and unit status counts", () => {
        renderDetail();

        // completed (2) + failed (1) = 3 of 4 settled → 75%
        expect(screen.getByText(/3 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/75%/)).toBeInTheDocument();

        // Status rollup labels from by_status.
        expect(screen.getByText("Unit status")).toBeInTheDocument();
        expect(screen.getAllByText("retrying").length).toBeGreaterThan(0);
        expect(screen.getAllByText("failed").length).toBeGreaterThan(0);

        // Unit count header reflects the summary.
        expect(screen.getByText(/Units \(4\)/)).toBeInTheDocument();
    });

    it("renders resolved source NAMES and never the raw source id", () => {
        renderDetail();

        expect(screen.getAllByText("fullchaos/platform-api").length).toBeGreaterThan(0);
        expect(screen.getAllByText("fullchaos/billing-service").length).toBeGreaterThan(0);

        // Raw source ids must never surface in the UI.
        expect(screen.queryByText("sample-source-1")).not.toBeInTheDocument();
        expect(screen.queryByText("sample-source-2")).not.toBeInTheDocument();
    });

    it("surfaces failed/retrying error_category and the next retry", () => {
        renderDetail();

        expect(screen.getByText("Needs attention")).toBeInTheDocument();
        expect(screen.getByText(/Next retry/)).toBeInTheDocument();
        expect(screen.getByText(/Category: rate_limit/)).toBeInTheDocument();
        // Error text renders in both the attention panel and the unit table.
        expect(
            screen.getAllByText("Upstream returned 500 while paginating pull requests").length,
        ).toBeGreaterThan(0);
        expect(screen.getAllByText("Secondary rate limit hit; backing off").length).toBeGreaterThan(
            0,
        );
    });

    it("renders a row per unit in the unit table", () => {
        renderDetail();

        // Datasets and cost classes from the four sample units appear as cells.
        expect(screen.getAllByText("git").length).toBeGreaterThan(0);
        expect(screen.getAllByText("cicd").length).toBeGreaterThan(0);
        expect(screen.getAllByText("expensive").length).toBeGreaterThan(0);

        // Each unit's status renders as a badge label inside the table.
        expect(screen.getAllByText("success").length).toBeGreaterThan(0);

        // Short unit id prefix is rendered (mono cell), proving table rows exist.
        expect(screen.getAllByText("sample-u").length).toBe(
            SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.length,
        );
    });
});

describe("SyncRunDetailLive — live poll error handling", () => {
    // A non-terminal run so the poll loop actually starts (the sample run is
    // partial_failed → terminal, which never polls).
    const RUNNING_RUN = { ...SAMPLE_SYNC_RUN, status: "running" };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stops polling and surfaces an error indicator when a poll returns { error }", async () => {
        // withErrorHandling RETURNS { error } (never throws); the loop must not
        // apply it as data nor spin forever.
        vi.mocked(getSyncRunStatus).mockResolvedValue({ error: "Unauthorized (401)" });
        vi.mocked(getSyncRunUnits).mockResolvedValue({ error: "Unauthorized (401)" });

        render(
            <SyncRunDetailLive
                initialRun={RUNNING_RUN}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
                initialUnitsError={null}
            />,
        );

        // First poll tick fires after the interval and resolves to { error }.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500);
        });

        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);
        // Non-fatal error indicator renders with the surfaced message.
        expect(
            screen.getByText(/Failed to load unit details: Unauthorized \(401\)/),
        ).toBeInTheDocument();

        // Polling STOPPED: advancing well past several intervals triggers no
        // further polls (no infinite spinner).
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500 * 4);
        });
        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);

        // Last good snapshot is retained — units were NOT fabricated/emptied.
        expect(screen.getByText(/Units \(4\)/)).toBeInTheDocument();
    });

    it("renders the server-side initialUnitsError without polling for a terminal run", () => {
        render(
            <SyncRunDetailLive
                initialRun={SAMPLE_SYNC_RUN}
                initialSummary={null}
                initialUnitsError="Internal Server Error (500)"
            />,
        );

        // Run header still renders from the successful run fetch (terminal run).
        expect(screen.getByText(/Run complete/)).toBeInTheDocument();
        // Explicit units error notice, no fabricated empty "Units (0)".
        expect(
            screen.getByText(/Failed to load unit details: Internal Server Error \(500\)/),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Units \(0\)/)).not.toBeInTheDocument();
        // Terminal run → no polling occurred.
        expect(getSyncRunStatus).not.toHaveBeenCalled();
    });
});

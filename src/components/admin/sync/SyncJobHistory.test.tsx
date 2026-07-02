import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";
import type { SyncJob } from "@/lib/admin/types";
import { SYNC_JOB_WITH_RUN } from "@/lib/admin/__tests__/syncCoverageFixtures";
import { SyncJobHistory } from "./SyncJobHistory";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}));

const mockGetSyncJobs = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    getSyncJobs: (...args: unknown[]) => mockGetSyncJobs(...args),
}));

beforeEach(() => {
    mockPush.mockClear();
    mockGetSyncJobs.mockReset();
});

function buildJobs(count: number): SyncJob[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `job-${index + 1}`,
        config_id: "cfg-1",
        status: "success",
        started_at: `2024-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
        completed_at: `2024-01-01T00:${String(index).padStart(2, "0")}:30.000Z`,
        duration_seconds: 30,
        items_synced: index + 1,
    }));
}

describe("SyncJobHistory", () => {
    it("shows empty state when there are no jobs", () => {
        render(<SyncJobHistory jobs={[]} configId="cfg-1" />);

        expect(screen.getByText("No sync history available.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    });

    it("renders the redesigned column headings", () => {
        render(<SyncJobHistory jobs={[SYNC_JOB_WITH_RUN]} configId="cfg-1" testMode />);

        for (const heading of [
            "Trigger",
            "Mode",
            "Requested range",
            "Covered range",
            "Status",
            "Scope",
            "Units",
            "Started",
            "Duration",
            "Actions",
        ]) {
            expect(screen.getByText(heading)).toBeInTheDocument();
        }
    });

    it("derives a partial coverage-result badge from persisted sync_run unit counts only", () => {
        render(<SyncJobHistory jobs={[SYNC_JOB_WITH_RUN]} configId="cfg-1" testMode />);

        // SYNC_JOB_WITH_RUN: total_units=2, completed_units=1, failed_units=1.
        expect(screen.getByText("Partial")).toBeInTheDocument();
        expect(screen.getByText("1 done · 1 failed · 2 total")).toBeInTheDocument();
    });

    it("renders requested/covered ranges and links planner-backed rows to run detail", () => {
        render(<SyncJobHistory jobs={[SYNC_JOB_WITH_RUN]} configId="cfg-1" testMode />);

        const link = screen.getByRole("link", { name: /View run details/ });
        expect(link).toHaveAttribute("href", "/org/admin/sync/cfg-1/runs/run-coverage");
        expect(screen.getByText("Jan 1, 2026 → Jan 3, 2026")).toBeInTheDocument();
    });

    it("renders legacy rows (no sync_run block) readably with em-dashes, never a fabricated coverage result", () => {
        const legacyJob: SyncJob = {
            id: "job-legacy",
            config_id: "cfg-1",
            status: "success",
            started_at: "2024-01-01T00:00:00.000Z",
            completed_at: "2024-01-01T00:00:30.000Z",
            duration_seconds: 30,
            items_synced: 5,
        };

        render(<SyncJobHistory jobs={[legacyJob]} configId="cfg-1" testMode />);

        expect(screen.queryByRole("link", { name: /View run details/ })).not.toBeInTheDocument();
        expect(screen.getAllByText("—").length).toBeGreaterThan(0);
        // Legacy rows fall back to the plain job-status badge, not the
        // complete/partial/gap/failed coverage vocabulary.
        expect(screen.getByText("Success")).toBeInTheDocument();
    });

    it("renders a fallback badge for pending jobs with null started_at, never the epoch date", () => {
        const pendingJob: SyncJob = {
            id: "job-pending",
            config_id: "cfg-1",
            status: "pending",
            started_at: null,
            completed_at: null,
            duration_seconds: null,
            items_synced: 0,
        };

        render(<SyncJobHistory jobs={[pendingJob]} configId="cfg-1" testMode />);

        expect(screen.getByText("Queued")).toBeInTheDocument();
        expect(screen.queryByText(/19[67]\d/)).not.toBeInTheDocument();
    });

    describe("test-mode client-side pagination", () => {
        it("renders first page with 10 jobs", () => {
            render(<SyncJobHistory jobs={buildJobs(12)} configId="cfg-1" testMode />);

            expect(screen.getByText("Showing 1-10")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        });

        it("clicking Next shows the next page and disables Next on the last page", async () => {
            render(<SyncJobHistory jobs={buildJobs(12)} configId="cfg-1" testMode />);

            await userEvent.click(screen.getByRole("button", { name: "Next" }));

            expect(screen.getByText("Showing 11-12")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
        });

        it("clicking Previous returns to the previous page", async () => {
            render(<SyncJobHistory jobs={buildJobs(12)} configId="cfg-1" testMode />);

            await userEvent.click(screen.getByRole("button", { name: "Next" }));
            await userEvent.click(screen.getByRole("button", { name: "Previous" }));

            expect(screen.getByText("Showing 1-10")).toBeInTheDocument();
        });
    });

    describe("server-backed pagination (non-test-mode)", () => {
        it("fetches the next page via getSyncJobs with limit/offset params", async () => {
            const firstPage = buildJobs(11); // PAGE_SIZE + 1 => hasMore
            const secondPage = buildJobs(5).map((job, i) => ({ ...job, id: `page2-job-${i}` }));
            mockGetSyncJobs.mockResolvedValueOnce({ data: secondPage });

            render(<SyncJobHistory jobs={firstPage} configId="cfg-1" />);

            await userEvent.click(screen.getByRole("button", { name: "Next" }));

            await waitFor(() => {
                expect(mockGetSyncJobs).toHaveBeenCalledWith("cfg-1", 11, 10);
            });
            expect(screen.getByText("Showing 11-15")).toBeInTheDocument();
        });

        it("shows an inline error and keeps the current page when the fetch fails", async () => {
            mockGetSyncJobs.mockResolvedValueOnce({ error: "Request failed with 500" });

            render(<SyncJobHistory jobs={buildJobs(11)} configId="cfg-1" />);

            await userEvent.click(screen.getByRole("button", { name: "Next" }));

            await waitFor(() => {
                expect(screen.getByRole("alert")).toHaveTextContent("Request failed with 500");
            });
            expect(screen.getByText("Showing 1-10")).toBeInTheDocument();
        });
    });
});

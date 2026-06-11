import { describe, expect, it } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import type { SyncJob } from "@/lib/admin/types";
import { SyncJobHistory } from "./SyncJobHistory";

function buildJobs(count: number): SyncJob[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `job-${index + 1}`,
        config_id: "cfg-1",
        status: "success",
        started_at: `2024-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
        completed_at: `2024-01-01T00:${String(index).padStart(2, "0")}:30.000Z`,
        duration_seconds: 30,
        items_synced: index + 1,
        error: `error-${index + 1}`,
    }));
}

describe("SyncJobHistory", () => {
    it("renders first page with 10 jobs", () => {
        render(<SyncJobHistory jobs={buildJobs(12)} />);

        expect(screen.getByText("error-1")).toBeInTheDocument();
        expect(screen.getByText("error-10")).toBeInTheDocument();
        expect(screen.queryByText("error-11")).not.toBeInTheDocument();
        expect(screen.getByText("Showing 1-10 of 12")).toBeInTheDocument();
    });

    it("disables Previous on first page", () => {
        render(<SyncJobHistory jobs={buildJobs(12)} />);

        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    });

    it("disables Next on last page", async () => {
        render(<SyncJobHistory jobs={buildJobs(12)} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
        expect(screen.getByText("Showing 11-12 of 12")).toBeInTheDocument();
    });

    it("clicking Next shows next page", async () => {
        render(<SyncJobHistory jobs={buildJobs(12)} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(screen.queryByText("error-1")).not.toBeInTheDocument();
        expect(screen.getByText("error-11")).toBeInTheDocument();
        expect(screen.getByText("error-12")).toBeInTheDocument();
    });

    it("clicking Previous returns to previous page", async () => {
        render(<SyncJobHistory jobs={buildJobs(12)} />);

        await userEvent.click(screen.getByRole("button", { name: "Next" }));
        await userEvent.click(screen.getByRole("button", { name: "Previous" }));

        expect(screen.getByText("error-1")).toBeInTheDocument();
        expect(screen.queryByText("error-11")).not.toBeInTheDocument();
        expect(screen.getByText("Showing 1-10 of 12")).toBeInTheDocument();
    });

    it("renders an em dash for pending jobs with null started_at, not the epoch date", () => {
        const pendingJob: SyncJob = {
            id: "job-pending",
            config_id: "cfg-1",
            status: "pending",
            started_at: null,
            completed_at: null,
            duration_seconds: null,
            items_synced: 0,
        };
        render(<SyncJobHistory jobs={[pendingJob]} />);

        expect(screen.getByText("—")).toBeInTheDocument();
        // new Date(null) coerces to epoch 0; the 1969/1970 date must never render.
        expect(screen.queryByText(/19[67]\d/)).not.toBeInTheDocument();
    });

    it("shows empty state when there are no jobs", () => {
        render(<SyncJobHistory jobs={[]} />);

        expect(screen.getByText("No sync history available.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    });
});

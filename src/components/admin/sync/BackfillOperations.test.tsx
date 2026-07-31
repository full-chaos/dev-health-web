import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { BackfillOperations } from "./BackfillOperations";
import { PARTIAL_COVERAGE_SUMMARY } from "@/lib/admin/__tests__/syncCoverageFixtures";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/server", () => ({
    triggerSync: vi.fn(),
    getSyncRunStatus: vi.fn(),
    getSyncJobs: vi.fn(),
    triggerBackfill: vi.fn(),
    getBackfillJobStatus: vi.fn(),
}));

function renderOperations() {
    return render(
        <BackfillOperations
            configId="cfg-1"
            coverage={PARTIAL_COVERAGE_SUMMARY}
            coverageError={undefined}
            isActive
            activeBackfillJob={null}
            testMode
        />,
    );
}

describe("BackfillOperations", () => {
    it("opens the wizard IN PLACE (no navigation) from the summary card's Backfill CTA", async () => {
        const user = userEvent.setup();
        renderOperations();

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Backfill" }));

        expect(screen.getByRole("dialog", { name: "Run historical backfill" })).toBeInTheDocument();
        // Opened from the generic entry point: no gap prefill.
        expect(screen.getByLabelText("From")).toHaveValue("");
    });

    it("opens the wizard prefilled with the gap's range from a timeline 'Backfill this gap' action", async () => {
        const user = userEvent.setup();
        renderOperations();

        await user.click(screen.getByRole("button", { name: "Backfill this gap" }));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByLabelText("From")).toHaveValue("2026-01-02");
        expect(screen.getByLabelText("To")).toHaveValue("2026-01-03");
    });

    it("opens an unscoped recovery backfill when coverage cannot load", async () => {
        const user = userEvent.setup();
        render(
            <BackfillOperations
                configId="cfg-1"
                coverage={null}
                coverageError="fetch failed"
                isActive
                activeBackfillJob={null}
                testMode
            />,
        );

        await user.click(screen.getByRole("button", { name: "Backfill" }));

        expect(screen.getByRole("dialog", { name: "Run historical backfill" })).toBeInTheDocument();
        expect(screen.getByLabelText("From")).toHaveValue("");
        expect(screen.getAllByText("No coverage data yet")).toHaveLength(2);
    });

    it("closes the wizard via its Cancel action", async () => {
        const user = userEvent.setup();
        renderOperations();

        await user.click(screen.getByRole("button", { name: "Backfill" }));
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders no persisted backfill-status banner when there is no active job", () => {
        renderOperations();
        expect(screen.queryByTestId("backfill-status")).not.toBeInTheDocument();
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
import { act, fireEvent, render, screen, userEvent } from "@/test/utils";
import { BackfillOperations } from "./BackfillOperations";
import {
    PARTIAL_COVERAGE_SUMMARY,
    TRUNCATED_COVERAGE_SUMMARY,
} from "@/lib/admin/__tests__/syncCoverageFixtures";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
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

beforeEach(() => mockRefresh.mockClear());
afterEach(() => vi.useRealTimers());

describe("BackfillOperations", () => {
    it("keeps the last persisted coverage visible while its replacement is updating", () => {
        const refreshingCoverage = {
            ...PARTIAL_COVERAGE_SUMMARY,
            coverage_since: "2026-01-01T00:00:00Z",
            coverage_through: "2026-01-03T00:00:00Z",
            projection_refreshing: true,
        };
        const updatedCoverage = {
            ...PARTIAL_COVERAGE_SUMMARY,
            generated_at: "2026-01-06T01:00:00Z",
            coverage_since: "2026-01-01T00:00:00Z",
            coverage_through: "2026-01-05T00:00:00Z",
            projection_refreshing: false,
        };
        const { rerender } = render(
            <BackfillOperations
                configId="cfg-1"
                coverage={refreshingCoverage}
                coverageError={undefined}
                isActive
                activeBackfillJob={null}
                testMode
            />,
        );

        expect(
            screen.getByRole("status", { name: "Coverage update in progress" }),
        ).toHaveTextContent("Showing the last completed coverage while this sync is updating it.");
        expect(screen.getByTestId("coverage-window")).toHaveTextContent(
            "Coverage shown: Jan 1, 2026 – Jan 3, 2026",
        );
        expect(screen.getByRole("heading", { name: "Coverage & gaps" })).toBeInTheDocument();

        rerender(
            <BackfillOperations
                configId="cfg-1"
                coverage={updatedCoverage}
                coverageError={undefined}
                isActive
                activeBackfillJob={null}
                testMode
            />,
        );

        expect(
            screen.queryByRole("status", { name: "Coverage update in progress" }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("coverage-window")).toHaveTextContent(
            "Coverage shown: Jan 1, 2026 – Jan 5, 2026",
        );
    });

    it("CHAOS-4318: never auto-refreshes a refreshing coverage projection — only an explicit Refresh click does", async () => {
        vi.useFakeTimers();
        render(
            <BackfillOperations
                configId="cfg-1"
                coverage={{ ...PARTIAL_COVERAGE_SUMMARY, projection_refreshing: true }}
                coverageError={undefined}
                isActive
                activeBackfillJob={null}
            />,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(mockRefresh).not.toHaveBeenCalled();

        const button = within(
            screen.getByRole("status", { name: "Coverage update in progress" }),
        ).getByTestId("refresh-control-button");
        // fireEvent (not userEvent) — userEvent's internal pointer-event
        // simulation needs real timers and hangs under vi.useFakeTimers().
        await act(async () => {
            fireEvent.click(button);
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(mockRefresh).toHaveBeenCalledOnce();
    });

    it("opens the wizard IN PLACE (no navigation) from the summary card's Backfill CTA", async () => {
        const user = userEvent.setup();
        renderOperations();

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Backfill" }));

        expect(screen.getByRole("dialog", { name: "Run focused backfill" })).toBeInTheDocument();
        // Opened from the generic entry point: no gap prefill.
        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("");
    });

    it("auto-selects the one server-authorized suggestion with its exact scope", async () => {
        const user = userEvent.setup();
        const window = {
            since: "2026-01-02T00:00:00Z",
            before: "2026-01-03T00:00:00Z",
            source_ids: ["src-repo"],
            dataset_keys: ["commits"],
            reasons: ["gap"] as const,
        };
        render(
            <BackfillOperations
                configId="cfg-1"
                coverage={{ ...PARTIAL_COVERAGE_SUMMARY, backfill_windows: [window] }}
                coverageError={undefined}
                isActive
                activeBackfillJob={null}
                testMode
            />,
        );

        await user.click(screen.getByRole("button", { name: "Backfill" }));

        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("2026-01-02");
        expect(screen.getByLabelText("Before (exclusive)")).toHaveValue("2026-01-03");
        expect(screen.getByRole("radio", { name: /Choose specific sources/ })).toBeChecked();
        expect(screen.getByLabelText("acme/repo")).toBeChecked();
        expect(screen.getByRole("radio", { name: /Choose specific datasets/ })).toBeChecked();
        expect(screen.getByLabelText("commits")).toBeChecked();
    });

    it("states when Ops supplied no exact suggestion and leaves manual scope empty", async () => {
        const user = userEvent.setup();
        render(
            <BackfillOperations
                configId="cfg-1"
                coverage={{ ...PARTIAL_COVERAGE_SUMMARY, backfill_windows: [] }}
                coverageError={undefined}
                isActive
                activeBackfillJob={null}
                testMode
            />,
        );

        await user.click(screen.getByRole("button", { name: "Backfill" }));

        expect(screen.getByRole("status")).toHaveTextContent(
            "No server-suggested backfill window is available",
        );
        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("");
    });

    it("opens the wizard prefilled with the gap's range from a timeline 'Backfill this gap' action", async () => {
        const user = userEvent.setup();
        renderOperations();

        await user.click(screen.getByRole("button", { name: "Backfill this gap" }));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("2026-01-02");
        expect(screen.getByLabelText("Before (exclusive)")).toHaveValue("2026-01-03");
    });

    it("opens the wizard with the exact server-owned canonical backfill window", async () => {
        const user = userEvent.setup();
        render(
            <BackfillOperations
                configId="cfg-1"
                coverage={TRUNCATED_COVERAGE_SUMMARY}
                coverageError={undefined}
                isActive
                activeBackfillJob={null}
                testMode
            />,
        );

        await user.click(
            screen.getByRole("button", { name: "Backfill Dec 20, 2025 to Jan 1, 2026" }),
        );

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("2025-12-20");
        expect(screen.getByLabelText("Before (exclusive)")).toHaveValue("2026-01-01");
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

        expect(screen.getByRole("dialog", { name: "Run focused backfill" })).toBeInTheDocument();
        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("");
        expect(screen.getByRole("radio", { name: /Choose specific sources/ })).toBeDisabled();
        expect(screen.getByRole("radio", { name: /Choose specific datasets/ })).toBeDisabled();
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

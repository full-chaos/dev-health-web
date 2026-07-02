import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { SyncCoverageSummaryCard } from "./SyncCoverageSummaryCard";
import {
    COMPLETE_COVERAGE_SUMMARY,
    LEGACY_INSUFFICIENT_DATA_SUMMARY,
    PARTIAL_COVERAGE_SUMMARY,
} from "@/lib/admin/__tests__/syncCoverageFixtures";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/server", () => ({
    triggerSync: vi.fn(),
    getSyncRunStatus: vi.fn(),
    getSyncJobs: vi.fn(),
}));

beforeEach(() => {
    mockPush.mockClear();
});

describe("SyncCoverageSummaryCard", () => {
    it("renders a loading state when coverage has not resolved yet", () => {
        render(
            <SyncCoverageSummaryCard
                configId="cfg-1"
                coverage={null}
                isActive
                error={undefined}
                onBackfillAction={vi.fn()}
            />,
        );

        expect(screen.getByTestId("coverage-summary-loading")).toBeInTheDocument();
    });

    it("renders an explicit error state instead of fabricating a summary", () => {
        render(
            <SyncCoverageSummaryCard
                configId="cfg-1"
                coverage={null}
                error="Request failed with 500"
                isActive
                onBackfillAction={vi.fn()}
            />,
        );

        expect(screen.getByTestId("coverage-summary-error")).toBeInTheDocument();
        expect(screen.getByText("Request failed with 500")).toBeInTheDocument();
    });

    it("renders the healthy health badge and key stats, and opens the wizard on Backfill", async () => {
        const onBackfillAction = vi.fn();
        const user = userEvent.setup();
        render(
            <SyncCoverageSummaryCard
                configId="cfg-1"
                coverage={COMPLETE_COVERAGE_SUMMARY}
                isActive
                error={undefined}
                onBackfillAction={onBackfillAction}
            />,
        );

        expect(screen.getByText("Healthy")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText("Sync Now")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Edit config" })).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg-1/edit",
        );

        const backfillButton = screen.getByRole("button", { name: "Backfill" });
        await user.click(backfillButton);
        expect(onBackfillAction).toHaveBeenCalledOnce();
    });

    it("renders gap-detected health without the literal word unknown", () => {
        render(
            <SyncCoverageSummaryCard
                configId="cfg-1"
                coverage={PARTIAL_COVERAGE_SUMMARY}
                isActive
                error={undefined}
                onBackfillAction={vi.fn()}
            />,
        );

        expect(screen.getByText("Gaps detected")).toBeInTheDocument();
        expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument();
    });

    it("shows an explanatory legacy notice for insufficient_data + legacy data_basis", () => {
        render(
            <SyncCoverageSummaryCard
                configId="cfg-1"
                coverage={LEGACY_INSUFFICIENT_DATA_SUMMARY}
                isActive={false}
                error={undefined}
                onBackfillAction={vi.fn()}
            />,
        );

        expect(screen.getByText("Insufficient data")).toBeInTheDocument();
        expect(screen.getByTestId("coverage-legacy-notice")).toBeInTheDocument();
        expect(screen.getByText("Inactive")).toBeInTheDocument();
        expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
    });
});

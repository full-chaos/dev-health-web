import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";
import { SyncCoverageTimeline } from "./SyncCoverageTimeline";
import {
    COMPLETE_COVERAGE_SUMMARY,
    LEGACY_INSUFFICIENT_DATA_SUMMARY,
    PARTIAL_COVERAGE_SUMMARY,
    TRUNCATED_COVERAGE_SUMMARY,
} from "@/lib/admin/__tests__/syncCoverageFixtures";
import {
    SAMPLE_COVERAGE_CONCURRENT_CONFIG,
    SAMPLE_COVERAGE_OVERLAPPING_RETRY,
} from "@/data/syncCoverageSample";

describe("SyncCoverageTimeline", () => {
    it("renders a loading state when coverage has not resolved yet", () => {
        render(<SyncCoverageTimeline coverage={null} onBackfillWindowAction={vi.fn()} />);

        expect(screen.getByTestId("coverage-timeline-loading")).toBeInTheDocument();
    });

    it("renders an explicit error state instead of fabricating a timeline", () => {
        render(
            <SyncCoverageTimeline
                coverage={null}
                error="Coverage endpoint returned 500"
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getByText("Coverage timeline unavailable")).toBeInTheDocument();
        expect(screen.getByText("Coverage endpoint returned 500")).toBeInTheDocument();
    });

    it("renders a legacy-aware empty state for insufficient_data + legacy data_basis", () => {
        render(
            <SyncCoverageTimeline
                coverage={LEGACY_INSUFFICIENT_DATA_SUMMARY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getByText("No planner-tracked coverage yet")).toBeInTheDocument();
        expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
    });

    it("renders dataset rows with resolved source names, never raw source ids", () => {
        render(
            <SyncCoverageTimeline
                coverage={PARTIAL_COVERAGE_SUMMARY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getAllByText("commits").length).toBeGreaterThan(0);
        expect(screen.getAllByText("acme/repo").length).toBeGreaterThan(0);
        expect(screen.queryByText(/src-repo/)).not.toBeInTheDocument();
    });

    it("preserves the legacy gap action when canonical windows are absent", async () => {
        const onBackfillWindowAction = vi.fn();
        const user = userEvent.setup();
        render(
            <SyncCoverageTimeline
                coverage={PARTIAL_COVERAGE_SUMMARY}
                onBackfillWindowAction={onBackfillWindowAction}
            />,
        );

        const button = screen.getByRole("button", { name: "Backfill this gap" });
        await user.click(button);
        expect(onBackfillWindowAction).toHaveBeenCalledWith(
            expect.objectContaining({
                since: "2026-01-02T00:00:00Z",
                before: "2026-01-03T00:00:00Z",
            }),
        );
    });

    it("uses only canonical backfill windows when the field is present", async () => {
        const onBackfillWindowAction = vi.fn();
        const user = userEvent.setup();
        render(
            <SyncCoverageTimeline
                coverage={TRUNCATED_COVERAGE_SUMMARY}
                onBackfillWindowAction={onBackfillWindowAction}
            />,
        );

        expect(screen.queryByRole("button", { name: "Backfill this gap" })).not.toBeInTheDocument();
        const action = screen.getByRole("button", {
            name: "Backfill Dec 20, 2025 to Jan 1, 2026",
        });
        await user.click(action);
        expect(onBackfillWindowAction).toHaveBeenCalledWith({
            since: "2025-12-20",
            before: "2026-01-01",
        });
    });

    it("opens a gap action only for its exact server-authorized source and dataset window", async () => {
        const onBackfillWindowAction = vi.fn();
        const user = userEvent.setup();
        const window = {
            since: "2026-01-02T00:00:00Z",
            before: "2026-01-03T00:00:00Z",
            source_ids: ["src-repo"],
            dataset_keys: ["commits"],
            reasons: ["gap"] as const,
        };
        render(
            <SyncCoverageTimeline
                coverage={{ ...PARTIAL_COVERAGE_SUMMARY, backfill_windows: [window] }}
                onBackfillWindowAction={onBackfillWindowAction}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Backfill this gap" }));
        expect(onBackfillWindowAction).toHaveBeenCalledWith(window);
    });

    it("does not infer a backfill action from gaps when canonical windows are explicitly empty", () => {
        render(
            <SyncCoverageTimeline
                coverage={{ ...PARTIAL_COVERAGE_SUMMARY, backfill_windows: [] }}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getAllByText("Gap").length).toBeGreaterThan(0);
        expect(screen.queryByRole("button", { name: /Backfill/ })).not.toBeInTheDocument();
        expect(screen.getAllByText("No exact backfill suggestion").length).toBeGreaterThan(0);
    });

    it("uses the server coverage bounds as the decorative timeline extent", () => {
        render(
            <SyncCoverageTimeline
                coverage={TRUNCATED_COVERAGE_SUMMARY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getByTestId("coverage-covered-band-commits")).toHaveStyle({
            left: "74.8051948051948%",
            width: "6.233766233766234%",
        });
    });

    it("falls back to the dataset extent when explicit coverage bounds are invalid", () => {
        render(
            <SyncCoverageTimeline
                coverage={{
                    ...TRUNCATED_COVERAGE_SUMMARY,
                    coverage_since: "not-a-date",
                    coverage_through: "also-not-a-date",
                }}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getByTestId("coverage-covered-band-commits")).toHaveStyle({
            left: "0%",
            width: "50%",
        });
    });

    it("expands server coverage bounds to keep actual gap ranges visible", () => {
        render(
            <SyncCoverageTimeline
                coverage={{
                    ...TRUNCATED_COVERAGE_SUMMARY,
                    coverage_since: "2026-01-01T00:00:00Z",
                    coverage_through: "2026-01-02T00:00:00Z",
                }}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getByTestId("coverage-covered-band-commits")).toHaveStyle({
            left: "0%",
            width: "50%",
        });
    });

    it("filters rendered datasets by the dataset filter", async () => {
        render(
            <SyncCoverageTimeline
                coverage={COMPLETE_COVERAGE_SUMMARY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        expect(screen.getAllByText("commits").length).toBeGreaterThan(0);

        const [datasetSelect] = screen.getAllByRole("combobox");
        await userEvent.selectOptions(datasetSelect, "commits");

        expect(screen.getAllByText("commits").length).toBeGreaterThan(0);
    });

    it("filters the accessible table rows by the source filter", async () => {
        render(
            <SyncCoverageTimeline
                coverage={PARTIAL_COVERAGE_SUMMARY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        const selects = screen.getAllByRole("combobox");
        const sourceSelect = selects[1];
        await userEvent.selectOptions(sourceSelect, "src-repo");

        // Every dataset in the fixture references the single source, so rows
        // should still be present after filtering to that source.
        const table = screen.getAllByRole("table")[0];
        expect(within(table).getAllByText("acme/repo").length).toBeGreaterThan(0);
    });

    it("renders an accessible table fallback alongside the CSS bands", () => {
        render(
            <SyncCoverageTimeline
                coverage={PARTIAL_COVERAGE_SUMMARY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        const tables = screen.getAllByRole("table");
        expect(tables.length).toBeGreaterThan(0);
        expect(within(tables[0]).getByText("Window")).toBeInTheDocument();
    });

    it("renders the overlapping-retry sample scenario with both a failed window and a later overlapping covered window (CHAOS-2791 D3)", () => {
        render(
            <SyncCoverageTimeline
                coverage={SAMPLE_COVERAGE_OVERLAPPING_RETRY}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        const table = screen.getAllByRole("table")[0];
        expect(within(table).getByText("Covered")).toBeInTheDocument();
        expect(within(table).getByText("Failed")).toBeInTheDocument();
        expect(within(table).getAllByText("fullchaos/platform-api").length).toBeGreaterThan(0);
    });

    it("renders the concurrent-config sample scenario with its own resolved source name (CHAOS-2791 D3)", () => {
        render(
            <SyncCoverageTimeline
                coverage={SAMPLE_COVERAGE_CONCURRENT_CONFIG}
                onBackfillWindowAction={vi.fn()}
            />,
        );

        const table = screen.getAllByRole("table")[0];
        expect(within(table).getAllByText("fullchaos/second-repo").length).toBeGreaterThan(0);
        expect(screen.queryByText(/sample-source-secondary-repo/)).not.toBeInTheDocument();
    });
});

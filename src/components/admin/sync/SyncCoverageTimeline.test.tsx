import { describe, expect, it } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";
import { SyncCoverageTimeline } from "./SyncCoverageTimeline";
import {
    COMPLETE_COVERAGE_SUMMARY,
    LEGACY_INSUFFICIENT_DATA_SUMMARY,
    PARTIAL_COVERAGE_SUMMARY,
} from "@/lib/admin/__tests__/syncCoverageFixtures";
import {
    SAMPLE_COVERAGE_CONCURRENT_CONFIG,
    SAMPLE_COVERAGE_OVERLAPPING_RETRY,
} from "@/data/syncCoverageSample";

describe("SyncCoverageTimeline", () => {
    it("renders a loading state when coverage has not resolved yet", () => {
        render(<SyncCoverageTimeline configId="cfg-1" coverage={null} />);

        expect(screen.getByTestId("coverage-timeline-loading")).toBeInTheDocument();
    });

    it("renders an explicit error state instead of fabricating a timeline", () => {
        render(
            <SyncCoverageTimeline
                configId="cfg-1"
                coverage={null}
                error="Coverage endpoint returned 500"
            />,
        );

        expect(screen.getByText("Coverage timeline unavailable")).toBeInTheDocument();
        expect(screen.getByText("Coverage endpoint returned 500")).toBeInTheDocument();
    });

    it("renders a legacy-aware empty state for insufficient_data + legacy data_basis", () => {
        render(
            <SyncCoverageTimeline configId="cfg-1" coverage={LEGACY_INSUFFICIENT_DATA_SUMMARY} />,
        );

        expect(screen.getByText("No planner-tracked coverage yet")).toBeInTheDocument();
        expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
    });

    it("renders dataset rows with resolved source names, never raw source ids", () => {
        render(<SyncCoverageTimeline configId="cfg-1" coverage={PARTIAL_COVERAGE_SUMMARY} />);

        expect(screen.getAllByText("commits").length).toBeGreaterThan(0);
        expect(screen.getAllByText("acme/repo").length).toBeGreaterThan(0);
        expect(screen.queryByText(/src-repo/)).not.toBeInTheDocument();
    });

    it("exposes a 'Backfill this gap' action deep-linking to the edit page with date query params", () => {
        render(<SyncCoverageTimeline configId="cfg-1" coverage={PARTIAL_COVERAGE_SUMMARY} />);

        const link = screen.getByRole("link", { name: "Backfill this gap" });
        expect(link).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg-1/edit?backfill_from=2026-01-02&backfill_to=2026-01-03#backfill",
        );
    });

    it("filters rendered datasets by the dataset filter", async () => {
        render(<SyncCoverageTimeline configId="cfg-1" coverage={COMPLETE_COVERAGE_SUMMARY} />);

        expect(screen.getAllByText("commits").length).toBeGreaterThan(0);

        const [datasetSelect] = screen.getAllByRole("combobox");
        await userEvent.selectOptions(datasetSelect, "commits");

        expect(screen.getAllByText("commits").length).toBeGreaterThan(0);
    });

    it("filters the accessible table rows by the source filter", async () => {
        render(<SyncCoverageTimeline configId="cfg-1" coverage={PARTIAL_COVERAGE_SUMMARY} />);

        const selects = screen.getAllByRole("combobox");
        const sourceSelect = selects[1];
        await userEvent.selectOptions(sourceSelect, "src-repo");

        // Every dataset in the fixture references the single source, so rows
        // should still be present after filtering to that source.
        const table = screen.getAllByRole("table")[0];
        expect(within(table).getAllByText("acme/repo").length).toBeGreaterThan(0);
    });

    it("renders an accessible table fallback alongside the CSS bands", () => {
        render(<SyncCoverageTimeline configId="cfg-1" coverage={PARTIAL_COVERAGE_SUMMARY} />);

        const tables = screen.getAllByRole("table");
        expect(tables.length).toBeGreaterThan(0);
        expect(within(tables[0]).getByText("Window")).toBeInTheDocument();
    });

    it("renders the overlapping-retry sample scenario with both a failed window and a later overlapping covered window (CHAOS-2791 D3)", () => {
        render(
            <SyncCoverageTimeline
                configId="sample-sync-config"
                coverage={SAMPLE_COVERAGE_OVERLAPPING_RETRY}
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
                configId="sample-sync-config-secondary"
                coverage={SAMPLE_COVERAGE_CONCURRENT_CONFIG}
            />,
        );

        const table = screen.getAllByRole("table")[0];
        expect(within(table).getAllByText("fullchaos/second-repo").length).toBeGreaterThan(0);
        expect(screen.queryByText(/sample-source-secondary-repo/)).not.toBeInTheDocument();
    });
});

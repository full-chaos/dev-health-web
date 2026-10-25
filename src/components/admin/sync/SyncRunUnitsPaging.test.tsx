import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, userEvent, waitFor, within } from "@/test/utils";
import { SyncRunDetailLive } from "./SyncRunDetailLive";
import { SAMPLE_SYNC_RUN, SAMPLE_SYNC_RUN_UNIT_SUMMARY } from "@/data/syncRunDetailSample";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import { SYNC_RUN_UNIT_PAGE_SIZE } from "@/lib/admin/syncRunUnitPaging";
import type { SyncRunUnitSummary } from "@/lib/admin/types";

vi.mock("@/lib/admin/server", () => ({
    getSyncRunStatus: vi.fn(),
    getSyncRunUnits: vi.fn(),
}));

const PAGE = 100;
const failedUnit = SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.find((unit) => unit.status === "failed")!;

function page(units: SyncRunUnitSummary["units"], filtered: number): SyncRunUnitSummary {
    return { ...SAMPLE_SYNC_RUN_UNIT_SUMMARY, units, filtered_unit_count: filtered };
}

function renderLive(
    initialSummary: SyncRunUnitSummary | null,
    initialUnitsError: string | null = null,
) {
    return render(
        <SyncRunDetailLive
            initialRun={{ ...SAMPLE_SYNC_RUN, status: "success" }}
            initialSummary={initialSummary}
            initialUnitsError={initialUnitsError}
        />,
    );
}

describe("SyncRunDetailLive unit filters on a live run", () => {
    beforeEach(() => {
        vi.mocked(getSyncRunUnits).mockReset();
    });

    it("keeps the filter bar when the units read failed, and Retry brings the table back", async () => {
        vi.mocked(getSyncRunUnits).mockResolvedValue({
            data: page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4),
        });
        renderLive(null, "Could not be read");
        const user = userEvent.setup();

        for (const label of [
            "Status",
            "Dataset",
            "Source",
            "Since",
            "Before",
            "Failed/retrying only",
        ]) {
            expect(screen.getByLabelText(label)).toBeInTheDocument();
        }
        expect(screen.getByText(/Failed to load units: Could not be read/)).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.queryByText(/Units \(0\)/)).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
        expect(getSyncRunUnits).toHaveBeenCalledWith(SAMPLE_SYNC_RUN.id, {
            limit: PAGE,
            offset: 0,
        });
        expect(screen.queryByText(/Failed to load units/)).not.toBeInTheDocument();
        expect(screen.getByText("Units (4)")).toBeInTheDocument();
    });

    it("keeps the filter bar and offers Retry when a filter read fails", async () => {
        vi.mocked(getSyncRunUnits).mockResolvedValueOnce({ error: "boom" });
        renderLive(page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4));
        const user = userEvent.setup();

        await user.selectOptions(screen.getByLabelText("Status"), "failed");

        await waitFor(() => expect(screen.getByText(/Failed to load units/)).toBeInTheDocument());
        expect(screen.getByLabelText("Status")).toHaveValue("failed");

        vi.mocked(getSyncRunUnits).mockResolvedValueOnce({ data: page([failedUnit], 1) });
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(screen.getByText("Units (1 of 4)")).toBeInTheDocument());
        expect(getSyncRunUnits).toHaveBeenLastCalledWith(SAMPLE_SYNC_RUN.id, {
            limit: PAGE,
            offset: 0,
            status: "failed",
        });
    });

    it("asks the units read for the filtered page and shows only the rows it returns", async () => {
        vi.mocked(getSyncRunUnits).mockResolvedValue({ data: page([failedUnit], 1) });
        renderLive(page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4));
        const user = userEvent.setup();

        await user.selectOptions(screen.getByLabelText("Dataset"), failedUnit.dataset_key);

        await waitFor(() => expect(screen.getByText("Units (1 of 4)")).toBeInTheDocument());
        expect(getSyncRunUnits).toHaveBeenLastCalledWith(SAMPLE_SYNC_RUN.id, {
            limit: PAGE,
            offset: 0,
            dataset_key: failedUnit.dataset_key,
        });
        expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);

        await user.selectOptions(screen.getByLabelText("Source"), failedUnit.source_id);
        await waitFor(() =>
            expect(getSyncRunUnits).toHaveBeenLastCalledWith(SAMPLE_SYNC_RUN.id, {
                limit: PAGE,
                offset: 0,
                dataset_key: failedUnit.dataset_key,
                source_id: failedUnit.source_id,
            }),
        );

        await user.click(screen.getByLabelText("Failed/retrying only"));
        await waitFor(() =>
            expect(getSyncRunUnits).toHaveBeenLastCalledWith(
                SAMPLE_SYNC_RUN.id,
                expect.objectContaining({ status: "failed,retrying" }),
            ),
        );

        fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-06-01" } });
        fireEvent.change(screen.getByLabelText("Before"), { target: { value: "2026-06-30" } });
        await waitFor(() =>
            expect(getSyncRunUnits).toHaveBeenLastCalledWith(SAMPLE_SYNC_RUN.id, {
                limit: PAGE,
                offset: 0,
                status: "failed,retrying",
                dataset_key: failedUnit.dataset_key,
                source_id: failedUnit.source_id,
                since: "2026-06-01T00:00:00.000Z",
                before: "2026-06-30T23:59:59.999Z",
            }),
        );
    });

    it("pages a large filtered result and resets to the first page when a filter changes", async () => {
        vi.mocked(getSyncRunUnits).mockResolvedValue({ data: page([failedUnit], 250) });
        renderLive(page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 250));
        const user = userEvent.setup();

        expect(screen.getByText(/Showing 1–100 of 250/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Next" }));
        await waitFor(() =>
            expect(getSyncRunUnits).toHaveBeenLastCalledWith(SAMPLE_SYNC_RUN.id, {
                limit: PAGE,
                offset: PAGE,
            }),
        );
        await waitFor(() => expect(screen.getByText(/Showing 101–200 of 250/)).toBeInTheDocument());

        await user.selectOptions(screen.getByLabelText("Status"), "failed");
        await waitFor(() =>
            expect(getSyncRunUnits).toHaveBeenLastCalledWith(SAMPLE_SYNC_RUN.id, {
                limit: PAGE,
                offset: 0,
                status: "failed",
            }),
        );
    });

    it("builds Needs attention, source labels and windows from the whole run, not from the table page", async () => {
        const [first, , , last] = SAMPLE_SYNC_RUN_UNIT_SUMMARY.units;
        const farFailed = {
            ...failedUnit,
            id: "far-unit",
            source_id: "far-source",
            source_name: null,
            source_full_name: null,
            dataset_key: "far-dataset",
            error: "boom",
            error_category: "auth",
        };
        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "success" }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    units: [first!, last!].map((unit) => ({ ...unit, status: "success" })),
                    by_source: { "far-source": { failed: 1 }, "sample-source-1": { success: 2 } },
                    source_names: { "far-source": "fullchaos/far-service" },
                    requested_window: {
                        since_at: "2026-01-02T00:00:00.000Z",
                        before_at: "2026-03-04T00:00:00.000Z",
                    },
                    covered_window: {
                        since_at: "2026-02-03T00:00:00.000Z",
                        before_at: "2026-03-04T00:00:00.000Z",
                    },
                    filtered_unit_count: 2,
                }}
                initialAttention={{ units: [farFailed], total: 1500 }}
            />,
        );

        const attention = screen.getByRole("region", { name: /needs attention/i });
        expect(within(attention).getByText("fullchaos/far-service")).toBeInTheDocument();
        expect(within(attention).getByText(/far-dataset/)).toBeInTheDocument();
        expect(
            within(attention).getByText(/First 1\s?unit of 1,500 units|First 1 of 1,500 units/),
        ).toBeInTheDocument();
        expect(screen.getAllByText("fullchaos/far-service").length).toBeGreaterThan(1);
        expect(screen.queryByText("Unresolved source")).not.toBeInTheDocument();
        expect(screen.getByText("Jan 2, 2026 → Mar 4, 2026")).toBeInTheDocument();
        expect(screen.getByText("Feb 3, 2026 → Mar 4, 2026")).toBeInTheDocument();
    });

    it("says so when the units that need attention could not be read", () => {
        renderLive(page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4));
        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "success" }}
                initialSummary={page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4)}
                initialAttention={null}
            />,
        );
        expect(screen.getByText(/Needs-attention details could not be loaded/)).toBeInTheDocument();
    });

    it("takes the page size from a module that is not a client module, for the server page", () => {
        expect(SYNC_RUN_UNIT_PAGE_SIZE).toBe(PAGE);
        const pageSource = readFileSync(
            "src/app/(app)/org/admin/sync/[configId]/runs/[runId]/page.tsx",
            "utf8",
        );
        const clientSource = readFileSync(
            "src/components/admin/sync/SyncRunDetailLive.tsx",
            "utf8",
        );
        expect(clientSource.startsWith('"use client"')).toBe(true);
        expect(pageSource).toMatch(
            /SYNC_RUN_UNIT_PAGE_SIZE[^;]*from "@\/lib\/admin\/syncRunUnitPaging"/,
        );
        expect(pageSource).not.toMatch(/SYNC_RUN_UNIT_PAGE_SIZE[^;]*SyncRunDetailLive/);
    });

    it("never shows one page of units as the window of a live run", () => {
        renderLive({
            ...page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4),
            requested_window: undefined,
            covered_window: undefined,
        });
        expect(screen.getAllByText("No window recorded")).toHaveLength(2);
        expect(screen.queryByText("Jun 12, 2026 → Jun 26, 2026")).not.toBeInTheDocument();
    });

    it("drops the Needs attention list and says so when its read fails on Refresh", async () => {
        const farFailed = { ...failedUnit, id: "far-unit", dataset_key: "far-dataset" };
        vi.mocked(getSyncRunStatus).mockResolvedValue({
            data: { ...SAMPLE_SYNC_RUN, status: "running" },
        });
        vi.mocked(getSyncRunUnits).mockImplementation(async (_runId, query) =>
            query?.status || query?.error_category
                ? { error: "boom" }
                : { data: page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4) },
        );
        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "running" }}
                initialSummary={page(SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, 4)}
                initialAttention={{ units: [farFailed], total: 1 }}
            />,
        );
        const user = userEvent.setup();
        expect(screen.getByRole("region", { name: /needs attention/i })).toBeInTheDocument();
        expect(
            screen.queryByText(/Needs-attention details could not be loaded/),
        ).not.toBeInTheDocument();

        await user.click(screen.getByTestId("refresh-control-button"));

        await waitFor(() =>
            expect(
                screen.getByText(/Needs-attention details could not be loaded/),
            ).toBeInTheDocument(),
        );
        expect(screen.queryByRole("region", { name: /needs attention/i })).not.toBeInTheDocument();
    });
});

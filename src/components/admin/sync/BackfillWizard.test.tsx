import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import type { SyncCoverageDataset, SyncCoverageSource } from "@/lib/admin/types";
import { BackfillWizard, buildDatasetChoices } from "./BackfillWizard";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const triggerBackfill = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    triggerBackfill: (...args: unknown[]) => triggerBackfill(...args),
}));

const baseDataset: Omit<SyncCoverageDataset, "dataset_key"> = {
    status: "healthy",
    covered_through: null,
    requested_ranges: [],
    covered_ranges: [],
    gaps: [],
    stale_ranges: [],
    failed_ranges: [],
};
const datasets: SyncCoverageDataset[] = [
    { ...baseDataset, dataset_key: "git" },
    { ...baseDataset, dataset_key: "work-items" },
    { ...baseDataset, dataset_key: "work-item-comments" },
];
const sources: SyncCoverageSource[] = [
    {
        source_id: "src-api",
        source_name: "acme/api",
        status: "healthy",
        covered_through: null,
        gap_count: 0,
        failed_range_count: 0,
    },
    {
        source_id: "src-web",
        source_name: "acme/web",
        status: "healthy",
        covered_through: null,
        gap_count: 0,
        failed_range_count: 0,
    },
];

function renderWizard(props: Partial<React.ComponentProps<typeof BackfillWizard>> = {}) {
    return render(
        <BackfillWizard
            configId="cfg-1"
            onCloseAction={vi.fn()}
            datasets={datasets}
            sources={sources}
            {...props}
        />,
    );
}

async function fillRange(
    user: ReturnType<typeof userEvent.setup>,
    since = "2026-06-01",
    before = "2026-06-05",
) {
    await user.type(screen.getByLabelText("Since (inclusive)"), since);
    await user.type(screen.getByLabelText("Before (exclusive)"), before);
}

async function reviewAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Run backfill" }));
}

describe("buildDatasetChoices", () => {
    it("represents the canonical work-item family once while retaining every affected key", () => {
        expect(buildDatasetChoices(datasets)).toEqual([
            { id: "git", label: "Git Data (Commits, Branches)", datasetKeys: ["git"] },
            {
                id: "work-items",
                label: "Work items (canonical family)",
                datasetKeys: ["work-items", "work-item-comments"],
            },
        ]);
    });
});

describe("BackfillWizard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        triggerBackfill.mockResolvedValue({
            data: { status: "accepted", sync_run_id: "run-42", total_units: 2 },
        });
    });

    it("submits a date-only scope as the exact nested selector without legacy flat fields", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user);
        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledWith("cfg-1", {
            since: "2026-06-01T00:00:00.000Z",
            before: "2026-06-05T00:00:00.000Z",
        });
        expect(await screen.findByRole("link", { name: "View run" })).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg-1/runs/run-42",
        );
    });

    it("submits a repository-only focused selector", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific sources/ }));
        await user.click(screen.getByLabelText("acme/web"));
        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            expect.objectContaining({
                source_ids: ["src-web"],
            }),
        );
        expect(triggerBackfill.mock.calls[0]?.[1]).not.toHaveProperty("dataset_keys");
    });

    it("submits a unit-only selector and expands the canonical family to its affected datasets", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific datasets/ }));
        await user.click(screen.getByRole("checkbox", { name: /Work items \(canonical family\)/ }));
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByText(/Canonical work-item family affects:/)).toHaveTextContent(
            "Work Items (Issues, Tickets), work item comments",
        );
        await user.click(screen.getByRole("button", { name: "Run backfill" }));
        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            expect.objectContaining({
                dataset_keys: ["work-items", "work-item-comments"],
            }),
        );
    });

    it("submits combined source and dataset scope without broadening either dimension", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific sources/ }));
        await user.click(screen.getByLabelText("acme/api"));
        await user.click(screen.getByRole("radio", { name: /Choose specific datasets/ }));
        await user.click(screen.getByLabelText("Git Data (Commits, Branches)"));
        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledWith("cfg-1", {
            since: "2026-06-01T00:00:00.000Z",
            before: "2026-06-05T00:00:00.000Z",
            source_ids: ["src-api"],
            dataset_keys: ["git"],
        });
    });

    it("rejects an empty focused selection before review instead of silently widening it", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific sources/ }));

        expect(screen.getByRole("alert")).toHaveTextContent("Choose at least one item");
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        expect(triggerBackfill).not.toHaveBeenCalled();
    });

    it("does not render or submit identities absent from authoritative page data", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific sources/ }));

        expect(screen.queryByText("foreign/repo")).not.toBeInTheDocument();
        expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    it("blocks an invalid exclusive window", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user, "2026-06-05", "2026-06-05");

        expect(screen.getByRole("alert")).toHaveTextContent("exclusive boundary");
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("retains expensive-range confirmation for a focused final scope", async () => {
        const user = userEvent.setup();
        renderWizard();
        await fillRange(user, "2026-01-01", "2026-12-01");
        await user.click(screen.getByRole("radio", { name: /Choose specific sources/ }));
        await user.click(screen.getByLabelText("acme/api"));
        await user.click(screen.getByRole("button", { name: "Continue" }));

        const submit = screen.getByRole("button", { name: "Run backfill" });
        expect(submit).toBeDisabled();
        await user.click(
            screen.getByRole("checkbox", { name: /understand this is a large backfill/i }),
        );
        expect(submit).toBeEnabled();
    });

    it("keeps the test-mode journey local", async () => {
        const user = userEvent.setup();
        renderWizard({ testMode: true });
        await fillRange(user);
        await reviewAndSubmit(user);
        expect(triggerBackfill).not.toHaveBeenCalled();
        expect(
            await screen.findByText(/Backfill started for the reviewed scope/),
        ).toBeInTheDocument();
    });

    it("moves focus into the dialog and closes from Escape", async () => {
        const onCloseAction = vi.fn();
        renderWizard({ onCloseAction });
        expect(screen.getByRole("dialog")).toHaveFocus();
        await userEvent.keyboard("{Escape}");
        expect(onCloseAction).toHaveBeenCalledOnce();
    });
});

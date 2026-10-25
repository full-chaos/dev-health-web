import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
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
    await user.click(screen.getByRole("button", { name: /^Run (backfill|\d+ backfills)$/ }));
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

    it("drops a not_enabled dataset instead of offering a guaranteed-refused scope", () => {
        const choices = buildDatasetChoices([
            { ...baseDataset, dataset_key: "git" },
            { ...baseDataset, dataset_key: "prs", status: "not_enabled" },
        ]);

        expect(choices).toEqual([
            { id: "git", label: "Git Data (Commits, Branches)", datasetKeys: ["git"] },
        ]);
    });

    it("omits the work-item family choice entirely when every alias is not_enabled", () => {
        const choices = buildDatasetChoices([
            { ...baseDataset, dataset_key: "git" },
            { ...baseDataset, dataset_key: "work-items", status: "not_enabled" },
            { ...baseDataset, dataset_key: "work-item-labels", status: "not_enabled" },
            { ...baseDataset, dataset_key: "work-item-projects", status: "not_enabled" },
            { ...baseDataset, dataset_key: "work-item-history", status: "not_enabled" },
            { ...baseDataset, dataset_key: "work-item-comments", status: "not_enabled" },
        ]);

        expect(choices).toEqual([
            { id: "git", label: "Git Data (Commits, Branches)", datasetKeys: ["git"] },
        ]);
    });

    it("keeps only the enabled members of a partially enabled work-item family", () => {
        const choices = buildDatasetChoices([
            { ...baseDataset, dataset_key: "work-items" },
            { ...baseDataset, dataset_key: "work-item-labels", status: "not_enabled" },
            { ...baseDataset, dataset_key: "work-item-comments" },
        ]);

        expect(choices).toEqual([
            {
                id: "work-items",
                label: "Work items (canonical family)",
                datasetKeys: ["work-items", "work-item-comments"],
            },
        ]);
    });

    it("drops a not_enabled member from a stale server-suggested work-item scope", () => {
        const datasetsUnderTest: SyncCoverageDataset[] = [
            { ...baseDataset, dataset_key: "git" },
            { ...baseDataset, dataset_key: "work-items" },
            { ...baseDataset, dataset_key: "work-item-labels" },
            { ...baseDataset, dataset_key: "work-item-comments", status: "not_enabled" },
        ];
        // The suggestion still names the disabled alias; the current inventory wins.
        const choices = buildDatasetChoices(datasetsUnderTest, [
            "work-items",
            "work-item-comments",
        ]);

        expect(choices[0]).toEqual({
            id: "server-scoped-work-items",
            label: "Suggested work-item datasets",
            datasetKeys: ["work-items"],
        });
        expect(choices.flatMap((choice) => choice.datasetKeys)).not.toContain("work-item-comments");
    });

    it("offers no suggested scope at all once every suggested key is not_enabled", () => {
        const choices = buildDatasetChoices(
            [
                { ...baseDataset, dataset_key: "git" },
                { ...baseDataset, dataset_key: "work-items", status: "not_enabled" },
            ],
            ["work-items"],
        );

        expect(choices.some((choice) => choice.id === "server-scoped-work-items")).toBe(false);
        expect(choices).toEqual([
            { id: "git", label: "Git Data (Commits, Branches)", datasetKeys: ["git"] },
        ]);
    });

    it("keeps a suggested key the current inventory does not mention at all", () => {
        const choices = buildDatasetChoices(
            [{ ...baseDataset, dataset_key: "git" }],
            ["work-item-labels"],
        );

        expect(choices[0]).toEqual({
            id: "server-scoped-work-items",
            label: "Suggested work-item datasets",
            datasetKeys: ["work-item-labels"],
        });
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

        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            { since: "2026-06-01T00:00:00.000Z", before: "2026-06-05T00:00:00.000Z" },
            expect.any(String),
        );
        expect(await screen.findByRole("link", { name: "View run" })).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg-1/runs/run-42",
        );
    });

    it("preserves a server-selected child dataset without broadening the work-item family", async () => {
        const user = userEvent.setup();
        const window = {
            since: "2026-06-10T00:00:00Z",
            before: "2026-06-12T00:00:00Z",
            source_ids: ["src-web"],
            dataset_keys: ["work-item-comments"],
            reasons: ["gap"] as const,
        };
        renderWizard({ initialWindow: window, suggestedWindows: [window] });

        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("2026-06-10");
        expect(screen.getByLabelText("Before (exclusive)")).toHaveValue("2026-06-12");
        expect(screen.getByLabelText("acme/web")).toBeChecked();
        expect(screen.getByLabelText("Suggested work-item datasets")).toBeChecked();

        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            {
                since: "2026-06-10T00:00:00Z",
                before: "2026-06-12T00:00:00Z",
                source_ids: ["src-web"],
                dataset_keys: ["work-item-comments"],
            },
            expect.any(String),
        );
    });

    it("blocks a stale exact window that mixes an enabled and a not_enabled dataset key", async () => {
        // An exact window is echoed to the server verbatim, so it must never be
        // submitted once the inventory disagrees with it. A window naming both
        // an enabled and a disabled key cannot be satisfied by any remaining
        // choice, so the wizard refuses to continue rather than silently
        // narrowing a server-authorized selector.
        const window = {
            since: "2026-06-10T00:00:00Z",
            before: "2026-06-12T00:00:00Z",
            source_ids: ["src-web"],
            dataset_keys: ["work-items", "work-item-comments"],
            reasons: ["gap"] as const,
        };
        renderWizard({
            initialWindows: [window],
            suggestedWindows: [window],
            datasets: [
                { ...baseDataset, dataset_key: "git" },
                { ...baseDataset, dataset_key: "work-items" },
                { ...baseDataset, dataset_key: "work-item-comments", status: "not_enabled" },
            ],
        });

        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        expect(triggerBackfill).not.toHaveBeenCalled();
    });

    it("selects multiple exact suggestions and submits each selector without merging scope", async () => {
        const user = userEvent.setup();
        const firstWindow = {
            since: "2026-06-01T05:30:00Z",
            before: "2026-06-02T05:30:00Z",
            source_ids: ["src-api"],
            dataset_keys: ["git"],
            reasons: ["gap"] as const,
        };
        const secondWindow = {
            since: "2026-06-10T00:00:00Z",
            before: "2026-06-12T00:00:00Z",
            source_ids: ["src-web"],
            dataset_keys: ["work-item-comments"],
            reasons: ["gap"] as const,
        };
        renderWizard({ suggestedWindows: [firstWindow, secondWindow] });

        await user.click(
            screen.getByRole("checkbox", {
                // 05:30Z boundaries: the label discloses the time so an
                // off-midnight window is not mistaken for a whole-day one.
                name: "2026-06-01 05:30Z to 2026-06-02 05:30Z · git",
            }),
        );
        await user.click(
            screen.getByRole("checkbox", {
                name: "2026-06-10 to 2026-06-12 · work-item-comments",
            }),
        );

        expect(screen.getByRole("status")).toHaveTextContent("2 exact windows selected");

        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledTimes(2);
        expect(triggerBackfill).toHaveBeenNthCalledWith(
            1,
            "cfg-1",
            {
                since: "2026-06-01T05:30:00Z",
                before: "2026-06-02T05:30:00Z",
                source_ids: ["src-api"],
                dataset_keys: ["git"],
            },
            expect.any(String),
        );
        expect(triggerBackfill).toHaveBeenNthCalledWith(
            2,
            "cfg-1",
            {
                since: "2026-06-10T00:00:00Z",
                before: "2026-06-12T00:00:00Z",
                source_ids: ["src-web"],
                dataset_keys: ["work-item-comments"],
            },
            expect.any(String),
        );
        expect(await screen.findByText(/^2 backfills started/)).toBeInTheDocument();
    });

    it("auto-selects every source and dataset carried by one exact suggestion", async () => {
        const user = userEvent.setup();
        const window = {
            since: "2026-06-10T00:00:00Z",
            before: "2026-06-12T00:00:00Z",
            source_ids: ["src-api", "src-web"],
            dataset_keys: ["git", "work-item-comments"],
            reasons: ["gap"] as const,
        };
        renderWizard({ suggestedWindows: [window] });

        await user.click(
            screen.getByRole("checkbox", {
                name: "2026-06-10 to 2026-06-12 · git, work-item-comments",
            }),
        );

        expect(screen.getByLabelText("Since (inclusive)")).toHaveValue("2026-06-10");
        expect(screen.getByLabelText("Before (exclusive)")).toHaveValue("2026-06-12");
        expect(screen.getByLabelText("acme/api")).toBeChecked();
        expect(screen.getByLabelText("acme/web")).toBeChecked();
        expect(screen.getByLabelText("Git Data (Commits, Branches)")).toBeChecked();
        expect(screen.getByLabelText("Suggested work-item datasets")).toBeChecked();
    });

    it("reports each exact window when only part of a batch starts", async () => {
        const user = userEvent.setup();
        const windows = [
            {
                since: "2026-06-01T00:00:00Z",
                before: "2026-06-02T00:00:00Z",
                source_ids: ["src-api"],
                dataset_keys: ["git"],
                reasons: ["gap"] as const,
            },
            {
                since: "2026-06-10T00:00:00Z",
                before: "2026-06-12T00:00:00Z",
                source_ids: ["src-web"],
                dataset_keys: ["work-item-comments"],
                reasons: ["failed"] as const,
            },
        ];
        triggerBackfill
            .mockResolvedValueOnce({ data: { status: "accepted", sync_run_id: "run-1" } })
            .mockResolvedValueOnce({ error: "Source is already running", status: 409 });
        renderWizard({ initialWindows: windows, suggestedWindows: windows });

        await reviewAndSubmit(user);

        expect(await screen.findByText(/^1 backfill started; 1 failed/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View run" })).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg-1/runs/run-1",
        );
        expect(screen.getByRole("alert")).toHaveTextContent("Source is already running");
        // a refusal (409) is final: the refused window is not retried either
        expect(triggerBackfill).toHaveBeenCalledTimes(2);
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
            expect.any(String),
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
            expect.any(String),
        );
    });

    it("never offers the work-item family when the whole family is not_enabled", async () => {
        const user = userEvent.setup();
        renderWizard({
            datasets: [
                { ...baseDataset, dataset_key: "git" },
                { ...baseDataset, dataset_key: "work-items", status: "not_enabled" },
                { ...baseDataset, dataset_key: "work-item-comments", status: "not_enabled" },
            ],
        });
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific datasets/ }));

        expect(
            screen.queryByRole("checkbox", { name: /Work items \(canonical family\)/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText("Git Data (Commits, Branches)")).toBeInTheDocument();
    });

    it("never submits a not_enabled key from a partially enabled work-item family", async () => {
        const user = userEvent.setup();
        renderWizard({
            datasets: [
                { ...baseDataset, dataset_key: "git" },
                { ...baseDataset, dataset_key: "work-items" },
                { ...baseDataset, dataset_key: "work-item-comments", status: "not_enabled" },
            ],
        });
        await fillRange(user);
        await user.click(screen.getByRole("radio", { name: /Choose specific datasets/ }));
        await user.click(screen.getByRole("checkbox", { name: /Work items \(canonical family\)/ }));
        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            expect.objectContaining({ dataset_keys: ["work-items"] }),
            expect.any(String),
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

        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            {
                since: "2026-06-01T00:00:00.000Z",
                before: "2026-06-05T00:00:00.000Z",
                source_ids: ["src-api"],
                dataset_keys: ["git"],
            },
            expect.any(String),
        );
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

describe("BackfillWizard server-window timezone handling", () => {
    beforeEach(() => {
        triggerBackfill.mockReset();
        triggerBackfill.mockResolvedValue({ data: { status: "accepted", sync_run_id: "run-1" } });
    });

    // The stored shapes below are verbatim from a live version-1
    // sync_coverage_projections payload. Ops now always emits an offset, but
    // web is deployed independently and must not hand the backfill endpoint a
    // naive value, which it rejects as `timezone_aware` with a 422.
    it.each([
        {
            label: "bare calendar dates",
            since: "2026-08-08",
            before: "2026-08-13",
            sentSince: "2026-08-08T00:00:00.000Z",
            sentBefore: "2026-08-13T00:00:00.000Z",
        },
        {
            label: "offset-less instants",
            since: "2026-08-08T00:00:00",
            before: "2026-08-13T00:00:00",
            sentSince: "2026-08-08T00:00:00Z",
            sentBefore: "2026-08-13T00:00:00Z",
        },
    ])(
        "sends an offset-bearing selector for $label",
        async ({ since, before, sentSince, sentBefore }) => {
            const user = userEvent.setup();
            const window = { since, before, reasons: ["failed", "gap"] as const };
            renderWizard({ initialWindows: [window], suggestedWindows: [window] });

            await reviewAndSubmit(user);

            expect(triggerBackfill).toHaveBeenCalledWith(
                "cfg-1",
                {
                    since: sentSince,
                    before: sentBefore,
                },
                expect.any(String),
            );
            // Both forms must satisfy the endpoint's AwareDatetime selector.
            expect(sentSince).toMatch(/(?:Z|[+-]\d{2}:?\d{2})$/);
            expect(sentBefore).toMatch(/(?:Z|[+-]\d{2}:?\d{2})$/);
        },
    );

    it("leaves an already-aware boundary byte-identical", async () => {
        const user = userEvent.setup();
        const window = {
            since: "2026-08-08T00:00:00+00:00",
            before: "2026-08-13T00:00:00Z",
            reasons: ["gap"] as const,
        };
        renderWizard({ initialWindows: [window], suggestedWindows: [window] });

        await reviewAndSubmit(user);

        expect(triggerBackfill).toHaveBeenCalledWith(
            "cfg-1",
            {
                since: "2026-08-08T00:00:00+00:00",
                before: "2026-08-13T00:00:00Z",
            },
            expect.any(String),
        );
    });

    it("keeps the time on an intra-day window so it does not read as zero-width", async () => {
        // Real gaps start whenever a sync ran, so a suggested window can sit
        // inside one day. Date-only rendering would print the same date twice.
        const window = {
            since: "2026-08-08T02:46:06.501450Z",
            before: "2026-08-08T05:00:00Z",
            dataset_keys: ["git"],
            reasons: ["gap"] as const,
        };
        renderWizard({ initialWindows: [window], suggestedWindows: [window] });

        expect(
            screen.getByText(/2026-08-08 02:46Z to 2026-08-08 05:00Z · git/),
        ).toBeInTheDocument();
    });

    it("omits the time when both boundaries are UTC midnight", async () => {
        const window = {
            since: "2026-08-08T00:00:00Z",
            before: "2026-08-13T00:00:00Z",
            dataset_keys: ["git"],
            reasons: ["gap"] as const,
        };
        renderWizard({ initialWindows: [window], suggestedWindows: [window] });

        expect(screen.getByText(/2026-08-08 to 2026-08-13 · git/)).toBeInTheDocument();
    });

    it("labels an empty dataset scope without a dangling separator", async () => {
        const window = {
            since: "2026-08-08T00:00:00Z",
            before: "2026-08-13T00:00:00Z",
            source_ids: [],
            dataset_keys: [],
            reasons: ["gap"] as const,
        };
        renderWizard({ initialWindows: [window], suggestedWindows: [window] });

        expect(screen.getByText(/2026-08-08 to 2026-08-13 · all datasets/)).toBeInTheDocument();
    });

    describe("fast submit (accepted without a run)", () => {
        const twoWindows = () => {
            const first = {
                since: "2026-06-01T00:00:00Z",
                before: "2026-06-02T00:00:00Z",
                source_ids: ["src-api"],
                dataset_keys: ["git"],
                reasons: ["gap"] as const,
            };
            const second = {
                since: "2026-06-10T00:00:00Z",
                before: "2026-06-12T00:00:00Z",
                source_ids: ["src-web"],
                dataset_keys: ["work-item-comments"],
                reasons: ["gap"] as const,
            };
            return [first, second];
        };
        const selectBoth = async (user: ReturnType<typeof userEvent.setup>) => {
            await user.click(
                screen.getByRole("checkbox", { name: "2026-06-01 to 2026-06-02 · git" }),
            );
            await user.click(
                screen.getByRole("checkbox", {
                    name: "2026-06-10 to 2026-06-12 · work-item-comments",
                }),
            );
        };

        it("links an accepted job to the config page, with no run link and no run id needed", async () => {
            triggerBackfill.mockResolvedValue({
                data: {
                    status: "accepted",
                    backfill_job_id: "job-7",
                    occurrence_id: "occ-7",
                    task_id: "occurrence:occ-7",
                },
            });
            const user = userEvent.setup();
            renderWizard();
            await fillRange(user);
            await reviewAndSubmit(user);

            expect(await screen.findByText(/job-7/)).toBeInTheDocument();
            expect(screen.queryByRole("link", { name: "View run" })).not.toBeInTheDocument();
            expect(screen.getByRole("link", { name: "View backfill progress" })).toHaveAttribute(
                "href",
                "/org/admin/sync/cfg-1",
            );
        });

        it("sends one stable Idempotency-Key per window: distinct across windows, shared prefix per action", async () => {
            triggerBackfill.mockResolvedValue({
                data: { status: "accepted", backfill_job_id: "job-1", occurrence_id: "occ-1" },
            });
            const user = userEvent.setup();
            const [first, second] = twoWindows();
            renderWizard({ suggestedWindows: [first, second] });
            await selectBoth(user);
            await reviewAndSubmit(user);

            const keys = triggerBackfill.mock.calls.map((call) => call[2] as string);
            expect(keys).toHaveLength(2);
            expect(keys[0]).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
            expect(keys[1]).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
            expect(keys[0]).not.toBe(keys[1]);
        });

        it("retries a thrown submit once with the SAME key, never with a new one", async () => {
            triggerBackfill.mockRejectedValueOnce(new Error("network")).mockResolvedValue({
                data: { status: "accepted", backfill_job_id: "job-1", occurrence_id: "occ-1" },
            });
            const user = userEvent.setup();
            renderWizard();
            await fillRange(user);
            await reviewAndSubmit(user);

            expect(await screen.findByText(/job-1/)).toBeInTheDocument();
            expect(triggerBackfill).toHaveBeenCalledTimes(2);
            expect(triggerBackfill.mock.calls[1]?.[2]).toBe(triggerBackfill.mock.calls[0]?.[2]);
        });

        it("retries a transient ops failure (a 503 error RESULT, not a throw) once with the SAME key", async () => {
            triggerBackfill
                .mockResolvedValueOnce({
                    error: "The change was not saved. Try again.",
                    status: 503,
                })
                .mockResolvedValue({
                    data: { status: "accepted", backfill_job_id: "job-2", occurrence_id: "occ-2" },
                });
            const user = userEvent.setup();
            renderWizard();
            await fillRange(user);
            await reviewAndSubmit(user);

            expect(await screen.findByText(/job-2/)).toBeInTheDocument();
            expect(triggerBackfill).toHaveBeenCalledTimes(2);
            expect(triggerBackfill.mock.calls[1]?.[2]).toBe(triggerBackfill.mock.calls[0]?.[2]);
        });

        it("retries an error result with no HTTP status (network, deadline) once with the same key", async () => {
            triggerBackfill
                .mockResolvedValueOnce({ error: "The change timed out." })
                .mockResolvedValue({
                    data: { status: "accepted", backfill_job_id: "job-3", occurrence_id: "occ-3" },
                });
            const user = userEvent.setup();
            renderWizard();
            await fillRange(user);
            await reviewAndSubmit(user);

            expect(await screen.findByText(/job-3/)).toBeInTheDocument();
            expect(triggerBackfill).toHaveBeenCalledTimes(2);
            expect(triggerBackfill.mock.calls[1]?.[2]).toBe(triggerBackfill.mock.calls[0]?.[2]);
        });

        it.each([408, 429, 500, 503])(
            "a persistent transient failure (%i) is retried once only, and shows the error",
            async (status) => {
                triggerBackfill.mockResolvedValue({ error: "Backfill unavailable", status });
                const user = userEvent.setup();
                renderWizard();
                await fillRange(user);
                await reviewAndSubmit(user);

                expect(await screen.findByText("Backfill unavailable")).toBeInTheDocument();
                expect(triggerBackfill).toHaveBeenCalledTimes(2);
            },
        );

        it.each([400, 401, 403, 404, 409, 422])(
            "a %i refusal is final: one call, the error shown at once",
            async (status) => {
                triggerBackfill.mockResolvedValue({ error: "Backfill refused", status });
                const user = userEvent.setup();
                renderWizard();
                await fillRange(user);
                await reviewAndSubmit(user);

                expect(await screen.findByText("Backfill refused")).toBeInTheDocument();
                expect(triggerBackfill).toHaveBeenCalledTimes(1);
            },
        );

        it("a new user action after a failure sends a new key", async () => {
            triggerBackfill.mockResolvedValue({ error: "Backfill refused", status: 422 });
            const first = renderWizard();
            const user = userEvent.setup();
            await fillRange(user);
            await reviewAndSubmit(user);
            expect(await screen.findByText("Backfill refused")).toBeInTheDocument();
            const firstKey = triggerBackfill.mock.calls[0]?.[2];
            first.unmount();
            triggerBackfill.mockClear();

            renderWizard();
            await fillRange(user);
            await reviewAndSubmit(user);
            expect(await screen.findByText("Backfill refused")).toBeInTheDocument();
            const secondKey = triggerBackfill.mock.calls[0]?.[2];
            expect(typeof firstKey).toBe("string");
            expect(typeof secondKey).toBe("string");
            expect(secondKey).not.toBe(firstKey);
        });

        it("ignores a second press made before the first submit settles", async () => {
            let release: (() => void) | undefined;
            triggerBackfill.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        release = () =>
                            resolve({
                                data: {
                                    status: "accepted",
                                    backfill_job_id: "job-9",
                                    occurrence_id: "occ-9",
                                },
                            });
                    }),
            );
            const user = userEvent.setup();
            renderWizard();
            await fillRange(user);
            await user.click(screen.getByRole("button", { name: "Continue" }));
            const run = screen.getByRole("button", { name: /^Run (backfill|\d+ backfills)$/ });
            // Two clicks in the same tick, before React can disable the button.
            act(() => {
                run.click();
                run.click();
            });

            await vi.waitFor(() => expect(release).toBeDefined());
            expect(triggerBackfill).toHaveBeenCalledTimes(1);
            release?.();
            expect(await screen.findByText(/job-9/)).toBeInTheDocument();
            expect(triggerBackfill).toHaveBeenCalledTimes(1);
        });

        it("never has two submits of the config in flight, and ignores a second press while one runs", async () => {
            let inFlight = 0;
            let maxInFlight = 0;
            const release: Array<() => void> = [];
            triggerBackfill.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        inFlight += 1;
                        maxInFlight = Math.max(maxInFlight, inFlight);
                        release.push(() => {
                            inFlight -= 1;
                            resolve({
                                data: {
                                    status: "accepted",
                                    backfill_job_id: "job-1",
                                    occurrence_id: "occ-1",
                                },
                            });
                        });
                    }),
            );
            const user = userEvent.setup();
            const [first, second] = twoWindows();
            renderWizard({ suggestedWindows: [first, second] });
            await selectBoth(user);
            await reviewAndSubmit(user);

            await vi.waitFor(() => expect(release).toHaveLength(1));
            expect(triggerBackfill).toHaveBeenCalledTimes(1);
            release[0]?.();
            await vi.waitFor(() => expect(release).toHaveLength(2));
            release[1]?.();
            expect(await screen.findByText(/^2 backfills started/)).toBeInTheDocument();
            expect(maxInFlight).toBe(1);
            expect(triggerBackfill).toHaveBeenCalledTimes(2);
        });
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, userEvent, within } from "@/test/utils";
import { SyncRunDetailLive } from "./SyncRunDetailLive";
import {
    SAMPLE_SYNC_RUN,
    SAMPLE_SYNC_RUN_DATASET_FRESHNESS,
    SAMPLE_SYNC_RUN_UNIT_SUMMARY,
    SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS,
    SAMPLE_BUDGET_BLOCKED_UNIT,
    SAMPLE_BUDGET_EXHAUSTED_UNIT,
    SAMPLE_DEFERRALS_EXHAUSTED_UNIT,
} from "@/data/syncRunDetailSample";
import { getSyncRunStatus, getSyncRunUnits } from "@/lib/admin/server";
import type { SyncRunUnitSummary } from "@/lib/admin/types";

// The detail component imports the admin server actions for its manual
// Refresh control (CHAOS-4318: no more timer-driven polling). The real
// module pulls in next-auth (which fails to resolve next/server under
// vitest), and test-mode never invokes them, so stub them out at module load.
vi.mock("@/lib/admin/server", () => ({
    getSyncRunStatus: vi.fn(),
    getSyncRunUnits: vi.fn(),
}));

function renderDetail() {
    return render(
        <SyncRunDetailLive
            initialRun={SAMPLE_SYNC_RUN}
            initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
            testMode
        />,
    );
}

describe("SyncRunDetailLive", () => {
    it("labels a non-terminal run with settled failures as running with failures", () => {
        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "running" }}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
                testMode
            />,
        );

        expect(screen.getAllByText("Running with failures").length).toBeGreaterThan(0);
        expect(screen.getByText("1 unit failed; 1 unit is still processing.")).toBeInTheDocument();
        expect(screen.queryByText(/^running$/)).not.toBeInTheDocument();
    });

    it("labels a terminal mixed result as completed with failures", () => {
        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "partial_failed" }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { success: 3, failed: 1 },
                    units: SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.map((unit) => ({
                        ...unit,
                        status: unit.status === "failed" ? "failed" : "success",
                    })),
                }}
                testMode
            />,
        );

        expect(screen.getAllByText("Completed with failures").length).toBeGreaterThan(0);
        expect(screen.getByText("Run complete")).toBeInTheDocument();
    });

    it("groups repeated failures, includes provider-capacity waits, and translates machine codes", () => {
        const baseUnit = SAMPLE_SYNC_RUN_UNIT_SUMMARY.units[0];
        const failedUnits = Array.from({ length: 3 }, (_, index) => ({
            ...baseUnit,
            id: `feature-flag-failure-${index}`,
            source_id: index === 2 ? "source-b" : "source-a",
            source_full_name: index === 2 ? "fullchaos/chaos-ops" : "fullchaos/dev-health-ops",
            dataset_key: "feature-flags",
            status: "failed",
            error: "provider_unit_exhausted",
            error_category: "provider_unit_exhausted",
        }));
        const waitingUnit = {
            ...baseUnit,
            id: "cicd-capacity-wait",
            source_id: "source-c",
            source_full_name: "fullchaos/dev-health-web",
            dataset_key: "cicd",
            status: "dispatching",
            error: "provider_budget_contention",
            error_category: "provider_budget_contention",
        };

        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    status: "running",
                    total_units: 4,
                    completed_units: 0,
                    failed_units: 3,
                }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { failed: 3, dispatching: 1 },
                    failed_unit_count: 3,
                    failed_unit_ids: failedUnits.map((unit) => unit.id),
                    unit_count: 4,
                    units: [...failedUnits, waitingUnit],
                }}
                testMode
            />,
        );

        const attention = screen.getByRole("region", { name: "Needs attention" });
        expect(within(attention).getAllByText("Provider retries exhausted")).toHaveLength(1);
        expect(within(attention).getByText("3 failed units · 2 sources")).toBeInTheDocument();
        expect(within(attention).getByText("Waiting for provider capacity")).toBeInTheDocument();
        expect(within(attention).getByText("1 waiting unit · 1 source")).toBeInTheDocument();
        expect(within(attention).queryByText(/deferrals?/)).not.toBeInTheDocument();
        expect(screen.queryByText("provider_unit_exhausted")).not.toBeInTheDocument();
        expect(screen.queryByText("provider_budget_contention")).not.toBeInTheDocument();
    });

    it("preserves every distinct retry window with its sources and does not schedule terminal failures", () => {
        const baseUnit = SAMPLE_SYNC_RUN_UNIT_SUMMARY.units[0];
        const retryingUnits = [
            {
                ...baseUnit,
                id: "tests-retry-one",
                source_id: "source-a",
                source_full_name: "fullchaos/dev-health-acr",
                dataset_key: "tests",
                status: "retrying",
                error: "provider_unit_retryable",
                error_category: "provider_unit_retryable",
                available_at: "2026-08-13T18:00:00Z",
            },
            {
                ...baseUnit,
                id: "tests-retry-two",
                source_id: "source-b",
                source_full_name: "fullchaos/dev-health-web",
                dataset_key: "tests",
                status: "retrying",
                error: "provider_unit_retryable",
                error_category: "provider_unit_retryable",
                available_at: "2026-08-13T18:05:00Z",
            },
        ];
        const failedUnit = {
            ...baseUnit,
            id: "cicd-terminal-failure",
            source_id: "source-c",
            source_full_name: "fullchaos/dev-health-ops",
            dataset_key: "cicd",
            status: "failed",
            error: "provider_unit_exhausted",
            error_category: "provider_unit_exhausted",
            available_at: "2026-08-13T18:10:00Z",
        };

        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "running", total_units: 3 }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { retrying: 2, failed: 1 },
                    failed_unit_count: 1,
                    failed_unit_ids: [failedUnit.id],
                    unit_count: 3,
                    units: [...retryingUnits, failedUnit],
                }}
                testMode
            />,
        );

        const retrySchedule = screen.getByRole("list", {
            name: "Provider request will retry retry schedule",
        });
        const retryWindows = within(retrySchedule).getAllByRole("listitem");
        expect(retryWindows).toHaveLength(2);
        expect(retryWindows[0]).toHaveTextContent("fullchaos/dev-health-acr");
        expect(retryWindows[1]).toHaveTextContent("fullchaos/dev-health-web");
        expect(
            screen.queryByRole("list", { name: "Provider retries exhausted retry schedule" }),
        ).not.toBeInTheDocument();
    });

    it("humanizes an unknown machine error code instead of exposing snake case", () => {
        const failedUnit = {
            ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units[0],
            id: "unknown-error-unit",
            status: "failed",
            error: "custom_provider_fault",
            error_category: "custom_provider_fault",
        };

        render(
            <SyncRunDetailLive
                initialRun={{ ...SAMPLE_SYNC_RUN, status: "failed", total_units: 1 }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { failed: 1 },
                    failed_unit_count: 1,
                    failed_unit_ids: [failedUnit.id],
                    unit_count: 1,
                    units: [failedUnit],
                }}
                testMode
            />,
        );

        expect(screen.getAllByText("Custom provider fault").length).toBeGreaterThan(0);
        expect(screen.queryByText("custom_provider_fault")).not.toBeInTheDocument();
    });

    it("renders overall progress and unit status counts", () => {
        renderDetail();

        // completed (2) + failed (1) = 3 of 4 settled → 75%
        expect(screen.getByText(/3 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/75%/)).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Overall sync progress" })).toHaveAttribute(
            "aria-valuenow",
            "75",
        );

        // Status rollup labels from by_status.
        expect(screen.getByText("Unit status")).toBeInTheDocument();
        expect(screen.getAllByText("retrying").length).toBeGreaterThan(0);
        expect(screen.getAllByText("failed").length).toBeGreaterThan(0);

        // Unit count header reflects the summary.
        expect(screen.getByText(/Units \(4\)/)).toBeInTheDocument();
    });

    it("uses unit rollups for progress when run counters are stale", () => {
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    status: "dispatching",
                    total_units: 4,
                    completed_units: 0,
                    failed_units: 0,
                }}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
                testMode
            />,
        );

        expect(screen.getByText(/3 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/75%/)).toBeInTheDocument();
        expect(screen.getAllByText("Running with failures").length).toBeGreaterThan(0);
        const progressCard = screen.getByText("Overall progress").closest(".rounded-xl");
        expect(progressCard).toBeInstanceOf(HTMLElement);
        if (!(progressCard instanceof HTMLElement)) return;
        expect(within(progressCard).getByText("2")).toBeInTheDocument();
        expect(within(progressCard).getByText("1")).toBeInTheDocument();
    });

    it("uses unit rows over a stale terminal run status", () => {
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    status: "success",
                    total_units: 4,
                    completed_units: 4,
                    failed_units: 0,
                }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { success: 1, running: 3 },
                    unit_count: 4,
                    units: SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.map((unit, index) => ({
                        ...unit,
                        status: index === 0 ? "success" : "running",
                    })),
                }}
                testMode
            />,
        );

        expect(screen.getByText(/1 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/25%/)).toBeInTheDocument();
        const headerCard = screen.getAllByText("Status")[0]?.closest(".rounded-xl");
        expect(headerCard).toBeInstanceOf(HTMLElement);
        if (!(headerCard instanceof HTMLElement)) return;
        expect(within(headerCard).getAllByText("Running").length).toBeGreaterThan(0);
    });

    it("renders resolved source NAMES and never the raw source id", () => {
        renderDetail();

        expect(screen.getAllByText("fullchaos/platform-api").length).toBeGreaterThan(0);
        expect(screen.getAllByText("fullchaos/billing-service").length).toBeGreaterThan(0);

        // Raw source ids must never surface in the UI.
        expect(screen.queryByText("sample-source-1")).not.toBeInTheDocument();
        expect(screen.queryByText("sample-source-2")).not.toBeInTheDocument();
    });

    it("translates failed/retrying categories and preserves useful detail and retry time", () => {
        renderDetail();

        expect(screen.getByText("Needs attention")).toBeInTheDocument();
        expect(screen.getByText(/Next retry/)).toBeInTheDocument();
        expect(screen.getAllByText("Waiting for provider rate limit").length).toBeGreaterThan(0);
        expect(screen.queryByText("rate_limit")).not.toBeInTheDocument();
        expect(
            screen.getByText("Upstream returned 500 while paginating pull requests"),
        ).toBeInTheDocument();
        expect(screen.getByText("Secondary rate limit hit; backing off")).toBeInTheDocument();
    });

    it("renders a distinct 'Blocked: budget' treatment with deferral count, next attempt, and the rollup chip", () => {
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    total_units: SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS.unit_count,
                }}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS}
                testMode
            />,
        );

        // The table keeps its compact badge while the attention summary uses
        // a human-readable reason.
        expect(screen.getByText("Blocked: budget")).toBeInTheDocument();
        expect(screen.getAllByText("Waiting for sync budget").length).toBeGreaterThan(0);
        // Deferral count + next attempt render from the persisted fields.
        expect(screen.getByText(/6 deferrals/)).toBeInTheDocument();
        expect(screen.getByText(/Next attempt/)).toBeInTheDocument();
        // Summary rollup chip.
        expect(screen.getByText(/Budget blocked: 1/)).toBeInTheDocument();
        // The badge replaces the generic category line for this unit — it is
        // not ALSO rendered as raw "Category: budget_deferred" text.
        expect(screen.queryByText(/Category: budget_deferred/)).not.toBeInTheDocument();
    });

    it("surfaces the actionable error text for a budget_deferral_exhausted unit", () => {
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    total_units: SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS.unit_count,
                }}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS}
                testMode
            />,
        );

        expect(screen.getByText("Budget exhausted")).toBeInTheDocument();
        expect(screen.getAllByText("Sync budget wait limit reached").length).toBeGreaterThan(0);
        expect(
            screen.getAllByText(/Budget deferral cap exceeded for REST_CORE bucket/).length,
        ).toBeGreaterThan(0);
    });

    it("renders the blocked-budget badge without the deferral count or rollup chip when the backend field is absent", () => {
        const { budget_deferrals: _omit, ...unitWithoutCount } = SAMPLE_BUDGET_BLOCKED_UNIT;
        render(
            <SyncRunDetailLive
                initialRun={SAMPLE_SYNC_RUN}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.by_status, retrying: 2 },
                    unit_count: 5,
                    units: [...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, unitWithoutCount],
                }}
                testMode
            />,
        );

        expect(screen.getByText("Blocked: budget")).toBeInTheDocument();
        expect(screen.getAllByText("Waiting for sync budget").length).toBeGreaterThan(0);
        expect(screen.queryByText(/deferral/)).not.toBeInTheDocument();
        expect(screen.getByText(/Next attempt/)).toBeInTheDocument();
        // budget_blocked_unit_count wasn't set on this summary — chip omitted.
        expect(screen.queryByText(/Budget blocked:/)).not.toBeInTheDocument();
    });

    it("keeps the persisted next-attempt timestamp visible for a budget-blocked unit, not just the label", () => {
        // Negative control on codex's "the blocked branch hides retry-at info"
        // claim: the label alone proves nothing — assert the actual formatted
        // clock time renders alongside it (TZ-agnostic: matches the hh:mm AM/PM
        // shape formatTimestamp produces, not a hardcoded date/offset).
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    total_units: SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS.unit_count,
                }}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY_WITH_BUDGET_UNITS}
                testMode
            />,
        );

        const nextAttemptSpan = screen.getByText(/Next attempt/).closest("span");
        expect(nextAttemptSpan).not.toBeNull();
        expect(nextAttemptSpan?.textContent).toMatch(/Next attempt.*\d{1,2}:\d{2}\s*[AP]M/);
    });

    it("does NOT apply the budget-blocked treatment to a retrying unit with a different error_category", () => {
        // Guards key on status AND the exact persisted error_category string —
        // a retrying unit that merely carries some other category (e.g. a
        // stale/unrelated one) must render the pre-existing generic look.
        const nonBudgetRetryingUnit = {
            ...SAMPLE_BUDGET_BLOCKED_UNIT,
            id: "sample-unit-worker-lost",
            error_category: "worker_lost",
            error: "Worker lost heartbeat mid-run",
        };
        render(
            <SyncRunDetailLive
                initialRun={SAMPLE_SYNC_RUN}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.by_status, retrying: 2 },
                    unit_count: 5,
                    units: [...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, nonBudgetRetryingUnit],
                }}
                testMode
            />,
        );

        expect(screen.queryByText("Blocked: budget")).not.toBeInTheDocument();
        expect(screen.getAllByText("Worker stopped responding").length).toBeGreaterThan(0);
    });

    it("does NOT apply the budget-exhausted treatment to a failed unit whose category is the non-terminal budget_deferred", () => {
        // The exhausted badge must key strictly on the terminal category that
        // only the terminalize path stamps — a failed unit that (incorrectly,
        // hypothetically) still carries the non-terminal "budget_deferred"
        // category must never read as exhausted.
        const failedButNotExhausted = {
            ...SAMPLE_BUDGET_EXHAUSTED_UNIT,
            id: "sample-unit-not-exhausted",
            error_category: "budget_deferred",
        };
        render(
            <SyncRunDetailLive
                initialRun={SAMPLE_SYNC_RUN}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.by_status, failed: 2 },
                    failed_unit_count: 2,
                    failed_unit_ids: [
                        ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.failed_unit_ids,
                        failedButNotExhausted.id,
                    ],
                    unit_count: 5,
                    units: [...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, failedButNotExhausted],
                }}
                testMode
            />,
        );

        expect(screen.queryByText("Budget exhausted")).not.toBeInTheDocument();
        expect(screen.getAllByText("Waiting for sync budget").length).toBeGreaterThan(0);
    });

    it("renders a distinct 'Deferrals exhausted' treatment and the actionable error text for error_category=deferral_exhausted", () => {
        // Third terminal category (CHAOS-3412, ops-exhaustion lane): the
        // aggregate deferral cap — a unit that oscillated between budget and
        // rate-limit episodes without ever running. Exact persisted string is
        // "deferral_exhausted" (owned by the ops-exhaustion lane) — do not
        // invent variants.
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    total_units: SAMPLE_SYNC_RUN_UNIT_SUMMARY.unit_count + 1,
                }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.by_status, failed: 2 },
                    failed_unit_count: 2,
                    failed_unit_ids: [
                        ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.failed_unit_ids,
                        SAMPLE_DEFERRALS_EXHAUSTED_UNIT.id,
                    ],
                    unit_count: SAMPLE_SYNC_RUN_UNIT_SUMMARY.unit_count + 1,
                    units: [...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units, SAMPLE_DEFERRALS_EXHAUSTED_UNIT],
                }}
                testMode
            />,
        );

        // The unit table keeps the compact badge while the attention summary
        // explains the persisted machine category.
        expect(screen.getByText("Deferrals exhausted")).toBeInTheDocument();
        expect(screen.getAllByText("Sync deferral limit reached").length).toBeGreaterThan(0);
        // The actionable error text (naming the last episode kind and both
        // counters) surfaces prominently, same path as any failed unit.
        expect(
            screen.getAllByText(/Deferral cap exceeded after oscillating between budget and/)
                .length,
        ).toBeGreaterThan(0);
        // Not mistaken for the other two categories' treatments.
        expect(screen.queryByText("Blocked: budget")).not.toBeInTheDocument();
        expect(screen.queryByText("Budget exhausted")).not.toBeInTheDocument();
    });

    it("renders a row per unit in the unit table", () => {
        renderDetail();

        // Datasets and cost classes from the four sample units appear as cells.
        expect(screen.getAllByText("git").length).toBeGreaterThan(0);
        expect(screen.getAllByText("cicd").length).toBeGreaterThan(0);
        expect(screen.getAllByText("expensive").length).toBeGreaterThan(0);

        // Each unit's status renders as a badge label inside the table.
        expect(screen.getAllByText("success").length).toBeGreaterThan(0);

        // Short unit id prefix is rendered (mono cell), proving table rows exist.
        expect(screen.getAllByText("sample-u").length).toBe(
            SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.length,
        );
    });

    it("renders every returned unit without a client-side table cap", () => {
        const units = Array.from({ length: 201 }, (_, index) => ({
            ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units[0],
            id: `bulk-${String(index).padStart(3, "0")}-unit`,
        }));

        render(
            <SyncRunDetailLive
                initialRun={{
                    ...SAMPLE_SYNC_RUN,
                    total_units: units.length,
                    completed_units: units.length,
                    failed_units: 0,
                }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { success: units.length },
                    unit_count: units.length,
                    units,
                }}
                testMode
            />,
        );

        const table = screen.getByRole("table");
        expect(within(table).getAllByText(/^bulk-\d{3}$/)).toHaveLength(units.length);
        expect(screen.getByText(/Units \(201\)/)).toBeInTheDocument();
        expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
    });

    it("renders since_at/before_at windows per unit", () => {
        renderDetail();

        // All four units share the same run-window upper bound (before_at).
        expect(screen.getAllByText("Jun 26, 2026").length).toBe(
            SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.length,
        );
        // Distinct since_at values per unit (fixed sample story: the failed
        // unit's since_at is earlier than what the successful units covered).
        expect(screen.getByText("Jun 19, 2026")).toBeInTheDocument();
        expect(screen.getByText("Jun 12, 2026")).toBeInTheDocument();
        expect(screen.getByText("Jun 25, 2026")).toBeInTheDocument();
    });

    it("renders the intent-vs-result strip with requested vs covered windows and failed count", () => {
        renderDetail();

        expect(screen.getByText("Intent vs result")).toBeInTheDocument();
        expect(screen.getByText("Requested window")).toBeInTheDocument();
        expect(screen.getByText("Covered window")).toBeInTheDocument();
        // Requested spans the earliest since_at across ALL units — including
        // the failed unit's wider intent (Jun 12) — through the shared
        // run-start before_at.
        expect(screen.getByText("Jun 12, 2026 → Jun 26, 2026")).toBeInTheDocument();
        // Covered spans only the SUCCESSFUL units (Jun 19 onward) — visibly
        // narrower than requested, surfacing the gap the failed unit left.
        expect(screen.getByText("Jun 19, 2026 → Jun 26, 2026")).toBeInTheDocument();
        expect(screen.getByText("(2 units)")).toBeInTheDocument();
        expect(screen.getByText("1 unit")).toBeInTheDocument();
    });

    it("filters the unit table by status", async () => {
        renderDetail();
        const user = userEvent.setup();
        const table = screen.getByRole("table");

        expect(within(table).getAllByText("cicd").length).toBeGreaterThan(0);

        await user.selectOptions(screen.getByLabelText("Status"), "failed");

        expect(within(table).queryByText("cicd")).not.toBeInTheDocument();
        expect(screen.getByText(/Units \(1 of 4\)/)).toBeInTheDocument();
    });

    it("filters the unit table by dataset", async () => {
        renderDetail();
        const user = userEvent.setup();
        const table = screen.getByRole("table");

        await user.selectOptions(screen.getByLabelText("Dataset"), "git");

        // Only the single git unit remains — both prs units and the cicd
        // unit drop out of the table.
        expect(screen.getByText(/Units \(1 of 4\)/)).toBeInTheDocument();
        expect(within(table).queryByText("cicd")).not.toBeInTheDocument();
    });

    it("filters the unit table by source", async () => {
        renderDetail();
        const user = userEvent.setup();
        const table = screen.getByRole("table");

        await user.selectOptions(screen.getByLabelText("Source"), "fullchaos/platform-api");

        // Only platform-api's two units (git, prs) remain.
        expect(screen.getByText(/Units \(2 of 4\)/)).toBeInTheDocument();
        expect(within(table).queryByText("fullchaos/billing-service")).not.toBeInTheDocument();
    });

    it("toggles the failed/retrying-only filter", async () => {
        renderDetail();
        const user = userEvent.setup();
        const table = screen.getByRole("table");

        await user.click(screen.getByLabelText("Failed/retrying only"));

        // Only the failed (prs) and retrying (cicd) billing-service units
        // remain — the two successful platform-api rows drop out.
        expect(screen.getByText(/Units \(2 of 4\)/)).toBeInTheDocument();
        expect(within(table).queryByText("fullchaos/platform-api")).not.toBeInTheDocument();
    });

    it("filters the unit table by date range", () => {
        renderDetail();
        const table = screen.getByRole("table");

        // Restrict to windows starting on/before Jun 15 — only the null-since
        // git unit and the Jun 12 failed unit overlap; the Jun 19 and Jun 25
        // units are excluded.
        fireEvent.change(screen.getByLabelText("Before"), { target: { value: "2026-06-15" } });

        expect(within(table).queryByText("Jun 19, 2026")).not.toBeInTheDocument();
        expect(within(table).queryByText("Jun 25, 2026")).not.toBeInTheDocument();
        expect(within(table).getByText("Jun 12, 2026")).toBeInTheDocument();
        expect(screen.getByText(/Units \(2 of 4\)/)).toBeInTheDocument();
    });

    it("filters the unit table by the Since date input", () => {
        renderDetail();
        const table = screen.getByRole("table");

        expect(within(table).getAllByText("cicd").length).toBeGreaterThan(0);

        // All sample units share the same before_at (Jun 26, 2026, 11:00 UTC)
        // — a Since date AFTER that excludes every unit, since none of them
        // cover data as recent as the requested boundary.
        fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-06-27" } });

        expect(within(table).queryByText("cicd")).not.toBeInTheDocument();
        expect(screen.getByText(/Units \(0 of 4\)/)).toBeInTheDocument();
    });
});

describe("SyncRunDetailLive — CHAOS-4318 manual refresh (no timer-driven polling)", () => {
    // A non-terminal run so the Refresh control actually renders (the sample
    // run is partial_failed → terminal, which never shows one).
    const RUNNING_RUN = { ...SAMPLE_SYNC_RUN, status: "running" };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function clickRefresh() {
        // fireEvent (not userEvent) — userEvent's internal pointer-event
        // simulation needs real timers and hangs under vi.useFakeTimers().
        await act(async () => {
            fireEvent.click(screen.getByTestId("refresh-control-button"));
            await vi.advanceTimersByTimeAsync(0);
        });
    }

    it("never fetches on its own, however long the page stays open", async () => {
        vi.mocked(getSyncRunStatus).mockResolvedValue({ data: RUNNING_RUN });
        vi.mocked(getSyncRunUnits).mockResolvedValue({ data: SAMPLE_SYNC_RUN_UNIT_SUMMARY });

        render(
            <SyncRunDetailLive
                initialRun={RUNNING_RUN}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
            />,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        });

        expect(getSyncRunStatus).not.toHaveBeenCalled();
        expect(getSyncRunUnits).not.toHaveBeenCalled();
        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });

    it("surfaces an error indicator when an explicit Refresh returns { error }, and stays refreshable", async () => {
        // withErrorHandling RETURNS { error } (never throws); a failed refresh
        // must not apply it as data nor get stuck.
        vi.mocked(getSyncRunStatus).mockResolvedValue({ error: "Unauthorized (401)" });
        vi.mocked(getSyncRunUnits).mockResolvedValue({ error: "Unauthorized (401)" });

        render(
            <SyncRunDetailLive
                initialRun={RUNNING_RUN}
                initialSummary={SAMPLE_SYNC_RUN_UNIT_SUMMARY}
                initialUnitsError={null}
            />,
        );

        await clickRefresh();

        expect(getSyncRunStatus).toHaveBeenCalledTimes(1);
        // Non-fatal error indicator renders with the surfaced message.
        expect(
            screen.getByText(/Failed to load unit details: Unauthorized \(401\)/),
        ).toBeInTheDocument();
        // Last good snapshot is retained — units were NOT fabricated/emptied.
        expect(screen.getByText(/Units \(4\)/)).toBeInTheDocument();

        // A second click can retry — nothing got stuck from the failed one.
        await clickRefresh();
        expect(getSyncRunStatus).toHaveBeenCalledTimes(2);
    });

    it("does not render a Refresh control when initial unit rollups make a stale running run terminal", async () => {
        render(
            <SyncRunDetailLive
                initialRun={{
                    ...RUNNING_RUN,
                    total_units: 4,
                    completed_units: 0,
                    failed_units: 0,
                }}
                initialSummary={{
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    by_status: { success: 4 },
                    unit_count: 4,
                    units: SAMPLE_SYNC_RUN_UNIT_SUMMARY.units.map((unit) => ({
                        ...unit,
                        status: "success",
                    })),
                }}
            />,
        );

        expect(screen.getByText(/Run complete/)).toBeInTheDocument();
        expect(screen.queryByTestId("refresh-control-button")).not.toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3500 * 2);
        });
        expect(getSyncRunStatus).not.toHaveBeenCalled();
    });

    it("re-fetches run + units on each explicit Refresh click while unit rows are incomplete relative to run total", async () => {
        const partialSummary = {
            ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
            by_status: { success: 1 },
            unit_count: 1,
            units: [
                {
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY.units[0],
                    status: "success",
                },
            ],
        };
        const staleRun = {
            ...RUNNING_RUN,
            total_units: 4,
            completed_units: 0,
            failed_units: 0,
        };
        vi.mocked(getSyncRunStatus).mockResolvedValue({ data: staleRun });
        vi.mocked(getSyncRunUnits).mockResolvedValue({ data: partialSummary });

        render(<SyncRunDetailLive initialRun={staleRun} initialSummary={partialSummary} />);

        expect(screen.getByText(/1 \/ 4/)).toBeInTheDocument();
        expect(screen.getByText(/25%/)).toBeInTheDocument();
        expect(screen.getAllByText("Running").length).toBeGreaterThan(0);

        await clickRefresh();
        await clickRefresh();

        expect(getSyncRunStatus).toHaveBeenCalledTimes(2);
        expect(getSyncRunUnits).toHaveBeenCalledTimes(2);
    });

    it("renders the server-side initialUnitsError without polling for a terminal run", () => {
        render(
            <SyncRunDetailLive
                initialRun={SAMPLE_SYNC_RUN}
                initialSummary={null}
                initialUnitsError="Internal Server Error (500)"
            />,
        );

        // Run header still renders from the successful run fetch (terminal run).
        expect(screen.getByText(/Run complete/)).toBeInTheDocument();
        // Explicit units error notice, no fabricated empty "Units (0)".
        expect(
            screen.getByText(/Failed to load unit details: Internal Server Error \(500\)/),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Units \(0\)/)).not.toBeInTheDocument();
        // Terminal run → no polling occurred.
        expect(getSyncRunStatus).not.toHaveBeenCalled();
    });

    // ── CHAOS-3430: watermark lag for ratcheting heavy datasets ──────────────
    //
    // A capped incremental window finalizes as an ordinary SUCCESS, so the run
    // header reads "complete" while the dataset may still be weeks behind.
    // These pin that the catch-up state renders from the PERSISTED backend
    // fields only — never re-derived from a timestamp at render time.
    describe("catching-up datasets", () => {
        function renderWithFreshness(
            freshness: SyncRunUnitSummary["dataset_freshness"],
            catchingUpCount?: number,
        ) {
            return render(
                <SyncRunDetailLive
                    initialRun={SAMPLE_SYNC_RUN}
                    initialSummary={{
                        ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                        dataset_freshness: freshness,
                        catching_up_dataset_count: catchingUpCount,
                    }}
                    testMode
                />,
            );
        }

        it("renders the catching-up dataset with its watermark and ticks behind", () => {
            renderWithFreshness(SAMPLE_SYNC_RUN_DATASET_FRESHNESS, 1);

            const panel = screen.getByRole("region", { name: /catching up/i });
            expect(panel).toBeInTheDocument();

            // The one heavy dataset mid-ratchet, by resolved source name.
            expect(within(panel).getByText(/fullchaos\/platform-api · git/)).toBeInTheDocument();
            // Ticks behind comes straight from the persisted field.
            expect(within(panel).getByText(/~12 ticks behind/)).toBeInTheDocument();
            // The watermark itself is surfaced, not just "behind".
            expect(within(panel).getByText(/Watermark/)).toBeInTheDocument();
        });

        it("omits datasets that are not catching up", () => {
            renderWithFreshness(SAMPLE_SYNC_RUN_DATASET_FRESHNESS, 1);
            const panel = screen.getByRole("region", { name: /catching up/i });

            // Caught-up dataset on the same source: nothing to report.
            expect(within(panel).queryByText(/prs/)).not.toBeInTheDocument();
            // Light dataset trailing ~169 days: only heavy families ratchet, so
            // this must NOT be presented as catch-up.
            expect(within(panel).queryByText(/billing-service/)).not.toBeInTheDocument();
        });

        it("omits the panel entirely when nothing is catching up", () => {
            renderWithFreshness(
                SAMPLE_SYNC_RUN_DATASET_FRESHNESS.filter((entry) => !entry.catching_up),
                0,
            );

            expect(screen.queryByRole("region", { name: /catching up/i })).not.toBeInTheDocument();
        });

        it("omits the panel when the backend does not return the field", () => {
            // Forward-compat: an older backend sends no dataset_freshness. That
            // must read as "no lag information", never as "nothing is behind" —
            // and must not throw.
            renderWithFreshness(undefined, undefined);

            expect(screen.queryByRole("region", { name: /catching up/i })).not.toBeInTheDocument();
            // The rest of the run detail still renders.
            expect(screen.getByText(/Units \(4\)/)).toBeInTheDocument();
        });

        it("renders a single outstanding tick in the singular", () => {
            renderWithFreshness([{ ...SAMPLE_SYNC_RUN_DATASET_FRESHNESS[0], ticks_behind: 1 }], 1);

            const panel = screen.getByRole("region", { name: /catching up/i });
            expect(within(panel).getByText(/~1 tick behind/)).toBeInTheDocument();
            expect(within(panel).queryByText(/~1 ticks behind/)).not.toBeInTheDocument();
        });

        it("still renders the entry when ticks_behind is absent", () => {
            // Defensive: the verdict is the backend's, so a flagged entry with
            // no tick estimate must still be surfaced rather than dropped.
            renderWithFreshness(
                [{ ...SAMPLE_SYNC_RUN_DATASET_FRESHNESS[0], ticks_behind: null }],
                1,
            );

            const panel = screen.getByRole("region", { name: /catching up/i });
            expect(within(panel).getByText(/fullchaos\/platform-api · git/)).toBeInTheDocument();
            expect(within(panel).queryByText(/ticks behind/)).not.toBeInTheDocument();
        });

        it("does not claim measurable lag for an entry with no watermark", () => {
            // A flagged entry can arrive carrying no watermark. The persisted
            // `catching_up` verdict is still the backend's to make and we render
            // it — but copy asserting a MEASURED distance ("behind the current
            // time", a tick count) is not licensed by an entry with no
            // measurement behind it.
            renderWithFreshness(
                [
                    {
                        ...SAMPLE_SYNC_RUN_DATASET_FRESHNESS[0],
                        watermark_at: null,
                        lag_seconds: null,
                        ticks_behind: null,
                    },
                ],
                1,
            );

            const panel = screen.getByRole("region", { name: /catching up/i });
            // The verdict IS licensed: entry and badge still render. Scope the
            // badge lookup to the row — "Catching up" is also the panel heading.
            const row = within(panel).getByRole("listitem");
            expect(within(row).getByText(/fullchaos\/platform-api · git/)).toBeInTheDocument();
            expect(within(row).getByText("Catching up")).toBeInTheDocument();
            // The measurement is NOT licensed.
            expect(panel).not.toHaveTextContent(/behind the current time/i);
            expect(panel).not.toHaveTextContent(/ticks? behind/i);
            // The absence is stated, not rendered as a bare dash.
            expect(within(panel).getByText(/watermark unavailable/i)).toBeInTheDocument();
        });

        it("still states measurable lag when a watermark IS present", () => {
            // Control for the test above: the copy must not go vague for entries
            // that genuinely carry a measurement.
            renderWithFreshness([SAMPLE_SYNC_RUN_DATASET_FRESHNESS[0]], 1);

            const panel = screen.getByRole("region", { name: /catching up/i });
            expect(within(panel).getByText(/~12 ticks behind/)).toBeInTheDocument();
            expect(within(panel).queryByText(/watermark unavailable/i)).not.toBeInTheDocument();
        });
    });

    // ── CHAOS-3430 F2: the sample fixture must be a join production can emit ──
    //
    // The ops builder derives each freshness row FROM a planned unit, copying the
    // unit's resolved source label and cost class. A fixture whose freshness rows
    // name (source, dataset) pairs that no unit contains — or that contradict a
    // unit's cost class — is a shape production cannot produce, so any test or
    // screenshot resting on it validates nothing.
    describe("sample fixture integrity", () => {
        it("derives every freshness row from a real unit in the same run", () => {
            const units = SAMPLE_SYNC_RUN_UNIT_SUMMARY.units;
            const freshness = SAMPLE_SYNC_RUN_UNIT_SUMMARY.dataset_freshness ?? [];
            expect(freshness.length).toBeGreaterThan(0);

            for (const entry of freshness) {
                const match = units.find(
                    (unit) =>
                        unit.source_id === entry.source_id &&
                        unit.dataset_key === entry.dataset_key,
                );
                expect(
                    match,
                    `freshness row ${entry.source_id}/${entry.dataset_key} has no matching unit`,
                ).toBeDefined();
                // Same source label the builder would have copied across.
                expect(entry.source_name).toBe(match?.source_full_name ?? match?.source_name);
                // Same cost class — the builder copies it from the unit.
                expect(entry.cost_class).toBe(match?.cost_class);
            }
        });

        it("only flags heavy datasets as catching up", () => {
            // Mirrors the ops rule: only HEAVY families ratchet, so no other
            // cost class can legitimately carry catching_up.
            for (const entry of SAMPLE_SYNC_RUN_UNIT_SUMMARY.dataset_freshness ?? []) {
                if (entry.catching_up) expect(entry.cost_class).toBe("heavy");
            }
        });

        it("agrees with the catching_up_dataset_count rollup", () => {
            const freshness = SAMPLE_SYNC_RUN_UNIT_SUMMARY.dataset_freshness ?? [];
            const flagged = freshness.filter((entry) => entry.catching_up).length;
            expect(SAMPLE_SYNC_RUN_UNIT_SUMMARY.catching_up_dataset_count).toBe(flagged);
        });
    });
});

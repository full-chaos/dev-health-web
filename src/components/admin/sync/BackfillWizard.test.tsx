import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { BackfillWizard } from "./BackfillWizard";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const triggerBackfill = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    triggerBackfill: (...args: unknown[]) => triggerBackfill(...args),
}));

function renderWizard(props: Partial<React.ComponentProps<typeof BackfillWizard>> = {}) {
    return render(
        <BackfillWizard
            configId="cfg-1"
            onCloseAction={vi.fn()}
            datasetNames={["git", "prs"]}
            sourceNames={["acme/repo"]}
            {...props}
        />,
    );
}

async function fillRange(user: ReturnType<typeof userEvent.setup>, since: string, before: string) {
    const fromInput = screen.getByLabelText("From");
    const toInput = screen.getByLabelText("To");
    await user.clear(fromInput);
    await user.type(fromInput, since);
    await user.clear(toInput);
    await user.type(toInput, before);
}

/** Add `days` whole days to a YYYY-MM-DD input, returned in the same format. */
function addDays(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

describe("BackfillWizard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("blocks submit and shows an inline error when from >= to", async () => {
        const user = userEvent.setup();
        renderWizard();

        await fillRange(user, "2026-06-10", "2026-06-01");

        expect(screen.getByRole("alert")).toHaveTextContent("Start date must be before end date.");
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        expect(screen.getByLabelText("From")).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByLabelText("From")).toHaveAttribute(
            "aria-describedby",
            "backfill-range-error",
        );
    });

    it("advances to the preview step once the range is valid", async () => {
        const user = userEvent.setup();
        renderWizard();

        await fillRange(user, "2026-06-01", "2026-06-05");
        expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByText("Estimated chunks")).toBeInTheDocument();
        expect(screen.getByText(/\(estimate\)/)).toBeInTheDocument();
    });

    it("shows affected dataset/source NAMES (never raw ids) on the range step", () => {
        renderWizard({ datasetNames: ["git", "prs"], sourceNames: ["acme/repo"] });

        expect(screen.getByText("git, prs")).toBeInTheDocument();
        expect(screen.getByText("acme/repo")).toBeInTheDocument();
    });

    it("pre-fills the range from gap-driven props", () => {
        renderWizard({ initialSince: "2026-06-20", initialBefore: "2026-06-26" });

        expect(screen.getByLabelText("From")).toHaveValue("2026-06-20");
        expect(screen.getByLabelText("To")).toHaveValue("2026-06-26");
    });

    it("requires explicit confirmation before submitting an expensive (>180 day) range", async () => {
        const user = userEvent.setup();
        renderWizard();

        await fillRange(user, "2026-01-01", "2026-12-01");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/more than 180/);
        const submitButton = screen.getByRole("button", { name: "Run backfill" });
        expect(submitButton).toBeDisabled();

        await user.click(
            screen.getByRole("checkbox", { name: /understand this is a large backfill/i }),
        );
        expect(submitButton).toBeEnabled();
    });

    it("submits via triggerBackfill with the exact payload and links to the resulting run", async () => {
        triggerBackfill.mockResolvedValue({
            data: {
                task_id: "task-1",
                status: "accepted",
                backfill_job_id: "job-1",
                sync_run_id: "run-42",
            },
        });
        const user = userEvent.setup();
        renderWizard();

        await fillRange(user, "2026-06-01", "2026-06-05");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(screen.getByRole("button", { name: "Run backfill" }));

        expect(triggerBackfill).toHaveBeenCalledWith("cfg-1", "2026-06-01", "2026-06-05");
        expect(await screen.findByRole("link", { name: "View run" })).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg-1/runs/run-42",
        );
        expect(mockRefresh).toHaveBeenCalled();
    });

    it("does not call the live server action in test mode (demo no-op submit path)", async () => {
        const user = userEvent.setup();
        renderWizard({ testMode: true });

        await fillRange(user, "2026-06-01", "2026-06-05");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(screen.getByRole("button", { name: "Run backfill" }));

        expect(triggerBackfill).not.toHaveBeenCalled();
        expect(await screen.findByText(/Backfill started/)).toBeInTheDocument();
    });

    it("disables Continue when both date fields are empty", () => {
        renderWizard();
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("blocks submit and shows an inline error when from == to", async () => {
        const user = userEvent.setup();
        renderWizard();

        await fillRange(user, "2026-06-05", "2026-06-05");

        expect(screen.getByRole("alert")).toHaveTextContent("Start date must be before end date.");
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("does not warn at exactly the 180-day threshold", async () => {
        const user = userEvent.setup();
        renderWizard();
        const since = "2026-01-01";
        const before = addDays(since, 180);

        await fillRange(user, since, before);
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run backfill" })).toBeEnabled();
    });

    it("warns just past the 180-day threshold (181 days)", async () => {
        const user = userEvent.setup();
        renderWizard();
        const since = "2026-01-01";
        const before = addDays(since, 181);

        await fillRange(user, since, before);
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/more than 180/);
        expect(screen.getByRole("button", { name: "Run backfill" })).toBeDisabled();
    });

    it("resets the expensive-range confirmation when the range changes after going back", async () => {
        const user = userEvent.setup();
        renderWizard();

        await fillRange(user, "2026-01-01", "2026-12-01");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(
            screen.getByRole("checkbox", { name: /understand this is a large backfill/i }),
        );
        expect(screen.getByRole("button", { name: "Run backfill" })).toBeEnabled();

        await user.click(screen.getByRole("button", { name: "Back" }));
        await user.clear(screen.getByLabelText("To"));
        await user.type(screen.getByLabelText("To"), "2026-11-01");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/more than 180/);
        expect(screen.getByRole("button", { name: "Run backfill" })).toBeDisabled();
    });

    it("moves focus to the dialog on open", () => {
        renderWizard();
        expect(screen.getByRole("dialog")).toHaveFocus();
    });

    it("restores focus to the previously focused trigger element on close", () => {
        const trigger = document.createElement("button");
        document.body.appendChild(trigger);
        trigger.focus();
        expect(trigger).toHaveFocus();

        const { unmount } = renderWizard();
        expect(screen.getByRole("dialog")).toHaveFocus();

        unmount();
        expect(trigger).toHaveFocus();

        document.body.removeChild(trigger);
    });

    it("closes on Escape even when focus is not inside the dialog", async () => {
        const onCloseAction = vi.fn();
        const trigger = document.createElement("button");
        document.body.appendChild(trigger);
        renderWizard({ onCloseAction });
        trigger.focus();
        expect(trigger).toHaveFocus();

        await userEvent.keyboard("{Escape}");

        expect(onCloseAction).toHaveBeenCalledTimes(1);
        document.body.removeChild(trigger);
    });
});

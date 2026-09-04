import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BugReportButton } from "./BugReportButton";

vi.mock("sonner", () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

describe("BugReportButton", () => {
    it("uses an account-menu trigger and restores focus after Escape", async () => {
        const user = userEvent.setup();
        render(<BugReportButton />);
        const trigger = screen.getByTestId("bug-report-trigger");

        expect(trigger).not.toHaveClass("fixed");
        await user.click(trigger);

        expect(screen.getByRole("dialog", { name: "Report issue" })).toBeVisible();
        expect(screen.getByLabelText("Title")).toHaveFocus();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it("traps Tab navigation inside the open dialog", async () => {
        const user = userEvent.setup();
        render(<BugReportButton />);
        await user.click(screen.getByTestId("bug-report-trigger"));
        const close = screen.getByRole("button", { name: "Close" });
        const submit = screen.getByRole("button", { name: "Submit Report" });

        submit.focus();
        await user.tab();
        expect(close).toHaveFocus();
        await user.tab({ shift: true });
        expect(submit).toHaveFocus();
    });
});

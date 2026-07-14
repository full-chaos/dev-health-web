import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { ConfirmDialog } from "./ConfirmDialog";

function PendingDialogHarness() {
    const [isPending, setIsPending] = useState(false);
    return (
        <ConfirmDialog
            isOpen
            isPending={isPending}
            title="Delete configuration"
            onConfirmAction={() => setIsPending(true)}
            onCancelAction={vi.fn()}
        />
    );
}

describe("ConfirmDialog pending focus", () => {
    it("returns focus to the dialog when confirming disables every control", async () => {
        const user = userEvent.setup();
        render(<PendingDialogHarness />);
        const dialog = screen.getByRole("dialog");

        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        expect(dialog).toHaveFocus();
        await user.tab();
        expect(dialog).toHaveFocus();
        await user.tab({ shift: true });
        expect(dialog).toHaveFocus();
    });
});

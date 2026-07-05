import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { ConfirmDialog } from "./ConfirmDialog";
import { CTA_LABELS } from "@/lib/design/cta";

function findBackdropAndCancelButtons() {
    const buttons = screen.getAllByRole("button", { name: "Cancel" });
    const backdrop = buttons.find((button) => button.textContent === "");
    const cancelButton = buttons.find((button) => button.textContent === "Cancel");
    if (!backdrop || !cancelButton) {
        throw new Error("Expected both a backdrop button and a labeled Cancel button.");
    }
    return { backdrop, cancelButton };
}

describe("ConfirmDialog", () => {
    it("renders nothing when isOpen is false", () => {
        render(
            <ConfirmDialog
                isOpen={false}
                title="Delete invoice"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders the title, description, and default CTA labels", () => {
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                description="This cannot be undone."
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        expect(screen.getByRole("dialog", { name: "Delete invoice" })).toBeInTheDocument();
        expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    });

    it("fires onConfirmAction exactly once and never onCancelAction when confirmed", async () => {
        const onConfirmAction = vi.fn();
        const onCancelAction = vi.fn();
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={onConfirmAction}
                onCancelAction={onCancelAction}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(onConfirmAction).toHaveBeenCalledTimes(1);
        expect(onCancelAction).not.toHaveBeenCalled();
    });

    it("fires only onCancelAction when the Cancel button is clicked", async () => {
        const onConfirmAction = vi.fn();
        const onCancelAction = vi.fn();
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={onConfirmAction}
                onCancelAction={onCancelAction}
            />,
        );

        const { cancelButton } = findBackdropAndCancelButtons();
        await user.click(cancelButton);

        expect(onCancelAction).toHaveBeenCalledTimes(1);
        expect(onConfirmAction).not.toHaveBeenCalled();
    });

    it("fires only onCancelAction when the backdrop is dismissed", async () => {
        const onConfirmAction = vi.fn();
        const onCancelAction = vi.fn();
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={onConfirmAction}
                onCancelAction={onCancelAction}
            />,
        );

        const { backdrop } = findBackdropAndCancelButtons();
        await user.click(backdrop);

        expect(onCancelAction).toHaveBeenCalledTimes(1);
        expect(onConfirmAction).not.toHaveBeenCalled();
    });

    it("fires only onCancelAction when Escape is pressed", async () => {
        const onConfirmAction = vi.fn();
        const onCancelAction = vi.fn();
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={onConfirmAction}
                onCancelAction={onCancelAction}
            />,
        );

        await user.keyboard("{Escape}");

        expect(onCancelAction).toHaveBeenCalledTimes(1);
        expect(onConfirmAction).not.toHaveBeenCalled();
    });

    it("blocks confirm until the required confirmation text is typed exactly", async () => {
        const onConfirmAction = vi.fn();
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete organization"
                requiredConfirmationText="delete-my-org"
                onConfirmAction={onConfirmAction}
                onCancelAction={vi.fn()}
            />,
        );

        const confirmButton = screen.getByRole("button", { name: "Confirm" });
        expect(confirmButton).toBeDisabled();

        const input = screen.getByLabelText(/type.*delete-my-org.*to confirm/iu);
        await user.type(input, "not-quite-right");
        expect(confirmButton).toBeDisabled();

        await user.clear(input);
        await user.type(input, "delete-my-org");
        expect(confirmButton).toBeEnabled();

        await user.click(confirmButton);
        expect(onConfirmAction).toHaveBeenCalledTimes(1);
    });

    it("applies the destructive tone to the confirm button", () => {
        render(
            <ConfirmDialog
                isOpen
                title="Void invoice"
                tone="destructive"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass("bg-(--negative)");
    });

    it("supports custom confirm and cancel labels from the CTA registry", () => {
        render(
            <ConfirmDialog
                isOpen
                title="Void invoice"
                confirmLabel={CTA_LABELS.delete}
                cancelLabel={CTA_LABELS.closeWizard}
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: CTA_LABELS.delete })).toBeInTheDocument();
        const closeButtons = screen.getAllByRole("button", { name: CTA_LABELS.closeWizard });
        expect(closeButtons.some((button) => button.textContent === CTA_LABELS.closeWizard)).toBe(
            true,
        );
    });

    it("moves focus inside the dialog when it opens", () => {
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        expect(screen.getByRole("dialog")).toHaveFocus();
    });

    it("wraps focus from the last focusable element back to the first on Tab", async () => {
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        const confirmButton = screen.getByRole("button", { name: "Confirm" });
        const { cancelButton } = findBackdropAndCancelButtons();
        confirmButton.focus();

        await user.tab();

        expect(cancelButton).toHaveFocus();
    });

    it("wraps focus from the first focusable element back to the last on Shift+Tab", async () => {
        const user = userEvent.setup();
        render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        const confirmButton = screen.getByRole("button", { name: "Confirm" });
        const { cancelButton } = findBackdropAndCancelButtons();
        cancelButton.focus();

        await user.tab({ shift: true });

        expect(confirmButton).toHaveFocus();
    });

    it("restores focus to the previously focused element after close", () => {
        const trigger = document.createElement("button");
        document.body.appendChild(trigger);
        trigger.focus();
        expect(trigger).toHaveFocus();

        const { rerender } = render(
            <ConfirmDialog
                isOpen
                title="Delete invoice"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );
        expect(screen.getByRole("dialog")).toHaveFocus();

        rerender(
            <ConfirmDialog
                isOpen={false}
                title="Delete invoice"
                onConfirmAction={vi.fn()}
                onCancelAction={vi.fn()}
            />,
        );

        expect(trigger).toHaveFocus();
        document.body.removeChild(trigger);
    });
});

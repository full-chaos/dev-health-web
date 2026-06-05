/** VoidConfirmDialog component tests — CHAOS-1240. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, cleanup } from "@/test/utils";
import { VoidConfirmDialog } from "./VoidConfirmDialog";

describe("VoidConfirmDialog", () => {
    afterEach(() => cleanup());

    it("renders nothing when isOpen=false", () => {
        const { container } = render(
            <VoidConfirmDialog
                isOpen={false}
                invoiceLabel="in_123"
                isPending={false}
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders the invoice label and confirm/cancel actions when open", () => {
        render(
            <VoidConfirmDialog
                isOpen
                invoiceLabel="in_ABC123"
                isPending={false}
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("in_ABC123")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled();
        expect(screen.getByRole("button", { name: /confirm void/i })).toBeEnabled();
    });

    it("calls onCancel when Cancel is clicked", async () => {
        const onCancel = vi.fn();
        render(
            <VoidConfirmDialog
                isOpen
                invoiceLabel="in_1"
                isPending={false}
                onCancel={onCancel}
                onConfirm={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("calls onConfirm when Confirm Void is clicked", async () => {
        const onConfirm = vi.fn();
        render(
            <VoidConfirmDialog
                isOpen
                invoiceLabel="in_1"
                isPending={false}
                onCancel={vi.fn()}
                onConfirm={onConfirm}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /confirm void/i }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("shows 'Voiding...' label and disables both buttons while pending", () => {
        render(
            <VoidConfirmDialog
                isOpen
                invoiceLabel="in_1"
                isPending
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: /voiding/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    });
});

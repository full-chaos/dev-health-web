/** CancelSubscriptionDialog component tests — CHAOS-2839. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, cleanup } from "@/test/utils";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";

describe("CancelSubscriptionDialog", () => {
    afterEach(() => cleanup());

    it("renders nothing when isOpen=false", () => {
        const { container } = render(
            <CancelSubscriptionDialog
                isOpen={false}
                periodEndLabel="1/1/2027"
                isPending={false}
                onDismiss={vi.fn()}
                onConfirmPeriodEnd={vi.fn()}
                onConfirmImmediate={vi.fn()}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders both explicit cancellation choices and the dismiss action when open", () => {
        render(
            <CancelSubscriptionDialog
                isOpen
                periodEndLabel="1/1/2027"
                isPending={false}
                onDismiss={vi.fn()}
                onConfirmPeriodEnd={vi.fn()}
                onConfirmImmediate={vi.fn()}
            />,
        );

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText(/1\/1\/2027/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cancel at period end/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cancel immediately/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    });

    it("calls onDismiss and never a cancellation callback when the Cancel button is clicked", async () => {
        const onDismiss = vi.fn();
        const onConfirmPeriodEnd = vi.fn();
        const onConfirmImmediate = vi.fn();
        render(
            <CancelSubscriptionDialog
                isOpen
                periodEndLabel="1/1/2027"
                isPending={false}
                onDismiss={onDismiss}
                onConfirmPeriodEnd={onConfirmPeriodEnd}
                onConfirmImmediate={onConfirmImmediate}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(onConfirmPeriodEnd).not.toHaveBeenCalled();
        expect(onConfirmImmediate).not.toHaveBeenCalled();
    });

    it("calls onConfirmPeriodEnd (and no other callback) when 'Cancel at period end' is clicked", async () => {
        const onDismiss = vi.fn();
        const onConfirmPeriodEnd = vi.fn();
        const onConfirmImmediate = vi.fn();
        render(
            <CancelSubscriptionDialog
                isOpen
                periodEndLabel="1/1/2027"
                isPending={false}
                onDismiss={onDismiss}
                onConfirmPeriodEnd={onConfirmPeriodEnd}
                onConfirmImmediate={onConfirmImmediate}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /cancel at period end/i }));

        expect(onConfirmPeriodEnd).toHaveBeenCalledTimes(1);
        expect(onConfirmImmediate).not.toHaveBeenCalled();
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it("calls onConfirmImmediate (and no other callback) when 'Cancel immediately' is clicked", async () => {
        const onDismiss = vi.fn();
        const onConfirmPeriodEnd = vi.fn();
        const onConfirmImmediate = vi.fn();
        render(
            <CancelSubscriptionDialog
                isOpen
                periodEndLabel="1/1/2027"
                isPending={false}
                onDismiss={onDismiss}
                onConfirmPeriodEnd={onConfirmPeriodEnd}
                onConfirmImmediate={onConfirmImmediate}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /cancel immediately/i }));

        expect(onConfirmImmediate).toHaveBeenCalledTimes(1);
        expect(onConfirmPeriodEnd).not.toHaveBeenCalled();
        expect(onDismiss).not.toHaveBeenCalled();
    });

    it("disables all actions while pending", () => {
        render(
            <CancelSubscriptionDialog
                isOpen
                periodEndLabel="1/1/2027"
                isPending
                onDismiss={vi.fn()}
                onConfirmPeriodEnd={vi.fn()}
                onConfirmImmediate={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: /scheduling/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /canceling/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDisabled();
    });
});

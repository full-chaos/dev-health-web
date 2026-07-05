"use client";

import { CTA_LABELS } from "@/lib/design/cta";

type CancelSubscriptionDialogProps = {
    isOpen: boolean;
    periodEndLabel: string;
    isPending: boolean;
    onDismiss: () => void;
    onConfirmPeriodEnd: () => void;
    onConfirmImmediate: () => void;
};

/**
 * Explicit two-choice cancellation modal (CHAOS-2839). Replaces the previous
 * `window.confirm` prompt: dismissing the dialog (backdrop, Escape via
 * onDismiss wiring, or the Cancel button) NEVER issues a cancellation
 * request — only the two labeled action buttons below call `onCancel`.
 */
export function CancelSubscriptionDialog({
    isOpen,
    periodEndLabel,
    isPending,
    onDismiss,
    onConfirmPeriodEnd,
    onConfirmImmediate,
}: CancelSubscriptionDialogProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-subscription-title"
        >
            <div className="w-full max-w-md rounded-2xl border border-(--card-stroke) bg-(--background) p-6 shadow-2xl">
                <h3
                    id="cancel-subscription-title"
                    className="font-(--font-display) text-lg text-foreground"
                >
                    Cancel Subscription
                </h3>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Choose how to cancel. Nothing happens until you pick one of the options below.
                </p>

                <div className="mt-4 space-y-3">
                    <div className="rounded-md border border-(--card-stroke) p-3">
                        <p className="text-sm font-medium text-(--foreground)">
                            Cancel at period end
                        </p>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            Keep access until {periodEndLabel}, then the subscription ends.
                        </p>
                        <button
                            type="button"
                            onClick={onConfirmPeriodEnd}
                            disabled={isPending}
                            className="mt-3 w-full rounded-md border border-(--card-stroke) px-3 py-2 text-sm font-medium text-(--foreground) hover:bg-(--card-70) disabled:opacity-50"
                        >
                            {isPending ? "Scheduling…" : CTA_LABELS.cancelAtPeriodEnd}
                        </button>
                    </div>

                    <div className="rounded-md border border-red-300 p-3">
                        <p className="text-sm font-medium text-red-700">Cancel immediately</p>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            Access ends now. This cannot be undone.
                        </p>
                        <button
                            type="button"
                            onClick={onConfirmImmediate}
                            disabled={isPending}
                            className="mt-3 w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                            {isPending ? "Canceling…" : CTA_LABELS.cancelImmediately}
                        </button>
                    </div>
                </div>

                <div className="mt-5 flex justify-end">
                    <button
                        type="button"
                        onClick={onDismiss}
                        disabled={isPending}
                        className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm hover:bg-(--card-70) disabled:opacity-50"
                    >
                        {CTA_LABELS.cancel}
                    </button>
                </div>
            </div>
        </div>
    );
}

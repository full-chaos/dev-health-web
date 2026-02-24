"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { createRefund, type RefundRecord } from "@/lib/billing/actions";

type RefundDialogProps = {
  invoiceId: string;
  invoiceAmountCents: number;
  refundableAmountCents: number;
  onRefundCreated?: (refund: RefundRecord) => void;
};

const REFUND_REASONS = [
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "duplicate", label: "Duplicate" },
  { value: "fraudulent", label: "Fraudulent" },
] as const;

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

export function RefundDialog({
  invoiceId,
  invoiceAmountCents,
  refundableAmountCents,
  onRefundCreated,
}: RefundDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [amountInput, setAmountInput] = useState(centsToDollars(refundableAmountCents));
  const [reason, setReason] = useState<(typeof REFUND_REASONS)[number]["value"]>(
    "requested_by_customer",
  );
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const requestedAmountCents = useMemo(() => {
    if (!isPartial) {
      return refundableAmountCents;
    }
    return dollarsToCents(amountInput);
  }, [amountInput, isPartial, refundableAmountCents]);

  const validationError = useMemo(() => {
    if (requestedAmountCents === null) {
      return "Enter a valid amount.";
    }
    if (requestedAmountCents > refundableAmountCents) {
      return "Amount cannot exceed the refundable balance.";
    }
    return null;
  }, [requestedAmountCents, refundableAmountCents]);

  const resetAndClose = () => {
    setIsOpen(false);
    setIsPartial(false);
    setAmountInput(centsToDollars(refundableAmountCents));
    setReason("requested_by_customer");
    setDescription("");
    setConfirming(false);
  };

  const beginConfirmation = () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setConfirming(true);
  };

  const submit = () => {
    if (validationError || requestedAmountCents === null) {
      toast.error(validationError ?? "Invalid refund request");
      return;
    }

    startTransition(async () => {
      const result = await createRefund({
        invoiceId,
        amount: requestedAmountCents,
        reason,
        description: description.trim() || undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Refund issued");
      if (result.data && onRefundCreated) {
        onRefundCreated(result.data);
      }
      resetAndClose();
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-red-500/40 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"
      >
        Issue Refund
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-(--card-stroke) bg-(--card) shadow-2xl">
        <div className="flex items-center justify-between border-b border-(--card-stroke) p-6">
          <h2 className="text-lg font-semibold text-(--foreground)">Issue Refund</h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-md px-2 py-1 text-(--ink-muted) hover:bg-(--card-80)"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-md border border-(--card-stroke) bg-(--card-80) p-3 text-sm text-(--ink-muted)">
            <p>Invoice total: ${centsToDollars(invoiceAmountCents)}</p>
            <p>Refundable balance: ${centsToDollars(refundableAmountCents)}</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-(--foreground)">
            <input
              type="checkbox"
              checked={isPartial}
              onChange={(event) => setIsPartial(event.target.checked)}
            />
            Partial refund
          </label>

          {isPartial && (
            <div>
              <label htmlFor="refund-amount" className="mb-1 block text-sm text-(--foreground)">
                Amount (USD)
              </label>
              <input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                className="w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label htmlFor="refund-reason" className="mb-1 block text-sm text-(--foreground)">
              Reason
            </label>
            <select
              id="refund-reason"
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as (typeof REFUND_REASONS)[number]["value"])
              }
              className="w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-sm"
            >
              {REFUND_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="refund-description" className="mb-1 block text-sm text-(--foreground)">
              Description
            </label>
            <textarea
              id="refund-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-sm"
            />
          </div>

          {validationError && <p className="text-sm text-red-500">{validationError}</p>}

          <div className="flex items-center justify-end gap-2">
            {!confirming ? (
              <button
                type="button"
                onClick={beginConfirmation}
                className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
              >
                Continue
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-500/90 disabled:opacity-50"
                >
                  {isPending ? "Issuing..." : "Confirm Refund"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

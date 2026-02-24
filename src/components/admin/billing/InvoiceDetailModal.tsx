"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getRefunds, type RefundRecord } from "@/lib/billing/actions";

import { RefundDialog } from "./RefundDialog";

type InvoiceDetailModalProps = {
  invoiceId: string;
  amountPaidCents: number;
  status: string;
};

export function InvoiceDetailModal({
  invoiceId,
  amountPaidCents,
  status,
}: InvoiceDetailModalProps) {
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);

  useEffect(() => {
    let active = true;

    const loadRefunds = async () => {
      const result = await getRefunds({ limit: 50, offset: 0 });
      if (!active) {
        return;
      }
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const invoiceRefunds = (result.data?.items ?? []).filter(
        (item) => item.invoice_id === invoiceId,
      );
      setRefunds(invoiceRefunds);
    };

    void loadRefunds();
    return () => {
      active = false;
    };
  }, [invoiceId]);

  const refundedAmountCents = useMemo(
    () => refunds.reduce((sum, item) => sum + item.amount, 0),
    [refunds],
  );
  const refundableAmountCents = Math.max(amountPaidCents - refundedAmountCents, 0);
  const canIssueRefund = status === "paid" && refundableAmountCents > 0;

  return (
    <div className="space-y-4 rounded-xl border border-(--card-stroke) bg-(--card) p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-(--foreground)">Invoice Details</h3>
        {canIssueRefund && (
          <RefundDialog
            invoiceId={invoiceId}
            invoiceAmountCents={amountPaidCents}
            refundableAmountCents={refundableAmountCents}
            onRefundCreated={(refund) => setRefunds((prev) => [refund, ...prev])}
          />
        )}
      </div>

      <div className="text-sm text-(--ink-muted)">
        <p>Amount paid: ${(amountPaidCents / 100).toFixed(2)}</p>
        <p>Already refunded: ${(refundedAmountCents / 100).toFixed(2)}</p>
        <p>Available to refund: ${(refundableAmountCents / 100).toFixed(2)}</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-(--foreground)">Refund History</h4>
        {refunds.length === 0 ? (
          <p className="text-sm text-(--ink-muted)">No refunds yet.</p>
        ) : (
          <ul className="space-y-2">
            {refunds.map((refund) => (
              <li
                key={refund.id}
                className="rounded-md border border-(--card-stroke) bg-(--background) p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-(--foreground)">
                    ${(refund.amount / 100).toFixed(2)} {refund.currency.toUpperCase()}
                  </span>
                  <span className="text-(--ink-muted)">{refund.status}</span>
                </div>
                {refund.reason && <p className="mt-1 text-(--ink-muted)">Reason: {refund.reason}</p>}
                {refund.description && (
                  <p className="mt-1 text-(--ink-muted)">Description: {refund.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

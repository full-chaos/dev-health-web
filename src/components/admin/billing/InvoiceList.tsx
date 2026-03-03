"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getInvoice,
  getInvoices,
  voidInvoice,
  type InvoiceListResponse,
  type InvoiceRecord,
} from "@/lib/billing/actions";
import { InvoiceDetailModal } from "./InvoiceDetailModal";
import { VoidConfirmDialog } from "./VoidConfirmDialog";

type InvoiceListProps = {
  initialData: InvoiceListResponse;
  initialOrgFilter?: string;
  showOrgColumn?: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-400",
  open: "bg-blue-500/15 text-blue-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  payment_failed: "bg-red-500/15 text-red-400",
  void: "bg-slate-500/15 text-slate-400 line-through",
  voided: "bg-slate-500/15 text-slate-400 line-through",
};

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function InvoiceList({
  initialData,
  initialOrgFilter = "",
  showOrgColumn = false,
}: InvoiceListProps) {
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [orgFilter, setOrgFilter] = useState<string>(initialOrgFilter);
  const [data, setData] = useState<InvoiceListResponse>(initialData);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [voidingInvoice, setVoidingInvoice] = useState<InvoiceRecord | null>(null);

  const totalPages = useMemo(() => {
    if (data.limit <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(data.total / data.limit));
  }, [data.limit, data.total]);

  const currentPage = useMemo(() => {
    if (data.limit <= 0) {
      return 1;
    }
    return Math.floor(data.offset / data.limit) + 1;
  }, [data.limit, data.offset]);

  const refreshList = (
    nextOffset = 0,
    nextStatus = statusFilter,
    nextOrgId = orgFilter,
  ) => {
    startTransition(async () => {
      const result = await getInvoices(
        data.limit,
        nextOffset,
        nextStatus || undefined,
        nextOrgId.trim() || undefined,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) {
        setData(result.data);
      }
    });
  };

  const handleOpenDetail = (invoiceId: string) => {
    startTransition(async () => {
      const result = await getInvoice(invoiceId, orgFilter.trim() || undefined);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) {
        setSelectedInvoice(result.data);
        setIsDetailOpen(true);
      }
    });
  };

  const handleVoidConfirm = () => {
    if (!voidingInvoice) {
      return;
    }

    startTransition(async () => {
      const result = await voidInvoice(voidingInvoice.id, orgFilter.trim() || undefined);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.data) {
        return;
      }

      const updatedInvoice = result.data;
      setData((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === updatedInvoice.id ? { ...item, ...updatedInvoice } : item)),
      }));

      if (selectedInvoice?.id === updatedInvoice.id) {
        setSelectedInvoice(updatedInvoice);
      }

      setVoidingInvoice(null);
      toast.success("Invoice voided");
    });
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-(--ink-muted)">
            <span>Status</span>
            <select
              className="rounded-md border border-(--card-stroke) bg-(--card-80) px-2 py-1 text-sm text-foreground"
              value={statusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                setStatusFilter(nextStatus);
                refreshList(0, nextStatus, orgFilter);
              }}
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="paid">Paid</option>
              <option value="payment_failed">Payment Failed</option>
              <option value="void">Void</option>
            </select>
          </label>

          {showOrgColumn && (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                refreshList(0, statusFilter, orgFilter);
              }}
            >
              <input
                type="search"
                value={orgFilter}
                onChange={(event) => setOrgFilter(event.target.value)}
                placeholder="Org ID"
                className="rounded-md border border-(--card-stroke) bg-(--card-80) px-2 py-1 text-sm text-foreground"
              />
              <button
                type="submit"
                className="rounded-md border border-(--card-stroke) px-2.5 py-1 text-xs font-medium text-foreground hover:bg-(--card-70)"
              >
                Filter
              </button>
            </form>
          )}
        </div>

        <p className="text-sm text-(--ink-muted)">
          Page {currentPage} of {totalPages} ({data.total} invoices)
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
            <tr>
              {showOrgColumn && <th className="px-4 py-3 font-medium">Org</th>}
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Amount Due</th>
              <th className="px-4 py-3 font-medium">Amount Paid</th>
              <th className="px-4 py-3 font-medium">Issued</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--card-stroke)">
            {data.items.map((invoice) => {
              const canVoid = !["paid", "void", "voided"].includes(invoice.status);
              return (
                <tr key={invoice.id} className="hover:bg-(--card-70)/50">
                  {showOrgColumn && (
                    <td className="px-4 py-3 text-xs text-(--ink-muted)">{invoice.org_id}</td>
                  )}
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{invoice.stripe_invoice_id}</p>
                    <p className="text-xs text-(--ink-muted)">{invoice.stripe_customer_id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[invoice.status] ?? "bg-slate-500/15 text-slate-300"}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{formatMoney(invoice.amount_due, invoice.currency)}</td>
                  <td className="px-4 py-3 text-foreground">{formatMoney(invoice.amount_paid, invoice.currency)}</td>
                  <td className="px-4 py-3 text-(--ink-muted)">
                    {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(invoice.id)}
                        className="rounded-md border border-(--card-stroke) px-2.5 py-1 text-xs font-medium text-foreground hover:bg-(--card-70)"
                      >
                        View
                      </button>
                      {canVoid && (
                        <button
                          type="button"
                          onClick={() => setVoidingInvoice(invoice)}
                          className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={showOrgColumn ? 7 : 6} className="px-4 py-12 text-center text-(--ink-muted)">
                  No invoices found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => refreshList(Math.max(0, data.offset - data.limit))}
          disabled={isPending || data.offset === 0}
          className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => refreshList(data.offset + data.limit)}
          disabled={isPending || currentPage >= totalPages}
          className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Next
        </button>
      </div>

      <InvoiceDetailModal invoice={selectedInvoice} isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} />
      <VoidConfirmDialog
        isOpen={voidingInvoice !== null}
        invoiceLabel={voidingInvoice?.stripe_invoice_id ?? ""}
        isPending={isPending}
        onCancel={() => setVoidingInvoice(null)}
        onConfirm={handleVoidConfirm}
      />
    </>
  );
}

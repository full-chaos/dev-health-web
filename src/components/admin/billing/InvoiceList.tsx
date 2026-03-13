"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getInvoice,
  getInvoices,
  voidInvoice,
  type InvoiceListResponse,
  type InvoiceRecord,
} from "@/lib/billing/actions";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
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

  const refreshList = useCallback((
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
  }, [data.limit, orgFilter, statusFilter]);

  const handleOpenDetail = useCallback((invoiceId: string) => {
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
  }, [orgFilter]);

  const handleVoidConfirm = useCallback(() => {
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
  }, [orgFilter, selectedInvoice?.id, voidingInvoice]);

  const columns: DataTableColumn<InvoiceRecord>[] = (() => {
    const nextColumns: DataTableColumn<InvoiceRecord>[] = [];
    if (showOrgColumn) {
      nextColumns.push({
        key: "org",
        header: "Org",
        className: "px-4 py-3 text-xs text-(--ink-muted)",
        render: (invoice) => invoice.org_id,
      });
    }

    nextColumns.push(
      {
        key: "invoice",
        header: "Invoice",
        className: "px-4 py-3",
        render: (invoice) => (
          <>
            <p className="font-medium text-foreground">{invoice.stripe_invoice_id}</p>
            <p className="text-xs text-(--ink-muted)">{invoice.stripe_customer_id}</p>
          </>
        ),
      },
      {
        key: "status",
        header: "Status",
        className: "px-4 py-3",
        render: (invoice) => (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[invoice.status] ?? "bg-slate-500/15 text-slate-300"}`}>
            {invoice.status}
          </span>
        ),
      },
      {
        key: "amount_due",
        header: "Amount Due",
        className: "px-4 py-3 text-foreground",
        render: (invoice) => formatMoney(invoice.amount_due, invoice.currency),
      },
      {
        key: "amount_paid",
        header: "Amount Paid",
        className: "px-4 py-3 text-foreground",
        render: (invoice) => formatMoney(invoice.amount_paid, invoice.currency),
      },
      {
        key: "issued",
        header: "Issued",
        className: "px-4 py-3 text-(--ink-muted)",
        render: (invoice) => (invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : "-"),
      },
      {
        key: "actions",
        header: "Actions",
        headerClassName: "px-4 py-3 text-right font-medium",
        className: "px-4 py-3 text-right",
        render: (invoice) => {
          const canVoid = !["paid", "void", "voided"].includes(invoice.status);
          return (
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
          );
        },
      }
    );

    return nextColumns;
  })();

  const toolbar = (
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
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data.items}
        rowKeyAction={(invoice) => invoice.id}
        emptyColSpan={showOrgColumn ? 7 : 6}
        emptyMessage="No invoices found for this filter."
        pagination={{ limit: data.limit, offset: data.offset, total: data.total }}
        summaryLabel="invoices"
        onPageChangeAction={(nextOffset) => refreshList(nextOffset)}
        isPending={isPending}
        toolbar={toolbar}
        search={showOrgColumn ? { value: orgFilter, placeholder: "Org ID", buttonLabel: "Filter" } : undefined}
        onSearchAction={showOrgColumn ? () => refreshList(0, statusFilter, orgFilter) : undefined}
        onSearchChangeAction={showOrgColumn ? setOrgFilter : undefined}
      />

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

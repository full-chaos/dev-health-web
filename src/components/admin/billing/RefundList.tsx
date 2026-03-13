"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getRefunds,
  type RefundRecord,
} from "@/lib/billing/actions";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

type RefundListResponse = {
  items: RefundRecord[];
  total: number;
  limit: number;
  offset: number;
};

type RefundListProps = {
  initialData: RefundListResponse;
  initialOrgFilter?: string;
};

const STATUS_STYLES: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-blue-500/15 text-blue-400",
  failed: "bg-red-500/15 text-red-400",
  canceled: "bg-slate-500/15 text-slate-300",
};

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function RefundList({
  initialData,
  initialOrgFilter = "",
}: RefundListProps) {
  const [isPending, startTransition] = useTransition();
  const [orgFilter, setOrgFilter] = useState(initialOrgFilter);
  const [data, setData] = useState(initialData);

  const refreshList = (nextOffset = 0, nextOrgId = orgFilter) => {
    startTransition(async () => {
      const result = await getRefunds(
        { limit: data.limit, offset: nextOffset },
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

  const columns = useMemo<DataTableColumn<RefundRecord>[]>(
    () => [
      {
        key: "org",
        header: "Org",
        className: "px-4 py-3 text-xs text-(--ink-muted)",
        render: (refund) => refund.org_id,
      },
      {
        key: "invoice",
        header: "Invoice",
        className: "px-4 py-3 text-(--ink-muted)",
        render: (refund) => refund.invoice_id ?? "-",
      },
      {
        key: "amount",
        header: "Amount",
        className: "px-4 py-3 text-foreground",
        render: (refund) => formatMoney(refund.amount, refund.currency),
      },
      {
        key: "status",
        header: "Status",
        className: "px-4 py-3",
        render: (refund) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[refund.status] ?? "bg-slate-500/15 text-slate-300"}`}
          >
            {refund.status}
          </span>
        ),
      },
      {
        key: "reason",
        header: "Reason",
        className: "px-4 py-3 text-(--ink-muted)",
        render: (refund) => refund.reason ?? "-",
      },
      {
        key: "date",
        header: "Date",
        className: "px-4 py-3 text-(--ink-muted)",
        render: (refund) => formatDate(refund.created_at),
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={data.items}
      rowKeyAction={(refund) => refund.id}
      emptyMessage="No refunds found for this filter."
      search={{ value: orgFilter, placeholder: "Org ID", buttonLabel: "Filter" }}
      onSearchAction={() => refreshList(0, orgFilter)}
      onSearchChangeAction={setOrgFilter}
      pagination={{ limit: data.limit, offset: data.offset, total: data.total }}
      summaryLabel="refunds"
      onPageChangeAction={(nextOffset) => refreshList(nextOffset, orgFilter)}
      isPending={isPending}
    />
  );
}

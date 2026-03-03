"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getRefunds,
  type RefundRecord,
} from "@/lib/billing/actions";

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

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            refreshList(0, orgFilter);
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

        <p className="text-sm text-(--ink-muted)">
          Page {currentPage} of {totalPages} ({data.total} refunds)
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
            <tr>
              <th className="px-4 py-3 font-medium">Org</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--card-stroke)">
            {data.items.map((refund) => (
              <tr key={refund.id} className="hover:bg-(--card-70)/50">
                <td className="px-4 py-3 text-xs text-(--ink-muted)">{refund.org_id}</td>
                <td className="px-4 py-3 text-(--ink-muted)">{refund.invoice_id ?? "-"}</td>
                <td className="px-4 py-3 text-foreground">{formatMoney(refund.amount, refund.currency)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[refund.status] ?? "bg-slate-500/15 text-slate-300"}`}
                  >
                    {refund.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-(--ink-muted)">{refund.reason ?? "-"}</td>
                <td className="px-4 py-3 text-(--ink-muted)">{formatDate(refund.created_at)}</td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-(--ink-muted)">
                  No refunds found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => refreshList(Math.max(0, data.offset - data.limit), orgFilter)}
          disabled={isPending || data.offset === 0}
          className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => refreshList(data.offset + data.limit, orgFilter)}
          disabled={isPending || currentPage >= totalPages}
          className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </>
  );
}

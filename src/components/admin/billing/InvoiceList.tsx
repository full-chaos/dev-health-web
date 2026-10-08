"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import {
    getInvoice,
    getInvoices,
    voidInvoice,
    type InvoiceListResponse,
    type InvoiceRecord,
} from "@/lib/billing/actions";
import { UNRESOLVED } from "@/lib/labels/unresolved";
import { CTA_LABELS } from "@/lib/design/cta";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { InvoiceDetailModal } from "./InvoiceDetailModal";
import { VoidConfirmDialog } from "./VoidConfirmDialog";
import { invoiceLabel } from "./invoiceLabel";

type InvoiceListProps = {
    initialData: InvoiceListResponse;
    initialOrgFilter?: string;
    showOrgColumn?: boolean;
};

const STATUS_STYLES: Record<string, string> = {
    draft: "bg-(--card-stroke) text-(--ink-muted)",
    open: "bg-(--info)/12 text-(--info)",
    paid: "bg-(--positive)/12 text-(--positive)",
    payment_failed: "bg-(--negative)/12 text-(--negative)",
    void: "bg-(--card-stroke) text-(--ink-muted) line-through",
    voided: "bg-(--card-stroke) text-(--ink-muted) line-through",
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

    const refreshList = useCallback(
        (nextOffset = 0, nextStatus = statusFilter, nextOrgId = orgFilter) => {
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
        },
        [data.limit, orgFilter, statusFilter],
    );

    const handleOpenDetail = useCallback(
        (invoiceId: string) => {
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
        },
        [orgFilter],
    );

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
                items: prev.items.map((item) =>
                    item.id === updatedInvoice.id ? { ...item, ...updatedInvoice } : item,
                ),
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
                render: () => UNRESOLVED,
            });
        }

        nextColumns.push(
            {
                key: "invoice",
                header: "Invoice",
                className: "px-4 py-3",
                render: (invoice) => (
                    <p className="font-medium text-foreground">{invoiceLabel(invoice)}</p>
                ),
            },
            {
                key: "status",
                header: "Status",
                className: "px-4 py-3",
                render: (invoice) => (
                    <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[invoice.status] ?? "bg-(--card-stroke) text-(--ink-muted)"}`}
                    >
                        {invoice.status}
                    </span>
                ),
            },
            {
                key: "amount_due",
                header: "Amount Due",
                numeric: true,
                className: "px-4 py-3 text-foreground",
                render: (invoice) => formatMoney(invoice.amount_due, invoice.currency),
            },
            {
                key: "amount_paid",
                header: "Amount Paid",
                numeric: true,
                className: "px-4 py-3 text-foreground",
                render: (invoice) => formatMoney(invoice.amount_paid, invoice.currency),
            },
            {
                key: "issued",
                header: "Issued",
                className: "px-4 py-3 text-(--ink-muted)",
                render: (invoice) =>
                    invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : "-",
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
                                {CTA_LABELS.view}
                            </button>
                            {canVoid && (
                                <button
                                    type="button"
                                    onClick={() => setVoidingInvoice(invoice)}
                                    className="rounded-md border border-(--negative)/30 px-2.5 py-1 text-xs font-medium text-(--negative) hover:bg-(--negative)/12"
                                >
                                    {CTA_LABELS.voidInvoice}
                                </button>
                            )}
                        </div>
                    );
                },
            },
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
                accessibleLabel="Invoices"
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
                search={
                    showOrgColumn
                        ? { value: orgFilter, placeholder: "Org ID", buttonLabel: "Filter" }
                        : undefined
                }
                onSearchAction={
                    showOrgColumn ? () => refreshList(0, statusFilter, orgFilter) : undefined
                }
                onSearchChangeAction={showOrgColumn ? setOrgFilter : undefined}
            />

            <InvoiceDetailModal
                invoice={selectedInvoice}
                isOpen={isDetailOpen}
                onClose={() => setIsDetailOpen(false)}
            />
            <VoidConfirmDialog
                isOpen={voidingInvoice !== null}
                invoiceLabel={voidingInvoice ? invoiceLabel(voidingInvoice) : ""}
                isPending={isPending}
                onCancel={() => setVoidingInvoice(null)}
                onConfirm={handleVoidConfirm}
            />
        </>
    );
}

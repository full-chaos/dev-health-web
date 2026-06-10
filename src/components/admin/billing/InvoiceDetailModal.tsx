"use client";

import type { InvoiceRecord } from "@/lib/billing/actions";

type InvoiceDetailModalProps = {
    invoice: InvoiceRecord | null;
    isOpen: boolean;
    onClose: () => void;
};

function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(amount / 100);
}

export function InvoiceDetailModal({ invoice, isOpen, onClose }: InvoiceDetailModalProps) {
    if (!isOpen || !invoice) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
        >
            <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--background) shadow-2xl">
                <div className="flex items-center justify-between border-b border-(--card-stroke) px-6 py-4">
                    <div>
                        <h3 className="font-(--font-display) text-xl text-foreground">
                            Invoice Details
                        </h3>
                        <p className="text-sm text-(--ink-muted)">{invoice.stripe_invoice_id}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-sm hover:bg-(--card-70)"
                    >
                        Close
                    </button>
                </div>

                <div className="grid gap-4 border-b border-(--card-stroke) bg-(--card-80) px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <p className="text-(--ink-muted)">Status</p>
                        <p className="font-medium text-foreground">{invoice.status}</p>
                    </div>
                    <div>
                        <p className="text-(--ink-muted)">Amount Due</p>
                        <p className="font-medium text-foreground">
                            {formatMoney(invoice.amount_due, invoice.currency)}
                        </p>
                    </div>
                    <div>
                        <p className="text-(--ink-muted)">Amount Paid</p>
                        <p className="font-medium text-foreground">
                            {formatMoney(invoice.amount_paid, invoice.currency)}
                        </p>
                    </div>
                    <div>
                        <p className="text-(--ink-muted)">Customer</p>
                        <p className="font-medium text-foreground">{invoice.stripe_customer_id}</p>
                    </div>
                </div>

                <div className="max-h-[50vh] overflow-auto p-6">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-(--card-stroke) text-(--ink-muted)">
                            <tr>
                                <th className="px-3 py-2 font-medium">Description</th>
                                <th className="px-3 py-2 font-medium">Qty</th>
                                <th className="px-3 py-2 font-medium">Price ID</th>
                                <th className="px-3 py-2 font-medium text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-(--card-stroke)">
                            {invoice.line_items.map((line) => (
                                <tr key={line.id}>
                                    <td className="px-3 py-3 text-foreground">
                                        {line.description ?? "Line item"}
                                    </td>
                                    <td className="px-3 py-3 text-(--ink-muted)">
                                        {line.quantity}
                                    </td>
                                    <td className="px-3 py-3 text-(--ink-muted)">
                                        {line.stripe_price_id ?? "-"}
                                    </td>
                                    <td className="px-3 py-3 text-right font-medium text-foreground">
                                        {formatMoney(line.amount, invoice.currency)}
                                    </td>
                                </tr>
                            ))}
                            {invoice.line_items.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-3 py-6 text-center text-(--ink-muted)"
                                    >
                                        No line items found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

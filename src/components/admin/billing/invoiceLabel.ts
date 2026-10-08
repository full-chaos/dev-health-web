import type { InvoiceRecord } from "@/lib/billing/actions";

/** "Invoice" plus its created date. A billing-provider id is never a label. */
export function invoiceLabel(invoice: Pick<InvoiceRecord, "created_at">): string {
    return invoice.created_at
        ? `Invoice ${new Date(invoice.created_at).toLocaleDateString()}`
        : "Invoice";
}

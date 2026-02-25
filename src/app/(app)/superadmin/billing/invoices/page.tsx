import { AdminHeader } from "@/components/admin/AdminHeader";
import { InvoiceList } from "@/components/admin/billing/InvoiceList";
import { requireSuperuser } from "@/lib/auth";
import { getInvoices } from "@/lib/billing/actions";

export default async function AdminInvoicesPage() {
  await requireSuperuser("/superadmin/billing/invoices");

  const result = await getInvoices(20, 0);
  const invoiceData = result.data ?? { items: [], total: 0, limit: 20, offset: 0 };

  return (
    <div>
      <AdminHeader
        title="Invoices"
        description="Review billing history, inspect line items, and void unpaid invoices."
      />

      {result.error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load invoices: {result.error}
        </div>
      ) : (
        <InvoiceList initialData={invoiceData} />
      )}
    </div>
  );
}

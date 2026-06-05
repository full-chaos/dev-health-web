import { AdminHeader } from "@/components/admin/AdminHeader";
import { InvoiceList } from "@/components/admin/billing/InvoiceList";
import { requireSuperuser } from "@/lib/auth";
import { getInvoices } from "@/lib/billing/actions";

type InvoicesPageSearchParams = Promise<{ org_id?: string | string[] }>;

function firstValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

export default async function AdminInvoicesPage({
    searchParams,
}: {
    searchParams: InvoicesPageSearchParams;
}) {
    await requireSuperuser("/superadmin/billing/invoices");
    const resolvedSearchParams = await searchParams;
    const orgId = firstValue(resolvedSearchParams.org_id);

    const result = await getInvoices(20, 0, undefined, orgId);
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
                <InvoiceList
                    initialData={invoiceData}
                    initialOrgFilter={orgId ?? ""}
                    showOrgColumn
                />
            )}
        </div>
    );
}

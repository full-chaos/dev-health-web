import { AdminHeader } from "@/components/admin/AdminHeader";
import { RefundList } from "@/components/admin/billing/RefundList";
import { requireSuperuser } from "@/lib/auth";
import { getRefunds } from "@/lib/billing/actions";
import { Notice } from "@/components/ui/Notice";

type RefundsPageSearchParams = Promise<{ org_id?: string | string[] }>;

function firstValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

export default async function SuperadminRefundsPage({
    searchParams,
}: {
    searchParams: RefundsPageSearchParams;
}) {
    await requireSuperuser("/superadmin/billing/refunds");
    const resolvedSearchParams = await searchParams;
    const orgId = firstValue(resolvedSearchParams.org_id);

    const result = await getRefunds({ limit: 20, offset: 0 }, orgId);
    const initialData = result.data ?? { items: [], total: 0, limit: 20, offset: 0 };

    return (
        <div>
            <AdminHeader
                title="Refunds"
                description="Review refunds by organization, monitor status, and inspect amount and reason trends."
            />

            {result.error ? (
                <Notice variant="danger" live={false}>
                    Failed to load refunds: {result.error}
                </Notice>
            ) : (
                <RefundList initialData={initialData} initialOrgFilter={orgId ?? ""} />
            )}
        </div>
    );
}

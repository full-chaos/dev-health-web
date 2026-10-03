import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubscriptionList } from "@/components/admin/billing/SubscriptionList";
import { requireSuperuser } from "@/lib/auth";
import { getSubscriptions } from "@/lib/billing/actions";
import { Notice } from "@/components/ui/Notice";

type SubscriptionsPageSearchParams = Promise<{ org_id?: string | string[] }>;

function firstValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

export default async function SuperadminSubscriptionsPage({
    searchParams,
}: {
    searchParams: SubscriptionsPageSearchParams;
}) {
    await requireSuperuser("/superadmin/billing/subscriptions");
    const resolvedSearchParams = await searchParams;
    const orgId = firstValue(resolvedSearchParams.org_id);

    const result = await getSubscriptions(20, 0, orgId);
    const initialData = result.data ?? { items: [], total: 0, limit: 20, offset: 0 };

    return (
        <div>
            <AdminHeader
                title="Subscriptions"
                description="Track active plans, renewal windows, and cancellation states across organizations."
            />

            {result.error ? (
                <Notice variant="danger" live={false}>
                    Failed to load subscriptions. {READ_FAILED_MESSAGE}
                </Notice>
            ) : (
                <SubscriptionList initialData={initialData} initialOrgFilter={orgId ?? ""} />
            )}
        </div>
    );
}

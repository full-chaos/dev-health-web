import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubscriptionList } from "@/components/admin/billing/SubscriptionList";
import { requireSuperuser } from "@/lib/auth";
import { getSubscriptions } from "@/lib/billing/actions";

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
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load subscriptions: {result.error}
        </div>
      ) : (
        <SubscriptionList initialData={initialData} initialOrgFilter={orgId ?? ""} />
      )}
    </div>
  );
}

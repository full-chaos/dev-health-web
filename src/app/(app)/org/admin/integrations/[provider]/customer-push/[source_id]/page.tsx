import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushSourceOverview } from "@/components/admin/integrations/customer-push/CustomerPushSourceOverview";
import { getCustomerPushSource } from "@/lib/admin/server";

export default async function CustomerPushSourceOverviewPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string }>;
}) {
    const { provider, source_id: sourceId } = await params;
    const sourceResult = await getCustomerPushSource(sourceId);

    if (sourceResult.error || !sourceResult.data) {
        notFound();
    }

    const source = sourceResult.data;

    return (
        <div className="space-y-6">
            <BackLink href={`/org/admin/integrations/${provider}`} area="Integrations" />

            <AdminHeader
                title={source.display_name || source.instance}
                description={`Customer-push source · ${source.instance}`}
            />

            <CustomerPushSourceOverview provider={provider} source={source} />
        </div>
    );
}

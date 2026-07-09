import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { BackLink } from "@/components/shared/BackLink";
import { CreateCustomerPushTokenForm } from "@/components/admin/integrations/customer-push/CreateCustomerPushTokenForm";
import { CustomerPushLockedPreview } from "@/components/admin/integrations/customer-push/CustomerPushLockedPreview";
import { getCustomerPushIngestEntitlement, getCustomerPushSource } from "@/lib/admin/server";
import {
    CUSTOMER_PUSH_INGEST_FEATURE,
    CUSTOMER_PUSH_INGEST_REQUIRED_TIER,
} from "@/lib/billing/features";

export default async function NewCustomerPushTokenPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string }>;
}) {
    const { provider, source_id: sourceId } = await params;
    const entitlement = await getCustomerPushIngestEntitlement();

    if (entitlement.data?.enabled !== true) {
        return (
            <UpgradeGate
                feature={CUSTOMER_PUSH_INGEST_FEATURE}
                requiredTier={CUSTOMER_PUSH_INGEST_REQUIRED_TIER}
                currentTier={entitlement.data?.tier ?? "community"}
                features={entitlement.data?.features ?? {}}
            >
                <CustomerPushLockedPreview />
            </UpgradeGate>
        );
    }

    const sourceResult = await getCustomerPushSource(sourceId);

    if (sourceResult.error || !sourceResult.data) {
        notFound();
    }

    const basePath = `/org/admin/integrations/${provider}/customer-push/${sourceId}`;
    const displayName = sourceResult.data.display_name || sourceResult.data.instance;

    return (
        <div className="space-y-6">
            <BackLink href={`${basePath}/credentials`} area="Credentials" />

            <AdminHeader
                title="Create ingest credential"
                description={`Generate a token scoped to ${displayName}.`}
            />

            <CreateCustomerPushTokenForm
                sourceId={sourceId}
                examplesHref={`${basePath}/examples`}
                credentialsHref={`${basePath}/credentials`}
            />
        </div>
    );
}

import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { BackLink } from "@/components/shared/BackLink";
import { CreateCustomerPushSourceForm } from "@/components/admin/integrations/customer-push/CreateCustomerPushSourceForm";
import { CustomerPushLockedPreview } from "@/components/admin/integrations/customer-push/CustomerPushLockedPreview";
import { getCustomerPushIngestEntitlement } from "@/lib/admin/server";
import {
    CUSTOMER_PUSH_INGEST_FEATURE,
    CUSTOMER_PUSH_INGEST_REQUIRED_TIER,
} from "@/lib/billing/features";

const PROVIDER_NAMES: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    custom: "Custom",
};

export default async function NewCustomerPushSourcePage({
    params,
}: {
    params: Promise<{ provider: string }>;
}) {
    const { provider } = await params;
    const providerName = PROVIDER_NAMES[provider];

    if (!providerName) {
        notFound();
    }

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

    return (
        <div className="space-y-6">
            <BackLink href={`/org/admin/integrations/${provider}`} area="Integrations" />

            <AdminHeader
                title={`Create ${providerName} customer-push source`}
                description="Register a source instance that will push data instead of granting FullChaos provider credentials."
            />

            <CreateCustomerPushSourceForm provider={provider} providerName={providerName} />
        </div>
    );
}

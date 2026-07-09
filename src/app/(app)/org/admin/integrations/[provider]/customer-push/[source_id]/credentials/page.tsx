import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushTokenList } from "@/components/admin/integrations/customer-push/CustomerPushTokenList";
import { CustomerPushLockedPreview } from "@/components/admin/integrations/customer-push/CustomerPushLockedPreview";
import {
    getCustomerPushIngestEntitlement,
    getCustomerPushSource,
    listCustomerPushTokens,
} from "@/lib/admin/server";
import {
    CUSTOMER_PUSH_INGEST_FEATURE,
    CUSTOMER_PUSH_INGEST_REQUIRED_TIER,
} from "@/lib/billing/features";

export default async function CustomerPushCredentialsPage({
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

    const [sourceResult, tokensResult] = await Promise.all([
        getCustomerPushSource(sourceId),
        listCustomerPushTokens(sourceId),
    ]);

    if (sourceResult.error || !sourceResult.data) {
        notFound();
    }

    const basePath = `/org/admin/integrations/${provider}/customer-push/${sourceId}`;
    const displayName = sourceResult.data.display_name || sourceResult.data.instance;
    const tokens = tokensResult.data ?? [];

    return (
        <div className="space-y-6">
            <BackLink href={basePath} area={displayName} />

            <AdminHeader title="Credentials" description={`Ingest tokens for ${displayName}.`} />

            {tokensResult.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
                    Failed to load credentials: {tokensResult.error}
                </div>
            )}

            <CustomerPushTokenList
                tokens={tokens}
                newTokenHref={`${basePath}/credentials/new`}
                examplesHref={`${basePath}/examples`}
            />
        </div>
    );
}

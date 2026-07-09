import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushBatchDetailLive } from "@/components/admin/integrations/customer-push/CustomerPushBatchDetailLive";
import { CustomerPushLockedPreview } from "@/components/admin/integrations/customer-push/CustomerPushLockedPreview";
import {
    getCustomerPushBatch,
    getCustomerPushIngestEntitlement,
    getCustomerPushSource,
} from "@/lib/admin/server";
import {
    CUSTOMER_PUSH_INGEST_FEATURE,
    CUSTOMER_PUSH_INGEST_REQUIRED_TIER,
} from "@/lib/billing/features";

export default async function CustomerPushBatchDetailPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string; ingestion_id: string }>;
}) {
    const { provider, source_id: sourceId, ingestion_id: ingestionId } = await params;
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

    const [batchResult, sourceResult] = await Promise.all([
        getCustomerPushBatch(ingestionId),
        getCustomerPushSource(sourceId),
    ]);

    if (batchResult.error || !batchResult.data) {
        notFound();
    }

    // The backend get-batch contract is org+ingestion scoped, not source
    // scoped — enforce the URL's source scope here so a copied/guessed
    // ingestion_id can't render another source's batch under this source's
    // path (adversarial-review finding).
    if (
        sourceResult.error ||
        !sourceResult.data ||
        batchResult.data.source_system !== sourceResult.data.system ||
        batchResult.data.source_instance !== sourceResult.data.instance
    ) {
        notFound();
    }

    const basePath = `/org/admin/integrations/${provider}/customer-push/${sourceId}`;

    return (
        <div className="space-y-6">
            <BackLink href={`${basePath}/batches`} area="Ingest status" />

            <AdminHeader
                title="Batch detail"
                description="Status, record counts, and rejected records for this batch."
            />

            <CustomerPushBatchDetailLive initialBatch={batchResult.data} />
        </div>
    );
}

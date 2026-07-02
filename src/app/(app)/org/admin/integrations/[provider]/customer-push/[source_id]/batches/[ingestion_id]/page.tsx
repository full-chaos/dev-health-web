import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushBatchDetailLive } from "@/components/admin/integrations/customer-push/CustomerPushBatchDetailLive";
import { getCustomerPushBatch, getCustomerPushSource } from "@/lib/admin/server";

export default async function CustomerPushBatchDetailPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string; ingestion_id: string }>;
}) {
    const { provider, source_id: sourceId, ingestion_id: ingestionId } = await params;
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

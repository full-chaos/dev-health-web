import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushBatchDetailLive } from "@/components/admin/integrations/customer-push/CustomerPushBatchDetailLive";
import { getCustomerPushBatch } from "@/lib/admin/server";

export default async function CustomerPushBatchDetailPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string; ingestion_id: string }>;
}) {
    const { provider, source_id: sourceId, ingestion_id: ingestionId } = await params;
    const batchResult = await getCustomerPushBatch(ingestionId);

    if (batchResult.error || !batchResult.data) {
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

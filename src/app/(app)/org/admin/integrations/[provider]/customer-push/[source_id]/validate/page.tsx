import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { ValidatePayloadPanel } from "@/components/admin/integrations/customer-push/ValidatePayloadPanel";
import { getCustomerPushSource } from "@/lib/admin/server";

export default async function CustomerPushValidatePage({
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
    const basePath = `/org/admin/integrations/${provider}/customer-push/${sourceId}`;

    return (
        <div className="space-y-6">
            <BackLink href={basePath} area={source.display_name || source.instance} />

            <AdminHeader
                title="Validate payload"
                description="Check a payload against the schema before your first push. This does not push data."
            />

            <ValidatePayloadPanel
                sourceId={sourceId}
                sourceSystem={source.system}
                sourceInstance={source.instance}
            />
        </div>
    );
}

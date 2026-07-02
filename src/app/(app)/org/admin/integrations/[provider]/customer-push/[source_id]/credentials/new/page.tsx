import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CreateCustomerPushTokenForm } from "@/components/admin/integrations/customer-push/CreateCustomerPushTokenForm";
import { getCustomerPushSource } from "@/lib/admin/server";

export default async function NewCustomerPushTokenPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string }>;
}) {
    const { provider, source_id: sourceId } = await params;
    const sourceResult = await getCustomerPushSource(sourceId);

    if (sourceResult.error || !sourceResult.data) {
        notFound();
    }

    const basePath = `/org/admin/integrations/${provider}/customer-push/${sourceId}`;

    return (
        <div className="space-y-6">
            <BackLink href={`${basePath}/credentials`} area="Credentials" />

            <AdminHeader
                title="Create ingest credential"
                description={`Generate a token scoped to ${sourceResult.data.display_name || sourceResult.data.instance}.`}
            />

            <CreateCustomerPushTokenForm
                sourceId={sourceId}
                examplesHref={`${basePath}/examples`}
                credentialsHref={`${basePath}/credentials`}
            />
        </div>
    );
}

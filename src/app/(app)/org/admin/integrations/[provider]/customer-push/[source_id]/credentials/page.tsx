import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushTokenList } from "@/components/admin/integrations/customer-push/CustomerPushTokenList";
import { getCustomerPushSource, listCustomerPushTokens } from "@/lib/admin/server";

export default async function CustomerPushCredentialsPage({
    params,
}: {
    params: Promise<{ provider: string; source_id: string }>;
}) {
    const { provider, source_id: sourceId } = await params;
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

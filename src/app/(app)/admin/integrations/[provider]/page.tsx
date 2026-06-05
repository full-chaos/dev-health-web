import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProviderCredentialsList } from "@/components/admin/integrations/ProviderCredentialsList";
import { listCredentials, listSyncConfigs } from "@/lib/admin/server";
import type { Provider } from "@/lib/admin/types";

const PROVIDERS: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    launchdarkly: "LaunchDarkly",
};

export default async function IntegrationPage({
    params,
}: {
    params: Promise<{ provider: string }>;
}) {
    const { provider } = await params;
    const providerName = PROVIDERS[provider];

    if (!providerName) {
        notFound();
    }

    const [credentialsResult, syncConfigsResult] = await Promise.all([
        listCredentials(),
        listSyncConfigs(),
    ]);

    const credentials = (credentialsResult.data ?? []).filter((c) => c.provider === provider);
    const syncConfigs = syncConfigsResult.data ?? [];

    return (
        <div>
            <AdminHeader
                title={`${providerName} Integration`}
                description={`Manage your ${providerName} connections and credentials.`}
            />

            {credentialsResult.error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load credentials: {credentialsResult.error}
                </div>
            )}

            <ProviderCredentialsList
                provider={provider as Provider}
                providerName={providerName}
                credentials={credentials}
                syncConfigs={syncConfigs}
            />
        </div>
    );
}

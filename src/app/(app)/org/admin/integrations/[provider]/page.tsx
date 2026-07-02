import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProviderCredentialsList } from "@/components/admin/integrations/ProviderCredentialsList";
import {
    GitHubAppConnect,
    type GitHubAppConnectResult,
} from "@/components/admin/integrations/GitHubAppConnect";
import { ModeCards } from "@/components/admin/integrations/customer-push/ModeCards";
import { CustomerPushSourceList } from "@/components/admin/integrations/customer-push/CustomerPushSourceList";
import { listCredentials, listSyncConfigs, listCustomerPushSources } from "@/lib/admin/server";
import type { Provider } from "@/lib/admin/types";

// Intentionally drifted from `types.ts`'s `PROVIDERS`/`PROVIDER_LABELS` (see
// docs/providers-integration.md) — this page-local map also carries the
// customer-push-only `custom` pseudo-provider (D3), which must NOT be added
// to the managed-sync `Provider` union.
const PROVIDERS: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    launchdarkly: "LaunchDarkly",
    custom: "Custom",
};

// LaunchDarkly has no customer-push mode in v1 (D4) — it isn't in the epic's
// v1 source-system list, so the provider page renders only its managed-sync
// form, unchanged.
const CUSTOMER_PUSH_ENABLED_PROVIDERS = new Set(["github", "gitlab", "jira", "linear", "custom"]);

export default async function IntegrationPage({
    params,
    searchParams,
}: {
    params: Promise<{ provider: string }>;
    searchParams: Promise<{ github_app?: string | string[] }>;
}) {
    const { provider } = await params;
    const { github_app: githubApp } = await searchParams;
    const githubAppResult: GitHubAppConnectResult | undefined =
        githubApp === "connected" || githubApp === "error" ? githubApp : undefined;
    const providerName = PROVIDERS[provider];

    if (!providerName) {
        notFound();
    }

    const isCustomProvider = provider === "custom";
    const supportsCustomerPush = CUSTOMER_PUSH_ENABLED_PROVIDERS.has(provider);

    const [credentialsResult, syncConfigsResult, customerPushSourcesResult] = await Promise.all([
        listCredentials(),
        listSyncConfigs(),
        supportsCustomerPush ? listCustomerPushSources(provider) : Promise.resolve(undefined),
    ]);

    const credentials = (credentialsResult.data ?? []).filter((c) => c.provider === provider);
    const syncConfigs = syncConfigsResult.data ?? [];
    const customerPushSources = customerPushSourcesResult?.data ?? [];

    return (
        <div>
            <AdminHeader
                title={`${providerName} Integration`}
                description={
                    isCustomProvider
                        ? "Manage your custom customer-push sources."
                        : `Manage your ${providerName} connections and ingestion mode.`
                }
            />

            {credentialsResult.error && !isCustomProvider && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load credentials: {credentialsResult.error}
                </div>
            )}

            {customerPushSourcesResult?.error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load customer-push sources: {customerPushSourcesResult.error}
                </div>
            )}

            {supportsCustomerPush && (
                <ModeCards
                    provider={provider}
                    providerName={providerName}
                    showManagedSync={!isCustomProvider}
                    customerPushSourceCount={customerPushSources.length}
                />
            )}

            {!isCustomProvider && (
                <div id="managed-sync-credentials" className="space-y-8">
                    {provider === "github" && <GitHubAppConnect result={githubAppResult} />}

                    <ProviderCredentialsList
                        provider={provider as Provider}
                        providerName={providerName}
                        credentials={credentials}
                        syncConfigs={syncConfigs}
                    />
                </div>
            )}

            {supportsCustomerPush && (
                <div className="mt-8">
                    <CustomerPushSourceList
                        provider={provider}
                        providerName={providerName}
                        sources={customerPushSources}
                    />
                </div>
            )}
        </div>
    );
}

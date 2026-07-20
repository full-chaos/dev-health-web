import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { ProviderCredentialsList } from "@/components/admin/integrations/ProviderCredentialsList";
import { PagerDutySetup } from "@/components/admin/integrations/PagerDutySetup";
import {
    GitHubAppConnect,
    type GitHubAppConnectResult,
} from "@/components/admin/integrations/GitHubAppConnect";
import { ModeCards } from "@/components/admin/integrations/customer-push/ModeCards";
import { CustomerPushLockedPreview } from "@/components/admin/integrations/customer-push/CustomerPushLockedPreview";
import { CustomerPushSourceList } from "@/components/admin/integrations/customer-push/CustomerPushSourceList";
import {
    getCustomerPushIngestEntitlement,
    listCredentials,
    listCustomerPushSources,
    listSyncConfigs,
} from "@/lib/admin/server";
import {
    CUSTOMER_PUSH_INGEST_FEATURE,
    CUSTOMER_PUSH_INGEST_REQUIRED_TIER,
} from "@/lib/billing/features";
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
    pagerduty: "PagerDuty",
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

    const [credentialsResult, syncConfigsResult, customerPushEntitlementResult] = await Promise.all(
        [
            listCredentials(),
            listSyncConfigs(),
            supportsCustomerPush ? getCustomerPushIngestEntitlement() : Promise.resolve(undefined),
        ],
    );
    const customerPushEnabled =
        supportsCustomerPush && customerPushEntitlementResult?.data?.enabled === true;
    const customerPushSourcesResult = customerPushEnabled
        ? await listCustomerPushSources(provider)
        : undefined;

    const credentials = (credentialsResult.data ?? []).filter((c) => c.provider === provider);
    const syncConfigs = syncConfigsResult.data ?? [];
    const customerPushSources = customerPushSourcesResult?.data ?? [];

    return (
        <div className="space-y-6">
            <AdminHeader
                title={providerName}
                description={
                    isCustomProvider
                        ? "Manage your custom customer-push sources."
                        : `Manage ${providerName} credentials and connections.`
                }
            />

            {credentialsResult.error && !isCustomProvider && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load credentials: {credentialsResult.error}
                </div>
            )}

            {/* CHAOS-2837: never a standalone install-card CTA on this page —
                setup (including the recommended GitHub App path) routes entirely
                through the Add Provider wizard below. This banner only ever
                surfaces the OAuth-callback result (connected/error) when the
                browser lands back here after the install round trip. */}
            {provider === "github" && githubAppResult && (
                <GitHubAppConnect result={githubAppResult} variant="banner-only" />
            )}

            {customerPushEnabled && customerPushSourcesResult?.error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load customer-push sources: {customerPushSourcesResult.error}
                </div>
            )}

            {supportsCustomerPush && (!isCustomProvider || customerPushEnabled) && (
                <ModeCards
                    provider={provider}
                    providerName={providerName}
                    showManagedSync={!isCustomProvider}
                    showCustomerPush={customerPushEnabled}
                    customerPushSourceCount={customerPushSources.length}
                />
            )}

            {supportsCustomerPush && !customerPushEnabled && (
                <UpgradeGate
                    feature={CUSTOMER_PUSH_INGEST_FEATURE}
                    requiredTier={CUSTOMER_PUSH_INGEST_REQUIRED_TIER}
                    currentTier={customerPushEntitlementResult?.data?.tier ?? "community"}
                    features={customerPushEntitlementResult?.data?.features ?? {}}
                >
                    <CustomerPushLockedPreview />
                </UpgradeGate>
            )}

            {provider === "pagerduty" ? (
                <PagerDutySetup credentials={credentials} />
            ) : !isCustomProvider ? (
                <div id="managed-sync-credentials" className="space-y-8">
                    <ProviderCredentialsList
                        provider={provider as Provider}
                        providerName={providerName}
                        credentials={credentials}
                        syncConfigs={syncConfigs}
                    />
                </div>
            ) : null}

            {customerPushEnabled && (
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

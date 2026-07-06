import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProviderCredentialsList } from "@/components/admin/integrations/ProviderCredentialsList";
import {
    GitHubAppConnect,
    type GitHubAppConnectResult,
} from "@/components/admin/integrations/GitHubAppConnect";
import { hasConnectedGitHubApp } from "@/components/admin/integrations/authMethod";
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

    const [credentialsResult, syncConfigsResult] = await Promise.all([
        listCredentials(),
        listSyncConfigs(),
    ]);

    const credentials = (credentialsResult.data ?? []).filter((c) => c.provider === provider);
    const syncConfigs = syncConfigsResult.data ?? [];

    const showGitHubAppCta = provider === "github" && !hasConnectedGitHubApp(credentials);

    return (
        <div className="space-y-6">
            <AdminHeader
                title={providerName}
                description={`Manage ${providerName} credentials and connections.`}
            />

            {credentialsResult.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load credentials: {credentialsResult.error}
                </div>
            )}

            {/* CHAOS-2837 AC4 (hard non-goal): banner-only when a GitHub App
                is already connected — the one-click install CTA never renders
                again once a credential exists; the Add Provider wizard is the
                only place a fresh install CTA can appear, and it applies the
                same suppression rule. */}
            {provider === "github" && (
                <GitHubAppConnect
                    result={githubAppResult}
                    variant={showGitHubAppCta ? "card" : "banner-only"}
                />
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

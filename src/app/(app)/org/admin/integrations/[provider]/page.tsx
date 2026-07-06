import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProviderCredentialsList } from "@/components/admin/integrations/ProviderCredentialsList";
import {
    GitHubAppConnect,
    type GitHubAppConnectResult,
} from "@/components/admin/integrations/GitHubAppConnect";
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

            {/* CHAOS-2837: never a standalone install-card CTA on this page —
                setup (including the recommended GitHub App path) routes entirely
                through the Add Provider wizard below. This banner only ever
                surfaces the OAuth-callback result (connected/error) when the
                browser lands back here after the install round trip. */}
            {provider === "github" && githubAppResult && (
                <GitHubAppConnect result={githubAppResult} variant="banner-only" />
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

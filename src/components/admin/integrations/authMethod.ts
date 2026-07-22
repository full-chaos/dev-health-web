/**
 * Auth-method derivation for provider credentials (CHAOS-2837).
 *
 * A credential's authentication method is derived purely from persisted,
 * backend-verified fields — never invented. GitHub App credentials are the
 * one auth method the backend marks explicitly: the install-callback route
 * (dev-health-ops `api/admin/routers/github_app.py`) persists
 * `config.auth_mode === "github_app"` on a credential named `"github-app"`.
 * Every other provider currently supports exactly one credential shape
 * (personal access token / API token / API key / service token), so the
 * label is a static provider lookup — still backend-shape-accurate, not a
 * fabricated field.
 */
import type { IntegrationCredential, Provider } from "@/lib/admin/types";
import type { AddProviderMethod } from "./addProviderWizardSteps";

/** True when a credential is the one-click GitHub App installation credential. */
export function isGitHubAppCredential(credential: IntegrationCredential): boolean {
    return credential.provider === "github" && credential.config?.auth_mode === "github_app";
}

/**
 * True when a GitHub App credential already EXISTS among the given
 * credentials — active or not. Drives the hard non-goal (CHAOS-2837 AC4):
 * `Connect GitHub App` must never render again once this is true, because
 * re-running the one-click install would try to create a second `github-app`
 * credential the backend would just upsert over the first (see
 * `IntegrationCredentialsService.set`, which is a per-`(provider, name)`
 * upsert) — an inactive record still means the org already went through
 * install once and the UI must route them to re-activating/re-installing it,
 * never a fresh "Connect GitHub App" CTA.
 */
export function hasGitHubAppCredential(credentials: IntegrationCredential[]): boolean {
    return credentials.some((c) => isGitHubAppCredential(c));
}

/** Non-GitHub-App auth method label per provider (single shape today). */
const MANUAL_AUTH_METHOD_LABEL: Record<Provider, string> = {
    github: "Personal access token",
    gitlab: "Personal access token",
    jira: "API token",
    linear: "API key",
    launchdarkly: "Service token",
    pagerduty: "Not recorded",
};

function getPagerDutyAuthMethodLabel(credential: IntegrationCredential): string {
    switch (credential.config.auth_mode) {
        case "oauth":
            return "OAuth";
        case "client_credentials":
            return "Client credentials";
        case "api_token":
            return "API token";
        default:
            return MANUAL_AUTH_METHOD_LABEL.pagerduty;
    }
}

/** Customer-safe auth-method label for a credential (provider table / rows). */
export function getAuthMethodLabel(provider: Provider, credential: IntegrationCredential): string {
    if (isGitHubAppCredential(credential)) return "GitHub App";
    if (provider === "pagerduty") return getPagerDutyAuthMethodLabel(credential);
    return MANUAL_AUTH_METHOD_LABEL[provider];
}

/**
 * The manual (non-GitHub-App) auth-method label for a provider, without
 * needing a credential instance — used by the Add Provider wizard's review
 * step while the credential hasn't been created yet.
 */
export function getManualAuthMethodLabel(
    provider: Provider,
    method?: AddProviderMethod | null,
): string {
    if (provider === "pagerduty") {
        switch (method) {
            case "pagerduty_oauth":
                return "OAuth";
            case "pagerduty_client_credentials":
                return "Client credentials";
            case "pagerduty_api_token":
                return "API token";
            default:
                return MANUAL_AUTH_METHOD_LABEL.pagerduty;
        }
    }
    return MANUAL_AUTH_METHOD_LABEL[provider];
}

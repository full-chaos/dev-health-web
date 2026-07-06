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

/** True when a credential is the one-click GitHub App installation credential. */
export function isGitHubAppCredential(credential: IntegrationCredential): boolean {
    return credential.provider === "github" && credential.config?.auth_mode === "github_app";
}

/**
 * True when an active GitHub App credential already exists among the given
 * credentials. Drives the hard non-goal (CHAOS-2837 AC4): `Connect GitHub
 * App` must never render once this is true.
 */
export function hasConnectedGitHubApp(credentials: IntegrationCredential[]): boolean {
    return credentials.some((c) => isGitHubAppCredential(c) && c.is_active);
}

/** Non-GitHub-App auth method label per provider (single shape today). */
const MANUAL_AUTH_METHOD_LABEL: Record<Provider, string> = {
    github: "Personal access token",
    gitlab: "Personal access token",
    jira: "API token",
    linear: "API key",
    launchdarkly: "Service token",
};

/** Customer-safe auth-method label for a credential (provider table / rows). */
export function getAuthMethodLabel(provider: Provider, credential: IntegrationCredential): string {
    if (isGitHubAppCredential(credential)) return "GitHub App";
    return MANUAL_AUTH_METHOD_LABEL[provider];
}

/**
 * The manual (non-GitHub-App) auth-method label for a provider, without
 * needing a credential instance — used by the Add Provider wizard's review
 * step while the credential hasn't been created yet.
 */
export function getManualAuthMethodLabel(provider: Provider): string {
    return MANUAL_AUTH_METHOD_LABEL[provider];
}

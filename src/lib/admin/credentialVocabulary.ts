import type { Provider } from "./types";

/**
 * Credential keys the ops side can resolve, per provider.
 *
 * Mirrors `dev-health-ops/src/dev_health_ops/credentials/resolver.py`'s
 * `*_credentials_from_mapping` readers — what the SYNC RUNTIME can read —
 * plus the camelCase spellings `api/services/configuration/_helpers.py`
 * normalizes on save. Deliberately narrower than what `/credentials/test`
 * tolerates: a key the connection probe accepts but the runtime cannot read
 * buys a green check and a sync that never authenticates, which is exactly
 * how CHAOS-4224 stayed invisible.
 *
 * A key absent from this set is silently dropped at every layer. Nothing
 * generates this file yet, so it can drift from the resolver the same way the
 * forms did; the durable fix is an ops-published contract artifact that the
 * web checks against, tracked separately.
 *
 * The Jira `token`/`server_url` entries depend on the alias-on-read landing in
 * dev-health-ops#1897 first. Until it does they are aspirational, which is the
 * merge order these two changes already require.
 */
export const RESOLVABLE_CREDENTIAL_KEYS: Record<Provider, readonly string[]> = {
    github: [
        "token",
        "org",
        "app_id",
        "appId",
        "private_key",
        "privateKey",
        "private_key_path",
        "privateKeyPath",
        "installation_id",
        "installationId",
        "base_url",
        "baseUrl",
    ],
    gitlab: ["token", "gitlab_url", "url", "base_url", "baseUrl"],
    jira: ["email", "api_token", "apiToken", "token", "url", "base_url", "baseUrl", "server_url"],
    linear: ["api_key", "apiKey"],
    launchdarkly: ["api_key", "project_key", "environment"],
    pagerduty: [
        "auth_mode",
        "authMode",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "expires_at",
        "granted_scopes",
        "grantedScopes",
        "client_id",
        "clientId",
        "client_secret",
        "clientSecret",
        "api_token",
        "apiToken",
        "oauth_credential_name",
        "oauthCredentialName",
        "oauth_binding_id",
        "oauthBindingId",
        "account_id",
        "accountId",
        "subdomain",
        "region",
    ],
} as const;

/** Keys a provider form submits that no reader consumes. */
export function unresolvableCredentialKeys(
    provider: Provider,
    submitted: Record<string, unknown>,
): string[] {
    const accepted = RESOLVABLE_CREDENTIAL_KEYS[provider];
    return Object.keys(submitted).filter((key) => !accepted.includes(key));
}

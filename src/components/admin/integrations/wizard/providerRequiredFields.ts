import type { Provider } from "@/lib/admin/types";

/**
 * The single field name that must be filled in for `testConnection` to have
 * any chance of succeeding for each provider's manual credential form
 * (`ProviderForms.tsx`). Other fields (org, group, project keys, timezone-ish
 * metadata) are contextual and intentionally not gating — matching the
 * provider forms' existing "most fields optional, credential required"
 * shape rather than inventing new required-field rules.
 */
export const PROVIDER_PRIMARY_FIELD: Record<Provider, string> = {
    github: "token",
    gitlab: "token",
    jira: "token",
    linear: "apiKey",
    launchdarkly: "api_key",
    pagerduty: "api_token",
};

/**
 * Whether the captured field values satisfy the minimum for
 * `testConnection` to have any chance of succeeding.
 *
 * GitHub is special-cased: the backend accepts EITHER a personal access
 * token OR a complete GitHub App triple (`app_id` + `private_key` +
 * `installation_id`) — see `_github_credentials_or_400` in
 * `dev-health-ops/api/admin/routers/credentials.py`. The manual GitHub App
 * fields live behind `ProviderForms.tsx`'s collapsed "Advanced" disclosure
 * with the token field left blank, so gating on the token alone would make
 * a valid App-triple credential permanently unable to pass this step.
 */
export function hasPrimaryCredentialField(
    provider: Provider,
    fieldValues: Record<string, string>,
): boolean {
    if (provider === "github") {
        const hasToken = Boolean(fieldValues.token?.trim());
        const hasAppTriple =
            Boolean(fieldValues.appId?.trim()) &&
            Boolean(fieldValues.installationId?.trim()) &&
            Boolean(fieldValues.privateKey?.trim());
        return hasToken || hasAppTriple;
    }
    const value = fieldValues[PROVIDER_PRIMARY_FIELD[provider]];
    return Boolean(value && value.trim());
}

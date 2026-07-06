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
};

/** Whether the captured field values contain a non-blank primary credential field. */
export function hasPrimaryCredentialField(
    provider: Provider,
    fieldValues: Record<string, string>,
): boolean {
    const value = fieldValues[PROVIDER_PRIMARY_FIELD[provider]];
    return Boolean(value && value.trim());
}

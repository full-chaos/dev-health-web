export type CredentialKind = "external_push" | "integration";

export const CREDENTIAL_KIND_LABELS: Record<CredentialKind, string> = {
    external_push: "External Push",
    integration: "Integration",
};

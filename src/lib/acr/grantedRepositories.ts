// The repositories a device or consent approval will grant, as the approval pages state them (CHAOS-14134). Shared by
// the server answers and the client forms, so it holds no server import.

/**
 * `grantedRepositories` on the web-internal answers of POST /api/acr/device (preview and approve) and on the consent
 * page's review step. The server builds it from the repository scopes of the same credential:issue authorization it
 * sends to ACR (`["*"]` = organization, otherwise the named keys); the browser never sends it back. Display only.
 */
export type GrantedRepositories =
    | { readonly kind: "organization" }
    | { readonly kind: "repositories"; readonly repositories: readonly string[] };

/**
 * `scopeFingerprint` rides next to `grantedRepositories`: "organization", or "sha256:" + the hex SHA-256 of the sorted
 * keys joined by "\n". The page sends it back as `scope_fingerprint` on approve; the server decides the scopes again
 * and refuses SCOPE_CHANGED_CODE when the fingerprint of the new set differs, so a person never approves a set the
 * page did not show.
 */
export const SCOPE_CHANGED_CODE = "scope_changed_review_again";
export const SCOPE_CHANGED_MESSAGE =
    "The repositories this approval covers changed. Review the updated request, then approve again.";

export function repositoryCountLabel(count: number): string {
    return count === 1 ? "1 repository" : `${count} repositories`;
}

/** The client-side read of an answer's `grantedRepositories`; anything malformed is undefined. */
export function parseGrantedRepositories(value: unknown): GrantedRepositories | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const kind = (value as { kind?: unknown }).kind;
    if (kind === "organization") return { kind };
    if (kind !== "repositories") return undefined;
    const repositories = (value as { repositories?: unknown }).repositories;
    if (
        !Array.isArray(repositories) ||
        repositories.length === 0 ||
        !repositories.every((key) => typeof key === "string")
    ) {
        return undefined;
    }
    return { kind, repositories };
}

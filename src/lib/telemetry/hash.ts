/**
 * Shared identifier-hashing primitives for the product-telemetry pipeline.
 *
 * Raw org/user identifiers are never emitted: they are pseudonymised here before
 * leaving the browser. {@link hashIdentifier} prefers SHA-256 (via SubtleCrypto)
 * and falls back to the synchronous FNV-1a {@link fallbackHash} when SubtleCrypto
 * is unavailable (older browsers, insecure contexts) or when the caller must stay
 * synchronous (e.g. a `sendBeacon` emit that has to survive a full-page
 * navigation).
 */

/** Synchronous, dependency-free FNV-1a hash. Stable per input; not reversible. */
export function fallbackHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** SHA-256 hex digest when SubtleCrypto is available, else {@link fallbackHash}. */
export async function hashIdentifier(input: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        return fallbackHash(input);
    }
    const encoded = new TextEncoder().encode(input);
    const digest = await subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Shared identifier-hashing primitive for the product-telemetry pipeline.
 *
 * Raw org/user identifiers are never emitted: they are pseudonymised here before
 * leaving the browser. {@link hashIdentifier} returns a SHA-256 digest (via
 * SubtleCrypto) and `null` when SubtleCrypto is unavailable (older browsers, insecure
 * contexts): no weaker hash is made, so a caller sends no identifier-derived value.
 */

/** SHA-256 hex digest, or null when SubtleCrypto is not available. */
export async function hashIdentifier(input: string): Promise<string | null> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        return null;
    }
    const encoded = new TextEncoder().encode(input);
    const digest = await subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Canonical AI attribution-bucket identity helpers (CHAOS-2225).
 *
 * The platform has TWO bucket vocabularies:
 * - GraphQL INPUT (`AIAttributionBucketInput` enum): UPPERCASE wire values
 *   (`AI_ASSISTED`, `AGENT_CREATED`, …) — used only in filter variables sent
 *   to the backend.
 * - GraphQL OUTPUT (`bucket: String!` on every row type): lowercase
 *   snake_case strings (`ai_assisted`, `agent_created`, `human`, `unknown`,
 *   `ai_review`) — ClickHouse `attribution_bucket` values passed through the
 *   resolvers verbatim.
 *
 * Never compare a row's `bucket` to a raw literal — uppercase comparisons
 * pass against uppercase mocks and silently fail against the real backend.
 * Route every output-side comparison through `bucketKey`/`bucketEquals`.
 */

/** Canonicalize a bucket string for identity comparison. */
export function bucketKey(bucket: string): string {
    return bucket.trim().toLowerCase();
}

/** Case/whitespace-insensitive bucket identity. */
export function bucketEquals(a: string, b: string): boolean {
    return bucketKey(a) === bucketKey(b);
}

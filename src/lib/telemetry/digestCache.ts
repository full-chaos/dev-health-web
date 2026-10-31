/**
 * One digest cache for the product-telemetry pipeline. Every caller that hashes a stable
 * identifier (org id, user id) goes through here, so an id is hashed once per tab. The cache
 * holds only ids seen in this tab and is emptied by {@link resetDigestCacheForTests}.
 */

import { hashIdentifier } from "./hash";

const digests = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let generation = 0;

/** Changes on every reset: a digest started before a reset can see that it is stale. */
export function digestGeneration(): number {
    return generation;
}

export function getCachedDigest(id: string): string | undefined {
    return digests.get(id);
}

/** SHA-256 digest of `id` (null without SubtleCrypto). Shares one in-flight hash per id; caches only a real digest. */
export function digestOnce(id: string): Promise<string | null> {
    const cached = digests.get(id);
    if (cached !== undefined) return Promise.resolve(cached);
    const existing = inflight.get(id);
    if (existing) return existing;
    const startedIn = generation;
    const run = hashIdentifier(id).then((digest) => {
        if (startedIn === generation && digest !== null) digests.set(id, digest);
        return digest;
    });
    inflight.set(id, run);
    const done = (): void => {
        if (inflight.get(id) === run) inflight.delete(id);
    };
    run.then(done, done);
    return run;
}

export function resetDigestCacheForTests(): void {
    digests.clear();
    inflight.clear();
    generation += 1;
}

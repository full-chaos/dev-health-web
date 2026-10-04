/**
 * One memo Map per Node process, shared by every bundle that loads this module (CHAOS-8466).
 *
 * Next.js compiles the proxy, the page render and the route handlers into separate bundles, and each
 * bundle gets its own copy of a module-level `new Map()`. State that must be shared by all of them
 * (the backend validation memo, the impersonation status memo) is therefore kept on `globalThis`
 * under a registered `Symbol.for(...)` key: every copy of this module finds the same Map. It is still
 * per process, not per deployment: no Valkey, no cross-pod state.
 */
export function processMemo<V>(name: string): Map<string, V> {
    const key = Symbol.for(`dev-health.processMemo.${name}`);
    const holder = globalThis as unknown as Record<symbol, Map<string, V> | undefined>;
    let memo = holder[key];
    if (memo === undefined) {
        memo = new Map<string, V>();
        holder[key] = memo;
    }
    return memo;
}

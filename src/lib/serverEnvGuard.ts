import { ValidationErrors } from "@/lib/constants/errors";

/**
 * Throws when the server environment is read from a client bundle. Shared by both variants of
 * `#server-env`; it names no variable.
 */
export function assertNotClientBundle(): void {
    // Allow the call when running under a Node-based test runner even if the
    // environment has stubbed a `window` (jsdom/happy-dom). The bundle-guard
    // is about preventing accidental inclusion in *client* bundles, not about
    // blocking server-side tests.
    const inNodeTest =
        typeof process !== "undefined" &&
        // Indirect access via globalThis prevents Next.js's Edge-runtime
        // static analyzer from flagging the Node-only `process.versions`
        // token. The check correctly evaluates to `false` in Edge runtime,
        // which is the desired semantics (Edge is never a Node test runner).
        !!(globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node &&
        (process.env.VITEST === "true" ||
            process.env.NODE_ENV === "test" ||
            typeof (globalThis as { jest?: unknown }).jest !== "undefined");

    if (typeof window !== "undefined" && !inNodeTest) {
        throw new Error(ValidationErrors.ServerEnvCalledFromClientBundle);
    }
}

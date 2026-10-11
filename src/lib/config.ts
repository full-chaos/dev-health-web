/**
 * Centralized, Zod-validated environment configuration. Two surfaces:
 *
 * 1. `publicEnv` — client-safe `NEXT_PUBLIC_*` vars. Each field is read from
 *    `process.env.NEXT_PUBLIC_*` by LITERAL key so Next.js can statically
 *    inline it at build time. Exposed as a Proxy that re-parses on every
 *    property read, which keeps behavior correct in tests that mutate
 *    `process.env` between assertions.
 *
 * 2. `getServerEnv()` — server-only vars. Throws when called from a client
 *    bundle. Parses fresh on each call (no caching) so tests that mutate
 *    `process.env.FOO` between assertions see the new value.
 *
 * Scope note: a small set of files intentionally still read `process.env`
 * directly (Next.js config, Sentry config, standalone scripts, instrumentation
 * hooks, auto-generated code, and unit tests that exercise env behavior). See
 * CHAOS-1233 PR body for the full exception list.
 */
import { z } from "zod";

const publicEnvSchema = z.object({
    NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: z.string().optional(),
    NEXT_PUBLIC_DOCS_URL: z.string().default("/docs"),
    NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: z.string().optional(),
    NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
    NEXT_PUBLIC_GUIDED_ONBOARDING: z.string().optional(),
    NEXT_PUBLIC_RUM_ENDPOINT: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NODE_ENV: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function parsePublicEnv(): PublicEnv {
    return publicEnvSchema.parse({
        NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS,
        NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
        NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE,
        NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
        NEXT_PUBLIC_GUIDED_ONBOARDING: process.env.NEXT_PUBLIC_GUIDED_ONBOARDING,
        NEXT_PUBLIC_RUM_ENDPOINT: process.env.NEXT_PUBLIC_RUM_ENDPOINT,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
        NODE_ENV: process.env.NODE_ENV,
    });
}

export const publicEnv: PublicEnv = new Proxy({} as PublicEnv, {
    get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        const parsed = parsePublicEnv();
        return (parsed as Record<string, unknown>)[prop];
    },
    has(_target, prop) {
        if (typeof prop !== "string") return false;
        const parsed = parsePublicEnv();
        return prop in (parsed as Record<string, unknown>);
    },
    ownKeys() {
        return Object.keys(parsePublicEnv());
    },
    getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== "string") return undefined;
        const parsed = parsePublicEnv();
        if (!(prop in (parsed as Record<string, unknown>))) return undefined;
        return {
            enumerable: true,
            configurable: true,
            value: (parsed as Record<string, unknown>)[prop],
        };
    },
});

/**
 * The server environment reader. `#server-env` resolves by condition (see `package.json`,
 * "imports"): a server module graph gets the full reader (`serverEnv.server.ts`, `server-only`);
 * every other graph (the browser bundle, the server render of a client component) gets a reader
 * with the few values that code needs and no more (`serverEnv.default.ts`). The schema of the
 * server-only variables is therefore not in any client file.
 */
export { getServerEnv } from "#server-env";
export type { ServerEnv } from "#server-env";

export const isServer = typeof window === "undefined";
export const isBrowser = !isServer;

export const config = {
    api: {
        get docsUrl(): string {
            // Lazy getter to avoid a top-level import cycle with runtimeConfig.
            // The runtimeConfig module itself depends on this file for
            // `getServerEnv`, so we must not eagerly import it at module load.
            const { runtimeConfig } =
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require("@/lib/runtimeConfig") as typeof import("@/lib/runtimeConfig");
            return runtimeConfig.docsUrl();
        },
    },
};

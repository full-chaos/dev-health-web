import "server-only";
import { z } from "zod";
import { assertNotClientBundle } from "@/lib/serverEnvGuard";

/**
 * The full server environment reader: the server variant of `#server-env` (see `config.ts`).
 * `server-only` makes the build refuse a client import of this file, so the names of the server
 * variables are never part of a browser bundle.
 */
const serverEnvSchema = z.object({
    NODE_ENV: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
    LOG_FORMAT: z.string().optional(),
    BACKEND_URL: z.string().optional(),
    BASE_PATH: z.string().optional(),
    AUTH_SECRET: z.string().optional(),
    AUTH_URL: z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
    NEXTAUTH_URL: z.string().optional(),
    /** Access-token class auth-service issues: `eddsa` or `hs256_compat` (unset = `hs256_compat`). */
    AUTH_ACCESS_TOKEN_CLASS: z.string().optional(),
    /** Issuer of the access tokens, checked under class `eddsa`. */
    AUTH_TOKEN_ISSUER: z.string().optional(),
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_GITLAB_ID: z.string().optional(),
    AUTH_GITLAB_SECRET: z.string().optional(),
    LINEAR_API_KEY: z.string().optional(),
    LINEAR_TEAM_ID: z.string().optional(),
    REDIS_URL: z.string().optional(),
    /**
     * When set to "true" or "1", the application trusts the `X-Forwarded-For`
     * header for client IP extraction (used by rate limiting). Only enable this
     * when the app is deployed behind a trusted reverse proxy that strips or
     * rewrites forwarded headers. Defaults to false (untrusted) to prevent IP
     * spoofing attacks.
     */
    TRUST_PROXY: z.string().optional(),
    /**
     * Number of trusted reverse proxies in front of the app (integer 1..32,
     * default 1). With TRUST_PROXY on, the client is that many entries from the
     * RIGHT of `X-Forwarded-For`; entries to its left are client-written and are
     * never read. Invalid values fall back to 1.
     */
    TRUSTED_PROXY_HOPS: z.string().optional(),
    USE_GRAPHQL_ANALYTICS: z.string().optional(),
    DEV_HEALTH_TEST_MODE: z.string().optional(),
    DEMO_EXPORT: z.string().optional(),
    NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: z.string().optional(),
    NEXT_PUBLIC_DOCS_URL: z.string().optional(),
    NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: z.string().optional(),
    NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
    NEXT_PUBLIC_RUM_ENDPOINT: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Returns a validated, fresh snapshot of the server environment. Parses on
 * every call so tests can mutate `process.env` between assertions. Throws if
 * called from a client bundle as a defensive guard.
 */
export function getServerEnv(): ServerEnv {
    assertNotClientBundle();
    return serverEnvSchema.parse(process.env);
}

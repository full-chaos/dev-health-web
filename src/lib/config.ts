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
import { ValidationErrors } from "@/lib/constants/errors";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: z.string().optional(),
  NEXT_PUBLIC_DOCS_URL: z.string().default("/docs"),
  NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: z.string().optional(),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  NEXT_PUBLIC_BETA: z.string().optional(),
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
    NEXT_PUBLIC_BETA: process.env.NEXT_PUBLIC_BETA,
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

const serverEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  LOG_FORMAT: z.string().optional(),
  BACKEND_URL: z.string().optional(),
  BASE_PATH: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
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
  USE_GRAPHQL_ANALYTICS: z.string().optional(),
  DEV_HEALTH_TEST_MODE: z.string().optional(),
  DEMO_EXPORT: z.string().optional(),
  NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: z.string().optional(),
  NEXT_PUBLIC_DOCS_URL: z.string().optional(),
  NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: z.string().optional(),
  NEXT_PUBLIC_DEMO_MODE: z.string().optional(),
  NEXT_PUBLIC_BETA: z.string().optional(),
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
  return serverEnvSchema.parse(process.env);
}

export const isServer = typeof window === "undefined";
export const isBrowser = !isServer;

export const config = {
  api: {
    baseUrl: "",
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

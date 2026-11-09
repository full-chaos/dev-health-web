import { expect, vi } from "vitest";

/**
 * CHAOS-12901: files that fail ONLY by vitest's default timeouts (hook 10 s, test 5 s) when the
 * host is loaded, and pass alone. Each does heavy setup (dynamic imports of next-auth, spawned
 * node scripts, large module graphs, many awaited renders). A listed file gets bounded, higher
 * limits; every other file keeps the vitest defaults, and the bound stays finite so a real hang
 * still fails (in 30 s, not never). Add a file here only with a log that shows a timeout-only
 * failure under load and a pass alone.
 */
export const LOAD_TIMEOUT_MS = { test: 30_000, hook: 30_000 } as const;

export const LOAD_TIMEOUT_FILES: readonly string[] = [
    "scripts/__tests__/eslint-10-compat.test.mjs",
    "scripts/__tests__/graphql-wire-parity-hydration-client.test.mjs",
    "scripts/__tests__/graphql-wire-parity-real-client.test.mjs",
    "src/app/api/auth/[...nextauth]/__tests__/route.test.ts",
    "src/app/api/auth/[...nextauth]/__tests__/session-token.test.ts",
    "src/app/api/auth/revoke-session/__tests__/route.test.ts",
    "src/app/(app)/code/page.deadline.test.tsx",
    "src/lib/navigation/__tests__/ia-preservation-invariants.test.ts",
    "src/lib/__tests__/auth-secret-fallback.test.ts",
    "src/lib/__tests__/auth-session-handoff.test.ts",
    "src/lib/__tests__/processMemo.test.ts",
    "src/lib/__tests__/rate-limit.test.ts",
    "src/lib/__tests__/serverFetchEntrypoints.test.ts",
    "src/lib/__tests__/impersonation-signout.test.ts",
    "src/lib/ask-dev/acr-transport/__tests__/index.test.ts",
    "src/lib/__tests__/auth-sso-provider.test.ts",
    "src/components/ask-dev/__tests__/askDevSankeyLabels.test.tsx",
    "src/components/telemetry/SignupCompletedEmitter.tabs.test.tsx",
    "src/components/shell/CommandPalette.test.tsx",
];

/** True when `testPath` (absolute or repo-relative) names a listed file. */
export function hasLoadTimeout(testPath: string | undefined): boolean {
    if (!testPath) return false;
    const normal = testPath.split("\\").join("/");
    return LOAD_TIMEOUT_FILES.some((file) => normal === file || normal.endsWith(`/${file}`));
}

if (hasLoadTimeout(expect.getState().testPath)) {
    vi.setConfig({ testTimeout: LOAD_TIMEOUT_MS.test, hookTimeout: LOAD_TIMEOUT_MS.hook });
}

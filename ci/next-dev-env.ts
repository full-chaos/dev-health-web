import path from "node:path";
import { pathToFileURL } from "node:url";

export const NEXT_NO_REGISTRY_CHECK_URL = "https://registry.npmjs.org/-/package/next/dist-tags";

const preloadOption = `--import ${pathToFileURL(path.resolve(__dirname, "next-no-registry-check.mjs")).href}`;

/** NODE_OPTIONS for a `next dev` webServer: the existing value plus the registry-check guard. */
export function nextDevNodeOptions(
    existing: string | undefined = process.env.NODE_OPTIONS,
): string {
    const base = (existing ?? "").trim();
    if (base.includes(preloadOption)) return base;
    return base === "" ? preloadOption : `${base} ${preloadOption}`;
}

/** The access-token issuer the mock-backed e2e web servers pin (tests/mocks/mockTokens.ts). */
export const E2E_AUTH_ISSUER = "https://auth.e2e.test";

const authIssuerOption = `--import ${pathToFileURL(path.resolve(__dirname, "e2e-auth-issuer-fetch.mjs")).href}`;

/**
 * The env a web server needs to read the access tokens of the ops mock: the pinned issuer, the mock
 * origin its key reads are sent to, and NODE_OPTIONS with the guard that does the sending.
 */
export function e2eAuthEnv(mockOrigin: string): Record<string, string> {
    const base = nextDevNodeOptions();
    return {
        AUTH_ACCESS_TOKEN_ISSUER: E2E_AUTH_ISSUER,
        E2E_AUTH_ISSUER_ORIGIN: mockOrigin,
        NODE_OPTIONS: base.includes(authIssuerOption) ? base : `${base} ${authIssuerOption}`,
    };
}

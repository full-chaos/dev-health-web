/**
 * The browser's ACR OAuth client values in runtime-config.js (CHAOS-12302). Both values are public
 * (an issuer origin and this app's origin), and both come only from the server settings:
 *
 * - The issuer comes from `ACR_OAUTH_ISSUER`, and only when it is exactly an origin.
 * - The web origin comes from `AUTH_URL ?? NEXTAUTH_URL`, read exactly the way T4c's
 *   `loadFirstPartyBrowserClient` reads it (`src/lib/acr/config.ts`). A client the browser uses is
 *   then one T4c approves with no click.
 * - Both are published, or neither: the browser needs the pair, and a value it would refuse never
 *   reaches the public file (CHAOS-12316). Anything else leaves the client off.
 *
 * The browser checks both values again (`src/lib/ask-dev/acr-browser-config.ts`). This file runs
 * in plain node at start-up, so it cannot import that module and keeps a copy of its host rules.
 * The parity test (`src/lib/ask-dev/__tests__/acr-browser-config.parity.test.ts`) holds the three
 * readers equal.
 */

export const ACR_ISSUER_PUBLIC_KEY = "NEXT_PUBLIC_ACR_OAUTH_ISSUER";
export const ACR_WEB_ORIGIN_PUBLIC_KEY = "NEXT_PUBLIC_ACR_WEB_ORIGIN";

/** The keys this module owns: a value set directly in the environment never passes through. */
export const ACR_PUBLIC_KEYS = [ACR_ISSUER_PUBLIC_KEY, ACR_WEB_ORIGIN_PUBLIC_KEY];

/** The browser's rules (`acr-browser-config.ts`): its loopback hosts and its plain host. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PLAIN_HOST =
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])$/u;

/** T4c's `exactOrigin`: an http(s) URL with no user info, as its origin. */
function exactOrigin(raw) {
    const value = raw?.trim();
    if (!value) return undefined;
    try {
        const url = new URL(value);
        return (url.protocol === "https:" || url.protocol === "http:") &&
            url.username === "" &&
            url.password === ""
            ? url.origin
            : undefined;
    } catch {
        return undefined;
    }
}

/** What the browser adds to T4c's rule: a plain host, and https (http on a loopback host only). */
function browserAccepts(origin) {
    const url = new URL(origin);
    return (
        PLAIN_HOST.test(url.hostname) &&
        (url.protocol === "https:" || LOOPBACK_HOSTS.has(url.hostname))
    );
}

/**
 * @param {Record<string, string | undefined>} env the server environment
 * @returns {Record<string, string>} the ACR keys for `publicEnv`, or none
 */
export function acrPublicEnv(env) {
    // T4c's issuer rule: exactly an http(s) origin. Anything else (user info, a path, a query) is a
    // mistyped setting; it never reaches the public file (r2).
    const issuer = env.ACR_OAUTH_ISSUER?.trim();
    if (!issuer || exactOrigin(issuer) !== issuer) return {};
    const webOrigin = exactOrigin(env.AUTH_URL ?? env.NEXTAUTH_URL);
    if (webOrigin === undefined) return {};
    if (!browserAccepts(issuer) || !browserAccepts(webOrigin)) return {};
    return { [ACR_ISSUER_PUBLIC_KEY]: issuer, [ACR_WEB_ORIGIN_PUBLIC_KEY]: webOrigin };
}

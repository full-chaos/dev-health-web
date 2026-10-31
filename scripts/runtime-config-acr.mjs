/**
 * The browser's ACR OAuth client values in runtime-config.js (CHAOS-12302). Both values are public
 * (an issuer origin and this app's origin), and both come only from the server settings:
 *
 * - The issuer comes from `ACR_OAUTH_ISSUER`. Unset means no values at all, so the client stays off.
 * - The web origin comes from `AUTH_URL ?? NEXTAUTH_URL`, read exactly the way T4c's
 *   `loadFirstPartyBrowserClient` reads it (`src/lib/acr/config.ts`). A client the browser uses is
 *   then one T4c approves with no click.
 *
 * The browser checks both values again (`src/lib/ask-dev/acr-browser-config.ts`). The parity test
 * (`src/lib/ask-dev/__tests__/acr-browser-config.parity.test.ts`) holds the three readers equal.
 */

export const ACR_ISSUER_PUBLIC_KEY = "NEXT_PUBLIC_ACR_OAUTH_ISSUER";
export const ACR_WEB_ORIGIN_PUBLIC_KEY = "NEXT_PUBLIC_ACR_WEB_ORIGIN";

/** The keys this module owns: a value set directly in the environment never passes through. */
export const ACR_PUBLIC_KEYS = [ACR_ISSUER_PUBLIC_KEY, ACR_WEB_ORIGIN_PUBLIC_KEY];

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

/**
 * @param {Record<string, string | undefined>} env the server environment
 * @returns {Record<string, string>} the ACR keys for `publicEnv`, or none
 */
export function acrPublicEnv(env) {
    const issuer = env.ACR_OAUTH_ISSUER?.trim();
    if (!issuer) return {};
    /** @type {Record<string, string>} */
    const values = { [ACR_ISSUER_PUBLIC_KEY]: issuer };
    const webOrigin = exactOrigin(env.AUTH_URL ?? env.NEXTAUTH_URL);
    if (webOrigin !== undefined) values[ACR_WEB_ORIGIN_PUBLIC_KEY] = webOrigin;
    return values;
}

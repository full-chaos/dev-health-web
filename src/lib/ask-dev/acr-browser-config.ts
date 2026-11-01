/**
 * Which OAuth client of ACR this web app is (CHAOS-12302, c1 of the T13 split; Ask Dev direct
 * browser design §2.1). The browser is a first-party public client of acr-api: authorization code
 * with PKCE S256, against the issuer `ACR_OAUTH_ISSUER`.
 *
 * - On an https web origin the client is the client ID metadata document web serves at
 *   `/oauth/acr-client.json` (ACR fetches it from a public https address and pins it in
 *   `ACR_OAUTH_BROWSER_CLIENTS`).
 * - On an http loopback origin (local, kiac) it is ACR's development-only static client
 *   `https://localhost/acr/dev-browser-client`, whose exact redirects ACR is configured with.
 * - Anything else, or no issuer, is no client: the browser client is off.
 *
 * Default-off: prod sets `ACR_OAUTH_ISSUER` only in the T13 roll. The same value already gates
 * T4c's consent claims (`src/lib/acr/config.ts`). The server's view (`serverAcrClientConfig`) lives
 * there, built from T4c's first-party pair. The issuer and the web origin are public values, not
 * secrets: the browser reads them from runtime config (`scripts/runtime-config-acr.mjs`).
 */

/** Where web serves its client ID metadata document. */
export const ACR_CLIENT_METADATA_PATH = "/oauth/acr-client.json";

/**
 * The exact redirect URI path of the client. ACR puts the code on this URL, and web's server reads
 * it from ACR's consent answer (CHAOS-12474): no browser lands here and no page serves it, but ACR
 * holds it as the client's registered redirect, so it stays.
 */
export const ACR_OAUTH_CALLBACK_PATH = "/ask-dev/oauth/callback";

/** The scopes the Ask Dev routes need: context:read; evidence:read for evidence. Never data:read. */
export const ACR_BROWSER_SCOPE = "context:read evidence:read";

/** ACR's development-only static browser client (acr `internal/auth/oauth.go`), never fetched. */
export const ACR_DEV_BROWSER_CLIENT_ID = "https://localhost/acr/dev-browser-client";

/**
 * The runtime config keys the browser reads. `scripts/runtime-config-acr.mjs` writes them and keeps
 * its own copy; the parity test holds the two equal.
 */
export const ACR_ISSUER_PUBLIC_KEY = "NEXT_PUBLIC_ACR_OAUTH_ISSUER";
export const ACR_WEB_ORIGIN_PUBLIC_KEY = "NEXT_PUBLIC_ACR_WEB_ORIGIN";

export type AcrBrowserClientConfig = {
    /** ACR's OAuth issuer, an exact origin: also the only resource the browser class may bind. */
    readonly issuer: string;
    /** This web app's origin: the redirect URI's origin. */
    readonly webOrigin: string;
    /** The OAuth `client_id`. */
    readonly clientId: string;
    /** The exact `redirect_uri`. */
    readonly redirectUri: string;
    /** Whether the client is web's metadata document (https) or ACR's development client. */
    readonly usesMetadataDocument: boolean;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A plain host: DNS labels or an IPv6 literal. The URL parser keeps characters such as `*` in a
 * host, and a CSP source must never become a wildcard (CHAOS-12302).
 */
const PLAIN_HOST =
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])$/u;

function parse(raw: string): URL | undefined {
    try {
        const url = new URL(raw);
        return PLAIN_HOST.test(url.hostname) ? url : undefined;
    } catch {
        return undefined;
    }
}

/**
 * ACR's issuer rule: an https origin (http only on a loopback host), with no path, query,
 * fragment, user info or trailing slash. The value must be exactly that origin.
 */
function issuerOrigin(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    const url = parse(value);
    if (url === undefined || url.username !== "" || url.password !== "") return undefined;
    const allowed =
        url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
    if (!allowed || url.origin !== value) return undefined;
    return url.origin;
}

/** The web origin of AUTH_URL (which may carry a path), https or http loopback. */
function webOriginOf(
    raw: string | undefined,
): { origin: string; loopbackHttp: boolean } | undefined {
    const value = raw?.trim();
    if (!value) return undefined;
    const url = parse(value);
    if (url === undefined || url.username !== "" || url.password !== "") return undefined;
    if (url.protocol === "https:") return { origin: url.origin, loopbackHttp: false };
    if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
        return { origin: url.origin, loopbackHttp: true };
    }
    return undefined;
}

/** The client for an issuer and a web origin, or `undefined` (off). */
export function acrBrowserClientConfig(
    issuerRaw: string | undefined,
    webOriginRaw: string | undefined,
): AcrBrowserClientConfig | undefined {
    const issuer = issuerOrigin(issuerRaw);
    const web = webOriginOf(webOriginRaw);
    if (issuer === undefined || web === undefined) return undefined;
    return {
        issuer,
        webOrigin: web.origin,
        clientId: web.loopbackHttp
            ? ACR_DEV_BROWSER_CLIENT_ID
            : `${web.origin}${ACR_CLIENT_METADATA_PATH}`,
        redirectUri: `${web.origin}${ACR_OAUTH_CALLBACK_PATH}`,
        usesMetadataDocument: !web.loopbackHttp,
    };
}

/** The issuer origin the CSP may add to `connect-src`, or `undefined` (adds nothing). */
export function acrIssuerOriginForCsp(raw: string | undefined): string | undefined {
    return issuerOrigin(raw);
}

type RuntimeWindow = {
    readonly __DEV_HEALTH_RUNTIME__?: { readonly publicEnv?: Record<string, string> };
    readonly location?: { readonly origin?: string };
};

/**
 * The browser's view, from the runtime config written at start-up. Off on any origin but the
 * configured one: its redirect would not match the one ACR holds for the client.
 */
export function browserAcrClientConfig(): AcrBrowserClientConfig | undefined {
    if (typeof window === "undefined") return undefined;
    const runtime = window as unknown as RuntimeWindow;
    const publicEnv = runtime.__DEV_HEALTH_RUNTIME__?.publicEnv ?? {};
    const config = acrBrowserClientConfig(
        publicEnv[ACR_ISSUER_PUBLIC_KEY],
        publicEnv[ACR_WEB_ORIGIN_PUBLIC_KEY],
    );
    if (config === undefined || runtime.location?.origin !== config.webOrigin) return undefined;
    return config;
}

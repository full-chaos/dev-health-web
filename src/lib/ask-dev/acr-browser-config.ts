import {
    ACR_BROWSER_SCOPE,
    ACR_DEV_BROWSER_CLIENT_ID,
    acrBrowserClientConfig as clientConfig,
    acrIssuerOriginForCsp,
    type AcrBrowserClientConfig,
} from "@full-chaos/ask-dev/acr-client/config";

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

/**
 * The runtime config keys the browser reads. `scripts/runtime-config-acr.mjs` writes them and keeps
 * its own copy; the parity test holds the two equal.
 */
export const ACR_ISSUER_PUBLIC_KEY = "NEXT_PUBLIC_ACR_OAUTH_ISSUER";
export const ACR_WEB_ORIGIN_PUBLIC_KEY = "NEXT_PUBLIC_ACR_WEB_ORIGIN";

export {
    ACR_BROWSER_SCOPE,
    ACR_DEV_BROWSER_CLIENT_ID,
    acrIssuerOriginForCsp,
    type AcrBrowserClientConfig,
};

/** Web's client for an issuer and a web origin, or `undefined` (off). */
export function acrBrowserClientConfig(
    issuerRaw: string | undefined,
    webOriginRaw: string | undefined,
): AcrBrowserClientConfig | undefined {
    return clientConfig(issuerRaw, webOriginRaw, {
        callback: ACR_OAUTH_CALLBACK_PATH,
        metadata: ACR_CLIENT_METADATA_PATH,
    });
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

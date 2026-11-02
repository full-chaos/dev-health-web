import type { AskDevTransport } from "@/components/ask-dev/conversation/transport";
import {
    type AcrSilentOutcome,
    authorizeAcrSilently,
    getAcrAccessToken,
    reportAcrTokenRejected,
} from "@/lib/ask-dev/acr-auth";
import { browserAcrClientConfig } from "@/lib/ask-dev/acr-browser-config";
import { safeReturnTo } from "@/lib/onboarding/returnTo";

import * as envelope from "@/lib/acr/streamEnvelopeValidators";

import { createAcrBrowserTransport, type StreamValidators } from "./browserTransport";

/**
 * The silent step, and the one way on from a web session that has ended: the normal sign-in, back
 * to this page (CHAOS-12474). The token store itself never touches `window.location`.
 */
async function authorize(): Promise<AcrSilentOutcome> {
    const outcome = await authorizeAcrSilently();
    if (outcome.kind === "session_ended") {
        const here = `${window.location.pathname}${window.location.search}`;
        const signIn = new URL("/auth/signin", window.location.origin);
        signIn.searchParams.set("callbackUrl", safeReturnTo(here) ?? "/dashboard");
        window.location.assign(signIn.href);
    }
    return outcome;
}

/**
 * The browser's ACR transport, or `null` (CHAOS-12104, T14a): `null` while the browser ACR config
 * is unset (`ACR_OAUTH_ISSUER`; prod until the T13 roll), so the panel draws no composer and
 * sends nothing. One per page, for the configured issuer.
 */
export function acrBrowserTransport(): AskDevTransport | null {
    const config = browserAcrClientConfig();
    if (config === undefined) return null;
    if (cached?.issuer === config.issuer && cached.clientId === config.clientId) {
        return cached.transport;
    }
    const transport = createAcrBrowserTransport(config, {
        fetch: (input, init) => globalThis.fetch(input, init),
        now: () => Date.now(),
        token: () => getAcrAccessToken(),
        rejected: (token) => reportAcrTokenRejected(token),
        authorize,
        envelope,
        validators: loadStreamValidators,
    });
    cached = { issuer: config.issuer, clientId: config.clientId, transport };
    return transport;
}

let cached: { issuer: string; clientId: string; transport: AskDevTransport } | undefined;
let loading: Promise<StreamValidators> | undefined;

/**
 * The full generated checks (the whole result schemas, ~205 KB gzip), loaded from the first submit
 * or replay on, never before (option (c); never on panel open). A failed load is tried again on the
 * next call.
 */
export function loadStreamValidators(): Promise<StreamValidators> {
    loading ??= import("@/lib/acr/streamValidators").catch((error: unknown) => {
        loading = undefined;
        throw error;
    });
    return loading;
}

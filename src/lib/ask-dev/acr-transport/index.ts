import type { AskDevTransport } from "@/components/ask-dev/conversation/transport";
import { getAcrAccessToken } from "@/lib/ask-dev/acr-auth";
import { browserAcrClientConfig } from "@/lib/ask-dev/acr-browser-config";

import * as envelope from "@/lib/acr/streamEnvelopeValidators";

import { createAcrBrowserTransport, type StreamValidators } from "./browserTransport";

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

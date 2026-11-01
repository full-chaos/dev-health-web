import {
    ACR_ISSUER_PUBLIC_KEY,
    ACR_WEB_ORIGIN_PUBLIC_KEY,
    browserAcrClientConfig,
} from "@/lib/ask-dev/acr-browser-config";

/**
 * CHAOS-12306: turns the browser ACR client on for a jsdom test, through the same runtime config
 * the server writes at start-up (an http loopback issuer and this document's origin). It does not
 * mock `browserAcrClientConfig`: the gate under test is the real one.
 */
export function acrBrowserClientOn(): void {
    window.__DEV_HEALTH_RUNTIME__ = {
        publicEnv: {
            [ACR_ISSUER_PUBLIC_KEY]: "http://127.0.0.1:8080",
            [ACR_WEB_ORIGIN_PUBLIC_KEY]: window.location.origin,
        },
    };
    if (browserAcrClientConfig() === undefined) {
        throw new Error("acrBrowserClientOn: the browser ACR client is still off");
    }
}

/** Turns it off again: no runtime config, as in prod until the T13 roll. */
export function acrBrowserClientOff(): void {
    if (typeof window !== "undefined") delete window.__DEV_HEALTH_RUNTIME__;
}

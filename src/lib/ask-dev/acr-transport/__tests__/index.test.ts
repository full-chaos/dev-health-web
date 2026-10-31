import { afterEach, describe, expect, it, vi } from "vitest";

/** Counts the loads of the full checks (the lazy ~205 KB chunk). */
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/acr/streamValidators", async (importOriginal) => {
    loads.count += 1;
    return importOriginal();
});

import { acrBrowserTransport, loadStreamValidators } from "../index";

/**
 * CHAOS-12104 (T14a), the lead's ruling "dark in prod": the browser ACR transport is `null` while
 * the browser ACR config is unset (`ACR_OAUTH_ISSUER`; prod until the T13 roll), so the panel draws
 * no composer and sends nothing.
 */

function runtime(publicEnv: Record<string, string> | undefined, origin: string) {
    vi.stubGlobal("window", {
        ...(publicEnv === undefined ? {} : { __DEV_HEALTH_RUNTIME__: { publicEnv } }),
        location: { origin },
    });
}

const SET = {
    NEXT_PUBLIC_ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
    NEXT_PUBLIC_ACR_WEB_ORIGIN: "https://www.fullchaos.dev",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("acrBrowserTransport", () => {
    it("is null on the server", () => {
        expect(acrBrowserTransport()).toBeNull();
    });

    it("is null with no issuer: nothing can call ACR", () => {
        runtime(undefined, "https://www.fullchaos.dev");
        expect(acrBrowserTransport()).toBeNull();
        runtime(
            { NEXT_PUBLIC_ACR_WEB_ORIGIN: SET.NEXT_PUBLIC_ACR_WEB_ORIGIN },
            "https://www.fullchaos.dev",
        );
        expect(acrBrowserTransport()).toBeNull();
        runtime({ ...SET, NEXT_PUBLIC_ACR_OAUTH_ISSUER: "" }, "https://www.fullchaos.dev");
        expect(acrBrowserTransport()).toBeNull();
    });

    it("is null on another origin than the configured web origin", () => {
        runtime(SET, "https://preview.fullchaos.dev");
        expect(acrBrowserTransport()).toBeNull();
    });

    it("is one transport per page once the config is set", () => {
        runtime(SET, "https://www.fullchaos.dev");
        const first = acrBrowserTransport();
        expect(first).not.toBeNull();
        expect(acrBrowserTransport()).toBe(first);
    });

    // Option (c): the provider makes the transport when the page loads; that loads nothing heavy.
    it("loads none of the full checks when it is made (never on page load or panel open)", () => {
        runtime(SET, "https://www.fullchaos.dev");
        expect(acrBrowserTransport()).not.toBeNull();
        expect(loads.count).toBe(0);
    });
});

describe("loadStreamValidators", () => {
    it("loads the generated standalone validators once", async () => {
        const first = loadStreamValidators();
        expect(loadStreamValidators()).toBe(first);
        const validators = await first;
        expect(loads.count).toBe(1);
        expect(typeof validators.validateInvestigationEvent).toBe("function");
        expect(validators.validateInvestigationResultV1({})).toBe(false);
    });
});

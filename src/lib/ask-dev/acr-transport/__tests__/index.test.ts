import { afterEach, describe, expect, it, vi } from "vitest";

import type { AcrSilentOutcome } from "@/lib/ask-dev/acr-auth";

/** Counts the loads of the full checks (the lazy ~205 KB chunk). */
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/acr/streamValidators", async (importOriginal) => {
    loads.count += 1;
    return importOriginal();
});

/** The token store, so the wiring of its two calls can be seen (CHAOS-12305). */
const store = vi.hoisted(() => ({
    getAcrAccessToken: vi.fn(async () => ({ kind: "authorization_required" as const })),
    reportAcrTokenRejected: vi.fn(),
    authorizeAcrSilently: vi.fn(async (): Promise<AcrSilentOutcome> => ({ kind: "off" })),
}));
vi.mock("@/lib/ask-dev/acr-auth", () => store);
vi.mock("../browserTransport", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../browserTransport")>();
    return { ...actual, createAcrBrowserTransport: vi.fn(actual.createAcrBrowserTransport) };
});

import { createAcrBrowserTransport } from "../browserTransport";
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

    it("reads the token from the store, and tells the store which token ACR refused (CHAOS-12305)", async () => {
        runtime(SET, "https://www.fullchaos.dev");
        expect(acrBrowserTransport()).not.toBeNull();
        const dependencies = vi.mocked(createAcrBrowserTransport).mock.calls[0]![1];
        await dependencies.token();
        expect(store.getAcrAccessToken).toHaveBeenCalledTimes(1);
        dependencies.rejected("fcacr_refused");
        expect(store.reportAcrTokenRejected).toHaveBeenCalledExactlyOnceWith("fcacr_refused");
    });

    /** A page at `/dev?thread=t1`, and what its transport's `authorize` does for `outcome`. */
    async function silentStep(outcome: AcrSilentOutcome) {
        const assign = vi.fn();
        vi.stubGlobal("window", {
            __DEV_HEALTH_RUNTIME__: { publicEnv: SET },
            location: {
                origin: SET.NEXT_PUBLIC_ACR_WEB_ORIGIN,
                pathname: "/dev",
                search: "?thread=t1",
                assign,
            },
        });
        expect(acrBrowserTransport()).not.toBeNull();
        store.authorizeAcrSilently.mockResolvedValueOnce(outcome);
        const dependencies = vi.mocked(createAcrBrowserTransport).mock.calls[0]![1];
        await expect(dependencies.authorize()).resolves.toEqual(outcome);
        return assign;
    }

    // CHAOS-12474: the one place the flow leaves the page, and only for a session that has ended.
    it("goes to the normal sign-in, back to this page, when the web session has ended", async () => {
        const assign = await silentStep({ kind: "session_ended" });
        expect(assign).toHaveBeenCalledExactlyOnceWith(
            `${SET.NEXT_PUBLIC_ACR_WEB_ORIGIN}/auth/signin?callbackUrl=${encodeURIComponent("/dev?thread=t1")}`,
        );
    });

    it.each([
        { kind: "failed", reason: "unavailable" },
        { kind: "rate_limited" },
        { kind: "impersonating" },
        { kind: "not_entitled" },
        { kind: "token", token: "fcacr_x", issuer: SET.NEXT_PUBLIC_ACR_OAUTH_ISSUER },
    ] as const)("does not leave the page for %j", async (outcome) => {
        expect(await silentStep(outcome)).not.toHaveBeenCalled();
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

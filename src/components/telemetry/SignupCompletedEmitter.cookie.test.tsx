import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding/track", () => ({
    trackOnboardingEvent: (...args: unknown[]) => trackOnboardingEvent(...args),
}));

const hashSpy = vi.fn();
vi.mock("@/lib/telemetry/hash", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/telemetry/hash")>();
    return {
        ...actual,
        hashIdentifier: (input: string) => {
            hashSpy(input);
            return actual.hashIdentifier(input);
        },
    };
});

type Emitter = typeof import("./SignupCompletedEmitter");

/** One browser tab: its own module instance, so its own in-memory guard. */
async function openTab(): Promise<Emitter> {
    vi.resetModules();
    return import("./SignupCompletedEmitter");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

function clearCookies(): void {
    for (const part of document.cookie.split(";")) {
        const name = part.split("=")[0]?.trim();
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
    }
}

const COOKIE_KEY = /^devhealth-signup-completed:[0-9a-f]{64}=1$/;

describe("SignupCompletedEmitter cookie marker (cleared storage)", () => {
    beforeEach(() => {
        trackOnboardingEvent.mockReset();
        hashSpy.mockReset();
        window.localStorage.clear();
        clearCookies();
        Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        clearCookies();
    });

    async function firstEmit(): Promise<void> {
        const a = await openTab();
        render(<a.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
    }

    it("cell 1: storage cleared, token still new: no second event", async () => {
        await firstEmit();
        window.localStorage.clear();
        const b = await openTab();
        render(<b.SignupCompletedEmitter isNewUser userId="user-1" />);
        await settle();
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("cell 2: cookie cleared, storage kept: no second event", async () => {
        await firstEmit();
        clearCookies();
        const b = await openTab();
        render(<b.SignupCompletedEmitter isNewUser userId="user-1" />);
        await settle();
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("cell 3: both cleared: a second event goes out (a full site-data clear ends the session too)", async () => {
        await firstEmit();
        window.localStorage.clear();
        clearCookies();
        const b = await openTab();
        render(<b.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(2), {
            timeout: 5000,
        });
    });

    it("cell 4: a failing cookie write or read still sends the event once", async () => {
        const jar = vi.spyOn(document, "cookie", "set").mockImplementation(() => {
            throw new Error("cookies blocked");
        });
        await firstEmit();
        expect(jar).toHaveBeenCalled();
        vi.restoreAllMocks();
        vi.spyOn(document, "cookie", "get").mockImplementation(() => {
            throw new Error("cookies blocked");
        });
        window.localStorage.clear();
        const b = await openTab();
        render(<b.SignupCompletedEmitter isNewUser userId="user-2" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(2), {
            timeout: 5000,
        });
    });

    it("cell 5: without SubtleCrypto no cookie, no storage key, one event", async () => {
        vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
        const tab = await openTab();
        render(<tab.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        await settle();
        expect(document.cookie).toBe("");
        expect(window.localStorage.length).toBe(0);
    });

    it("cell 6: the cookie holds only the digest key, never the raw user id", async () => {
        await firstEmit();
        const jar = document.cookie;
        expect(jar).toMatch(COOKIE_KEY);
        expect(jar).not.toContain("user-1");
        expect(jar.split(";")).toHaveLength(1);
    });
});

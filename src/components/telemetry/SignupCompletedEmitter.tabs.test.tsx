import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding/track", () => ({
    trackOnboardingEvent: (...args: unknown[]) => trackOnboardingEvent(...args),
}));

type Emitter = typeof import("./SignupCompletedEmitter");

/** One browser tab: its own module instance, so its own in-memory guard. */
async function openTab(): Promise<Emitter> {
    vi.resetModules();
    return import("./SignupCompletedEmitter");
}

/** A Web Locks model: exclusive locks per name, granted in order, callback runs after a tick. */
function lockManager() {
    const tails = new Map<string, Promise<unknown>>();
    return {
        request: <T,>(
            name: string,
            _options: unknown,
            callback: () => Promise<T> | T,
        ): Promise<T> => {
            const previous = tails.get(name) ?? Promise.resolve();
            const run = previous.then(async () => {
                await Promise.resolve();
                return callback();
            });
            tails.set(
                name,
                run.catch(() => undefined),
            );
            return run;
        },
    };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
const gap = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 25));

describe("SignupCompletedEmitter across tabs", () => {
    beforeEach(() => {
        trackOnboardingEvent.mockReset();
        window.localStorage.clear();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    });

    it("two tabs sharing one lock manager send one event", async () => {
        Object.defineProperty(navigator, "locks", { value: lockManager(), configurable: true });
        const [a, b] = [await openTab(), await openTab()];
        a.setAfterReadForTests(gap);
        b.setAfterReadForTests(gap);
        render(<a.SignupCompletedEmitter isNewUser userId="user-1" />);
        render(<b.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalled(), { timeout: 5000 });
        await settle();
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("without Web Locks two racing tabs send at most one extra event, never none", async () => {
        Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
        const [a, b] = [await openTab(), await openTab()];
        a.setAfterReadForTests(gap);
        b.setAfterReadForTests(gap);
        render(<a.SignupCompletedEmitter isNewUser userId="user-1" />);
        render(<b.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalled(), { timeout: 5000 });
        await settle();
        expect(trackOnboardingEvent.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(trackOnboardingEvent.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it("a failing lock manager falls back to the unlocked path and still sends the event", async () => {
        Object.defineProperty(navigator, "locks", {
            value: { request: () => Promise.reject(new Error("locks unavailable")) },
            configurable: true,
        });
        const tab = await openTab();
        render(<tab.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
    });

    it("with SubtleCrypto it writes one SHA-256 key", async () => {
        const tab = await openTab();
        render(<tab.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        expect(Object.keys(window.localStorage)).toHaveLength(1);
        expect(Object.keys(window.localStorage)[0]).toMatch(
            /^devhealth-signup-completed:[0-9a-f]{64}$/,
        );
    });

    it("without SubtleCrypto it writes no storage key and no id-derived string, and still sends once", async () => {
        vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
        const setItem = vi.spyOn(Storage.prototype, "setItem");
        const tab = await openTab();
        const first = render(<tab.SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        first.rerender(<tab.SignupCompletedEmitter isNewUser userId="user-1" />);
        first.unmount();
        render(<tab.SignupCompletedEmitter isNewUser userId="user-1" />);
        await settle();
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
        expect(setItem).not.toHaveBeenCalled();
        expect(window.localStorage.length).toBe(0);
    });
});

// CHAOS-12574: sign-out's way to the conversation store's live runs.
import { describe, expect, it, vi } from "vitest";

import { cancelLiveRunForSignOut, registerSignOutCancel } from "../signOutCancel";

describe("the sign-out cancel registry", () => {
    it("with no store registered, cancels nothing and resolves", async () => {
        await expect(
            cancelLiveRunForSignOut(new AbortController().signal),
        ).resolves.toBeUndefined();
    });

    it("calls the registered store with sign-out's signal, and waits for it", async () => {
        let finished = false;
        const cancel = vi.fn(async () => {
            await Promise.resolve();
            finished = true;
        });
        const unregister = registerSignOutCancel(cancel);
        const signal = new AbortController().signal;

        await cancelLiveRunForSignOut(signal);

        expect(cancel).toHaveBeenCalledWith(signal);
        expect(finished).toBe(true);
        unregister();
    });

    it("after unregistering, calls nothing; an old unregister leaves a newer store in place", async () => {
        const first = vi.fn(async () => undefined);
        const second = vi.fn(async () => undefined);
        const unregisterFirst = registerSignOutCancel(first);
        const unregisterSecond = registerSignOutCancel(second);

        unregisterFirst();
        await cancelLiveRunForSignOut(new AbortController().signal);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);

        unregisterSecond();
        await cancelLiveRunForSignOut(new AbortController().signal);
        expect(second).toHaveBeenCalledTimes(1);
    });
});

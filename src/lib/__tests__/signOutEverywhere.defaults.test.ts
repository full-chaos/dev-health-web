// @vitest-environment jsdom
// CHAOS-12575: the sign-out every page uses (its default steps) forgets this tab's Ask Dev
// conversation, so the same user's next session restores nothing it cannot read.
import { afterEach, describe, expect, it, vi } from "vitest";

import { THREAD_HINT_KEY } from "@/lib/ask-dev/conversationHint";
import { registerSignOutCancel } from "@/lib/ask-dev/signOutCancel";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("next-auth/react", () => ({ signOut }));

import { signOutEverywhere } from "../signOutEverywhere";

describe("signOutEverywhere with its default steps", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        window.sessionStorage.clear();
    });

    it("forgets this tab's Ask Dev conversation before it signs out", async () => {
        window.sessionStorage.setItem(THREAD_HINT_KEY, '{"thread_id":"thread_x"}');
        let hintAtSignOut: string | null = "unread";
        signOut.mockImplementationOnce(async () => {
            hintAtSignOut = window.sessionStorage.getItem(THREAD_HINT_KEY);
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 204 })),
        );

        await signOutEverywhere();

        expect(signOut).toHaveBeenCalledTimes(1);
        expect(hintAtSignOut).toBeNull();
    });

    // CHAOS-12574: the default first step reaches the registered store, before the token goes.
    it("cancels the registered store's live run first, before anything is revoked", async () => {
        const order: string[] = [];
        const unregister = registerSignOutCancel(async () => {
            order.push("cancel");
        });
        signOut.mockImplementationOnce(async () => {
            order.push("signOut");
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                order.push("fetch");
                return new Response(null, { status: 204 });
            }),
        );

        await signOutEverywhere();
        unregister();

        expect(order[0]).toBe("cancel");
        expect(order.at(-1)).toBe("signOut");
    });
});

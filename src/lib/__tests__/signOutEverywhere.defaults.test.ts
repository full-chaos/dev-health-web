// @vitest-environment jsdom
// CHAOS-12575: the sign-out every page uses (its default steps) forgets this tab's Ask Dev
// conversation, so the same user's next session restores nothing it cannot read.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    THREAD_HINT_KEY,
    UNSAVED_CONVERSATION_KEY,
    UNSAVED_THREAD_KEY,
} from "@/lib/ask-dev/conversationHint";
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

    // CHAOS-12605: left in place, the same user's next session said "Reloading the page started a
    // new one", after a sign-out and a sign-in, not a reload.
    it("forgets this tab's unsaved-conversation marker before it signs out", async () => {
        window.sessionStorage.setItem(UNSAVED_CONVERSATION_KEY, "tag_x");
        window.sessionStorage.setItem(UNSAVED_THREAD_KEY, "thread_x");
        const atSignOut: (string | null)[] = [];
        signOut.mockImplementationOnce(async () => {
            atSignOut.push(
                window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY),
                window.sessionStorage.getItem(UNSAVED_THREAD_KEY),
            );
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 204 })),
        );

        await signOutEverywhere();

        // Empty if sign-out never reached NextAuth.
        expect(atSignOut).toEqual([null, null]);
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

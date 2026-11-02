// @vitest-environment jsdom
// CHAOS-12575: the sign-out every page uses (its default steps) forgets this tab's Ask Dev
// conversation, so the same user's next session restores nothing it cannot read.
import { afterEach, describe, expect, it, vi } from "vitest";

import { THREAD_HINT_KEY } from "@/lib/ask-dev/conversationHint";

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
});

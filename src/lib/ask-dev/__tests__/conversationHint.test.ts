// @vitest-environment jsdom
// CHAOS-12575, CHAOS-12605: sign-out forgets this tab's Ask Dev conversation, so the next session
// of the same user restores nothing it can no longer read, and says no reload lost one.
import { afterEach, describe, expect, it, vi } from "vitest";

import { THREAD_HINT_KEY as STORE_KEY } from "@/components/ask-dev/conversation/conversationStore";

import {
    forgetTabConversation,
    THREAD_HINT_KEY,
    UNSAVED_CONVERSATION_KEY,
    UNSAVED_THREAD_KEY,
} from "../conversationHint";

describe("forgetTabConversation", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        window.sessionStorage.clear();
    });

    it("is the key the conversation store writes its restore hint under", () => {
        expect(THREAD_HINT_KEY).toBe(STORE_KEY);
    });

    it("removes this tab's restore hint and unsaved-conversation marker, and nothing else", () => {
        window.sessionStorage.setItem(THREAD_HINT_KEY, '{"thread_id":"thread_x"}');
        window.sessionStorage.setItem(UNSAVED_CONVERSATION_KEY, "tag_x");
        window.sessionStorage.setItem(UNSAVED_THREAD_KEY, "thread_y");
        window.sessionStorage.setItem("ask-dev:acr-family", "kept");

        forgetTabConversation();

        expect(window.sessionStorage.getItem(THREAD_HINT_KEY)).toBeNull();
        expect(window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY)).toBeNull();
        expect(window.sessionStorage.getItem(UNSAVED_THREAD_KEY)).toBeNull();
        expect(window.sessionStorage.getItem("ask-dev:acr-family")).toBe("kept");
    });

    it("throws when the storage cannot be used, so sign-out logs it", () => {
        vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });

        expect(() => forgetTabConversation()).toThrow("blocked");
    });

    // codex r1 on #1751: one key that cannot be removed must not keep the others.
    it.each([
        ["the restore hint", THREAD_HINT_KEY],
        ["the marker", UNSAVED_CONVERSATION_KEY],
        ["the lost thread", UNSAVED_THREAD_KEY],
    ])("removes every other key when removing %s throws, then throws", (_name, failing) => {
        const keys = [THREAD_HINT_KEY, UNSAVED_CONVERSATION_KEY, UNSAVED_THREAD_KEY];
        const held = new Set(keys);
        vi.spyOn(window, "sessionStorage", "get").mockReturnValue({
            removeItem: (key: string) => {
                if (key === failing) throw new DOMException("blocked", "SecurityError");
                held.delete(key);
            },
        } as unknown as Storage);

        expect(() => forgetTabConversation()).toThrow("blocked");
        expect([...held]).toEqual([failing]);
    });
});

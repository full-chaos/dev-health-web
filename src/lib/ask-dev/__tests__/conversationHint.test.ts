// @vitest-environment jsdom
// CHAOS-12575: sign-out forgets this tab's Ask Dev conversation, so the next session of the same
// user restores nothing it can no longer read.
import { afterEach, describe, expect, it, vi } from "vitest";

import { THREAD_HINT_KEY as STORE_KEY } from "@/components/ask-dev/conversation/conversationStore";

import { forgetThreadHint, THREAD_HINT_KEY } from "../conversationHint";

describe("forgetThreadHint", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        window.sessionStorage.clear();
    });

    it("is the key the conversation store writes its restore hint under", () => {
        expect(THREAD_HINT_KEY).toBe(STORE_KEY);
    });

    it("removes this tab's restore hint and nothing else", () => {
        window.sessionStorage.setItem(THREAD_HINT_KEY, '{"thread_id":"thread_x"}');
        window.sessionStorage.setItem("ask-dev:acr-family", "kept");

        forgetThreadHint();

        expect(window.sessionStorage.getItem(THREAD_HINT_KEY)).toBeNull();
        expect(window.sessionStorage.getItem("ask-dev:acr-family")).toBe("kept");
    });

    it("throws when the storage cannot be used, so sign-out logs it", () => {
        vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });

        expect(() => forgetThreadHint()).toThrow("blocked");
    });
});

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding/track", () => ({
    trackOnboardingEvent: (...args: unknown[]) => trackOnboardingEvent(...args),
}));

import { hashIdentifier } from "@/lib/telemetry/hash";

import { resetSignupCompletedForTests, SignupCompletedEmitter } from "./SignupCompletedEmitter";

describe("SignupCompletedEmitter", () => {
    beforeEach(() => {
        trackOnboardingEvent.mockReset();
        resetSignupCompletedForTests();
        window.localStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("sends signup_completed once for a new user, with no payload", async () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        expect(trackOnboardingEvent).toHaveBeenCalledWith("signup_completed");
    });

    it("does not send it again on a re-render, a remount or a later page life", async () => {
        const first = render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        first.rerender(<SignupCompletedEmitter isNewUser userId="user-1" />);
        first.unmount();
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        resetSignupCompletedForTests();
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("sends nothing for a user who is not new, or without a user id", async () => {
        render(<SignupCompletedEmitter isNewUser={false} userId="user-1" />);
        render(<SignupCompletedEmitter isNewUser userId={null} />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(trackOnboardingEvent).not.toHaveBeenCalled();
    });

    it("sends once per user", async () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        render(<SignupCompletedEmitter isNewUser userId="user-2" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(2), {
            timeout: 5000,
        });
    });

    it("still sends once per page life when storage throws", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const first = render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        first.unmount();
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("keeps no raw id or e-mail in storage: the key holds only a hash of the user id", async () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1@example.com" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        const keys = Object.keys(window.localStorage);
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatch(/^devhealth-signup-completed:[0-9a-f]{64}$/);
        expect(keys[0]).not.toContain("user-1");
        expect(keys[0]).not.toContain("example.com");
        expect(window.localStorage.getItem(keys[0] ?? "")).toBe("1");
    });

    it("uses the same key for the same user in a later page life and a different one per user", async () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        const first = Object.keys(window.localStorage);
        render(<SignupCompletedEmitter isNewUser userId="user-2" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(2), {
            timeout: 5000,
        });
        const both = Object.keys(window.localStorage);
        expect(both).toHaveLength(2);
        expect(both).toContain(first[0]);
    });

    it("keys on a domain-separated digest, not the plain hash the anonymous id uses", async () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        await waitFor(() => expect(trackOnboardingEvent).toHaveBeenCalledTimes(1), {
            timeout: 5000,
        });
        const plain = await hashIdentifier("user-1");
        expect(Object.keys(window.localStorage)).not.toContain(
            `devhealth-signup-completed:${plain}`,
        );
    });
});

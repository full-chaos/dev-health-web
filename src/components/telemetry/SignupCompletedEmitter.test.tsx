import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding/track", () => ({
    trackOnboardingEvent: (...args: unknown[]) => trackOnboardingEvent(...args),
}));

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

    it("sends signup_completed once for a new user, with no payload", () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
        expect(trackOnboardingEvent).toHaveBeenCalledWith("signup_completed");
    });

    it("does not send it again on a re-render, a remount or a later page life", () => {
        const first = render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        first.rerender(<SignupCompletedEmitter isNewUser userId="user-1" />);
        first.unmount();
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        resetSignupCompletedForTests();
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("sends nothing for a user who is not new, or without a user id", () => {
        render(<SignupCompletedEmitter isNewUser={false} userId="user-1" />);
        render(<SignupCompletedEmitter isNewUser userId={null} />);
        expect(trackOnboardingEvent).not.toHaveBeenCalled();
    });

    it("sends once per user", () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        render(<SignupCompletedEmitter isNewUser userId="user-2" />);
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(2);
    });

    it("still sends once per page life when storage throws", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const first = render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        first.unmount();
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        expect(trackOnboardingEvent).toHaveBeenCalledTimes(1);
    });

    it("keeps no e-mail in storage: the key holds only the opaque user id", () => {
        render(<SignupCompletedEmitter isNewUser userId="user-1" />);
        const keys = Object.keys(window.localStorage);
        expect(keys).toEqual(["devhealth-signup-completed:user-1"]);
        expect(window.localStorage.getItem(keys[0] ?? "")).toBe("1");
    });
});

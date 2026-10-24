import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendBeacon = vi.fn();
vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        sendBeacon: (...args: unknown[]) => sendBeacon(...args),
        request: vi.fn().mockResolvedValue(new Response("{}")),
    },
}));

import { resetTelemetryForTests } from "@/lib/telemetry";

import { resetSignupCompletedForTests, SignupCompletedEmitter } from "./SignupCompletedEmitter";

describe("SignupCompletedEmitter on the wire", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        resetTelemetryForTests();
        resetSignupCompletedForTests();
        window.localStorage.clear();
        delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
    });

    it("posts one intake-shaped feature_viewed event for the new user and no identifier", async () => {
        render(<SignupCompletedEmitter isNewUser userId="user-123" />);

        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1), { timeout: 5000 });
        const body = sendBeacon.mock.calls[0]?.[1] as string;
        expect(body).not.toContain("user-123");
        const parsed = JSON.parse(body) as {
            events: {
                name: string;
                eventId: string;
                sessionId: string;
                anonymousUserId: string;
                payload: Record<string, unknown>;
            }[];
        };
        const event = parsed.events[0];
        expect(event?.name).toBe("feature_viewed");
        expect(event?.payload.surface).toBe("signup_completed");
        expect(event?.eventId).toBeTruthy();
        expect(event?.sessionId).toBeTruthy();
        expect(event?.anonymousUserId).toBeTruthy();
    });

    it("posts nothing when telemetry is disabled", async () => {
        process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = "false";
        render(<SignupCompletedEmitter isNewUser userId="user-123" />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(sendBeacon).not.toHaveBeenCalled();
    });
});

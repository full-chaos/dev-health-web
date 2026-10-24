import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

const sendBeacon = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/lib/origin", () => ({ resolveOrigin: () => "http://localhost:3000" }));
vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        sendBeacon: (...args: unknown[]) => sendBeacon(...args),
        request: vi.fn().mockResolvedValue(new Response("{}")),
    },
}));

import { resetTelemetryForTests } from "@/lib/telemetry";

import { SignupForm } from "./SignupForm";

describe("SignupForm funnel event on the wire", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        resetTelemetryForTests();
        delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
    });
    afterEach(() => {
        vi.restoreAllMocks();
        mockPush.mockReset();
    });

    it("posts one intake-shaped feature_viewed event with surface signup_completed", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
            new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
        );
        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();
        await user.type(screen.getByLabelText("Email"), "test@example.com");
        await user.type(screen.getByLabelText("Password"), "password12345");
        await user.click(screen.getByRole("checkbox"));
        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const body = sendBeacon.mock.calls[0]?.[1] as string;
        expect(body).not.toContain("test@example.com");
        const parsed = JSON.parse(body) as {
            source: string;
            events: {
                name: string;
                eventId: string;
                sessionId: string;
                anonymousUserId: string;
                payload: Record<string, unknown>;
            }[];
        };
        expect(parsed.source).toBe("dev-health-web");
        expect(parsed.events).toHaveLength(1);
        const event = parsed.events[0];
        expect(event?.name).toBe("feature_viewed");
        expect(event?.payload.feature).toBe("onboarding_funnel");
        expect(event?.payload.surface).toBe("signup_completed");
        expect(event?.eventId).toBeTruthy();
        expect(event?.sessionId).toBeTruthy();
        expect(event?.anonymousUserId).toBeTruthy();
    });
});

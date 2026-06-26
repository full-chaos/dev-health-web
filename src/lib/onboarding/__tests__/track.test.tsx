import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendBeacon = vi.fn();
const request = vi.fn();

vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        sendBeacon: (...args: unknown[]) => sendBeacon(...args),
        request: (...args: unknown[]) => request(...args),
    },
}));

import { trackOnboardingEvent } from "../track";

const TELEMETRY_FLAG = "NEXT_PUBLIC_TELEMETRY_ENABLED";

describe("trackOnboardingEvent", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        request.mockReset().mockResolvedValue(new Response("{}"));
        delete process.env[TELEMETRY_FLAG];
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env[TELEMETRY_FLAG];
    });

    it("emits a beacon with the funnel event name and payload when telemetry is enabled", () => {
        trackOnboardingEvent("workspace_created", { orgId: "org-123" });

        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const [path, body] = sendBeacon.mock.calls[0] as [string, string];
        expect(path).toBe("/api/v1/product-telemetry/events");
        const parsed = JSON.parse(body) as {
            orgIdHash: string | null;
            events: { name: string; payload: { orgId?: string } }[];
        };
        expect(parsed.orgIdHash).toBe("org-123");
        expect(parsed.events[0]?.name).toBe("workspace_created");
        expect(parsed.events[0]?.payload.orgId).toBe("org-123");
        expect(request).not.toHaveBeenCalled();
    });

    it("falls back to a keep-alive POST when sendBeacon is unavailable", () => {
        sendBeacon.mockReturnValue(false);

        trackOnboardingEvent("integration_step_viewed");

        expect(request).toHaveBeenCalledTimes(1);
        const [path, init] = request.mock.calls[0] as [string, RequestInit & { keepalive?: boolean }];
        expect(path).toBe("/api/v1/product-telemetry/events");
        expect(init.method).toBe("POST");
        expect(init.keepalive).toBe(true);
    });

    it("does not emit when NEXT_PUBLIC_TELEMETRY_ENABLED is false", () => {
        process.env[TELEMETRY_FLAG] = "false";

        trackOnboardingEvent("github_app_install_started");

        expect(sendBeacon).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });

    it("ignores names outside the frozen funnel vocabulary", () => {
        // @ts-expect-error — exercising the runtime guard against unknown names.
        trackOnboardingEvent("not_a_real_event");

        expect(sendBeacon).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });
});

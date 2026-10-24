import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendBeacon = vi.fn();
const request = vi.fn();

vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        sendBeacon: (...args: unknown[]) => sendBeacon(...args),
        request: (...args: unknown[]) => request(...args),
    },
}));

import { resetTelemetryForTests } from "@/lib/telemetry";
import { fallbackHash } from "@/lib/telemetry/hash";

import {
    resetOnboardingOnceTracking,
    trackOnboardingEvent,
    trackOnboardingEventOnce,
} from "../track";

const TELEMETRY_FLAG = "NEXT_PUBLIC_TELEMETRY_ENABLED";

describe("trackOnboardingEvent", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        request.mockReset().mockResolvedValue(new Response("{}"));
        delete process.env[TELEMETRY_FLAG];
        resetOnboardingOnceTracking();
        resetTelemetryForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env[TELEMETRY_FLAG];
    });

    it("hashes the org id into orgIdHash and sanitizes the raw id out of the payload", () => {
        trackOnboardingEvent("workspace_created", { orgId: "org-123" });

        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const [path, body] = sendBeacon.mock.calls[0] as [string, string];
        expect(path).toBe("/api/v1/product-telemetry/events");
        const parsed = JSON.parse(body) as {
            orgIdHash: string | null;
            events: { name: string; payload: { orgId?: string } }[];
        };
        // The raw org id is never emitted: it is pseudonymised into orgIdHash
        // (matching the main telemetry pipeline) and stripped from the payload.
        expect(parsed.orgIdHash).toBe(fallbackHash("org-123"));
        expect(parsed.orgIdHash).not.toBe("org-123");
        expect(parsed.events[0]?.name).toBe("feature_viewed");
        expect(parsed.events[0]?.payload.orgId).toBeUndefined();
        expect(request).not.toHaveBeenCalled();
    });

    it("sends nothing for an out-of-bounds value and drops the event", () => {
        process.env[TELEMETRY_FLAG] = "true";
        trackOnboardingEvent("workspace_created", { step: "ada@example.com" });

        expect(sendBeacon).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
        trackOnboardingEvent("workspace_created", { step: "name_org" });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("falls back to a keep-alive POST when sendBeacon is unavailable", () => {
        sendBeacon.mockReturnValue(false);

        trackOnboardingEvent("integration_step_viewed");

        expect(request).toHaveBeenCalledTimes(1);
        const [path, init] = request.mock.calls[0] as [
            string,
            RequestInit & { keepalive?: boolean },
        ];
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

    it("trackOnboardingEventOnce emits only once across repeated calls (StrictMode/remount safe)", () => {
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });

        expect(sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("trackOnboardingEventOnce keys on org id so distinct orgs each emit once", () => {
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-2" });

        expect(sendBeacon).toHaveBeenCalledTimes(2);
    });

    it("resetOnboardingOnceTracking clears the one-shot guard", () => {
        trackOnboardingEventOnce("workspace_setup_started");
        expect(sendBeacon).toHaveBeenCalledTimes(1);

        resetOnboardingOnceTracking();
        trackOnboardingEventOnce("workspace_setup_started");
        expect(sendBeacon).toHaveBeenCalledTimes(2);
    });
});

describe("trackOnboardingEvent wire shape", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        request.mockReset().mockResolvedValue(new Response("{}"));
        delete process.env[TELEMETRY_FLAG];
        resetOnboardingOnceTracking();
        resetTelemetryForTests();
    });

    type Posted = {
        events: {
            name: string;
            eventId: string;
            sessionId: string;
            anonymousUserId: string;
            routePattern: string | null;
            payload: Record<string, unknown>;
        }[];
    };
    const posted = (index: number): Posted =>
        JSON.parse((sendBeacon.mock.calls[index] as [string, string])[1]) as Posted;

    it("sends the funnel event as feature_viewed with the funnel name as the surface", () => {
        trackOnboardingEvent("workspace_created", { orgId: "org-123", step: "intro" });
        const event = posted(0).events[0];
        expect(event?.name).toBe("feature_viewed");
        expect(event?.payload.feature).toBe("onboarding_funnel");
        expect(event?.payload.surface).toBe("workspace_created");
        expect(typeof event?.payload.routePattern).toBe("string");
        expect(event?.payload.step).toBe("intro");
        expect(event?.payload.orgId).toBeUndefined();
    });

    it("carries a fresh eventId per event and one session and anonymous id across events", () => {
        trackOnboardingEvent("workspace_created", {});
        trackOnboardingEvent("first_sync_started", {});
        const [a, b] = [posted(0).events[0], posted(1).events[0]];
        expect(a?.eventId).toBeTruthy();
        expect(a?.eventId).not.toBe(b?.eventId);
        expect(a?.sessionId).toBeTruthy();
        expect(a?.sessionId).toBe(b?.sessionId);
        expect(a?.anonymousUserId).toBeTruthy();
        expect(a?.anonymousUserId).toBe(b?.anonymousUserId);
    });

    it("treats an undefined payload value as absent instead of dropping the event", () => {
        trackOnboardingEvent("integration_skipped", { step: undefined, reason: undefined });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const event = posted(0).events[0];
        expect("step" in (event?.payload ?? {})).toBe(false);
        expect("reason" in (event?.payload ?? {})).toBe(false);
    });

    it("still drops the event for an out-of-bounds value", () => {
        trackOnboardingEvent("integration_skipped", { step: "ada@example.com", other: undefined });
        expect(sendBeacon).not.toHaveBeenCalled();
    });

    it("drops every payload key that is not on the closed list, whatever its spelling", () => {
        trackOnboardingEvent("workspace_created", {
            org_id: "org-123",
            user_id: "user-456",
            OrgID: "org-789",
            ownerRef: "o-1",
            anything: "x",
            step: "intro",
        });
        const event = posted(0).events[0];
        expect(Object.keys(event?.payload ?? {}).sort()).toEqual([
            "feature",
            "routePattern",
            "step",
            "surface",
        ]);
        expect(sendBeacon.mock.calls[0]?.[1]).not.toMatch(/org-123|user-456|org-789|o-1/);
    });
});

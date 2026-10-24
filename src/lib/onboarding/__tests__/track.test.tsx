import { waitFor } from "@testing-library/react";
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

import {
    resetOnboardingOnceTracking,
    trackOnboardingEvent,
    trackOnboardingEventOnce,
} from "../track";

const TELEMETRY_FLAG = "NEXT_PUBLIC_TELEMETRY_ENABLED";
// sha256("org-123"), lowercase hex: the recipe the ops read side joins on.
const ORG_123_SHA256 = "83e582565905f7e5bc0074cd776abd13d7ca413991011906c51d96696b92c199";

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

    it("hashes the org id into orgIdHash and sanitizes the raw id out of the payload", async () => {
        trackOnboardingEvent("workspace_created", { orgId: "org-123" });

        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        const [path, body] = sendBeacon.mock.calls[0] as [string, string];
        expect(path).toBe("/api/v1/product-telemetry/events");
        const parsed = JSON.parse(body) as {
            orgIdHash: string | null;
            events: { name: string; payload: { orgId?: string } }[];
        };
        // The raw org id is never emitted: it is pseudonymised into orgIdHash
        // (matching the main telemetry pipeline) and stripped from the payload.
        expect(parsed.orgIdHash).toBe(ORG_123_SHA256);
        expect(parsed.orgIdHash).not.toBe("org-123");
        expect(parsed.events[0]?.name).toBe("feature_viewed");
        expect(parsed.events[0]?.payload.orgId).toBeUndefined();
        expect(request).not.toHaveBeenCalled();
    });

    it("sends the event without a step value that is out of bounds", () => {
        process.env[TELEMETRY_FLAG] = "true";
        trackOnboardingEvent("workspace_created", { step: "ada@example.com" });

        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const body = sendBeacon.mock.calls[0]?.[1] as string;
        expect(body).not.toContain("ada@example.com");
        expect("step" in JSON.parse(body).events[0].payload).toBe(false);
        expect(request).not.toHaveBeenCalled();
    });

    it("keeps a small non-negative integer step", () => {
        trackOnboardingEvent("workspace_created", { step: 3 });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        expect(JSON.parse(sendBeacon.mock.calls[0]?.[1] as string).events[0].payload.step).toBe(3);
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

    it("trackOnboardingEventOnce emits only once across repeated calls (StrictMode/remount safe)", async () => {
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });

        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("trackOnboardingEventOnce keys on org id so distinct orgs each emit once", async () => {
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-1" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-2" });

        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(2));
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

    it("sends the funnel event as feature_viewed with the funnel name as the surface", async () => {
        trackOnboardingEvent("workspace_created", { orgId: "org-123", step: 2 });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        const event = posted(0).events[0];
        expect(event?.name).toBe("feature_viewed");
        expect(event?.payload.feature).toBe("onboarding_funnel");
        expect(event?.payload.surface).toBe("workspace_created");
        expect(typeof event?.payload.routePattern).toBe("string");
        expect(event?.payload.step).toBe(2);
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

    it.each([
        ["an e-mail", "ada@example.com"],
        ["a UUID", "123e4567-e89b-12d3-a456-426614174000"],
        ["an id-like value", "usr_8f2a91c3b7d4"],
        ["a plain word", "intro"],
        ["a negative number", -1],
        ["a large number", 100],
        ["a fraction", 1.5],
        ["a numeric id", 4815162342],
        ["a boolean", true],
        ["null", null],
    ])("drops a step value that is %s and still sends the event", (_label, value) => {
        trackOnboardingEvent("integration_skipped", { step: value as never, other: undefined });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const body = sendBeacon.mock.calls[0]?.[1] as string;
        expect("step" in JSON.parse(body).events[0].payload).toBe(false);
        if (typeof value === "string") expect(body).not.toContain(value);
    });

    it("drops every payload key that is not on the closed list, whatever its spelling", () => {
        trackOnboardingEvent("workspace_created", {
            org_id: "org-123",
            user_id: "user-456",
            OrgID: "org-789",
            ownerRef: "o-1",
            anything: "x",
            step: 2,
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

    it.each([
        ["org_id", "org-111"],
        ["user_id", "user-222"],
        ["orgId", "org-333"],
        ["userId", "user-444"],
        ["e-mail", "mail-555"],
        ["ada@example.com", "mail-666"],
        ["contact_email", "mail-777"],
        ["tenant", "ten-888"],
        ["email", "ada.lovelace@example.com"],
        ["user_email", "grace.hopper@example.com"],
    ])("never sends the extra key %s", async (key, value) => {
        trackOnboardingEvent("workspace_created", { [key]: value, step: 2 });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        const body = sendBeacon.mock.calls[0]?.[1] as string;
        expect(body).not.toContain(value);
        expect(Object.keys(posted(0).events[0]?.payload ?? {})).not.toContain(key);
    });

    it("sends only the listed extra key for any key a caller passes", () => {
        const extras: Record<string, string> = {};
        for (let i = 0; i < 40; i += 1) extras[`key_${i}`] = `val-${i}`;
        trackOnboardingEvent("first_sync_started", { ...extras, step: 2 });
        const keys = Object.keys(posted(0).events[0]?.payload ?? {}).sort();
        expect(keys).toEqual(["feature", "routePattern", "step", "surface"]);
    });
});

describe("trackOnboardingEvent org digest", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        request.mockReset().mockResolvedValue(new Response("{}"));
        delete process.env[TELEMETRY_FLAG];
        resetOnboardingOnceTracking();
        resetTelemetryForTests();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const bodyOf = (
        index: number,
    ): { orgIdHash: string | null; events: { orgIdHash: string | null }[] } =>
        JSON.parse((sendBeacon.mock.calls[index] as [string, string])[1]);

    it("sends the SHA-256 org digest at the top level and on the event", async () => {
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-123" });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        expect(bodyOf(0).orgIdHash).toBe(ORG_123_SHA256);
        expect(bodyOf(0).events[0]?.orgIdHash).toBe(ORG_123_SHA256);
    });

    it("sends synchronously once the org digest is cached", async () => {
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-123" });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        trackOnboardingEvent("github_app_install_started", { orgId: "org-123" });
        expect(sendBeacon).toHaveBeenCalledTimes(2);
        expect(bodyOf(1).orgIdHash).toBe(ORG_123_SHA256);
    });

    it("sends with no org digest when there is no org", () => {
        trackOnboardingEvent("workspace_setup_started", { orgId: null });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        expect(bodyOf(0).orgIdHash).toBeNull();
    });

    it("sends the event with a null org digest and no fnv value without SubtleCrypto", async () => {
        vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
        trackOnboardingEvent("workspace_created", { orgId: "org-123" });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        const raw = (sendBeacon.mock.calls[0] as [string, string])[1];
        expect(bodyOf(0).orgIdHash).toBeNull();
        expect(bodyOf(0).events[0]?.orgIdHash).toBeNull();
        expect(raw).not.toMatch(/fnv1a/);
        expect(raw).not.toContain("org-123");
    });

    it("keeps the once-per-page dedupe across the async first send", async () => {
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-123" });
        trackOnboardingEventOnce("integration_step_viewed", { orgId: "org-123" });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("sends concurrent first events for one org in call order, from one digest", async () => {
        const pending: Array<(digest: ArrayBuffer) => void> = [];
        const digest = vi.fn(
            () =>
                new Promise<ArrayBuffer>((resolve) => {
                    pending.push(resolve);
                }),
        );
        vi.stubGlobal("crypto", {
            randomUUID: () => "00000000-0000-4000-8000-000000000000",
            subtle: { digest },
        });
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-123" });
        trackOnboardingEvent("github_app_install_started", { orgId: "org-123" });
        trackOnboardingEvent("integration_skipped", { orgId: "org-123" });
        // Resolve in reverse order: with one digest per call the last event would go first.
        for (const resolve of [...pending].reverse()) resolve(new Uint8Array(32).buffer);
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(3));
        const surfaces = sendBeacon.mock.calls.map(
            (call) => JSON.parse((call as [string, string])[1]).events[0].payload.surface,
        );
        expect(surfaces).toEqual([
            "integration_step_viewed",
            "github_app_install_started",
            "integration_skipped",
        ]);
        expect(digest).toHaveBeenCalledTimes(1);
    });

    it("keeps a cached-org event behind earlier events still waiting for the digest", async () => {
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-123" });
        trackOnboardingEvent("github_app_install_started", { orgId: "org-123" });
        expect(sendBeacon).not.toHaveBeenCalled();
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(2));
        const surfaces = sendBeacon.mock.calls.map(
            (call) => JSON.parse((call as [string, string])[1]).events[0].payload.surface,
        );
        expect(surfaces).toEqual(["integration_step_viewed", "github_app_install_started"]);
    });

    it("drops the events waiting on a rejected digest, caches nothing, and retries on the next call", async () => {
        const digest = vi
            .fn()
            .mockRejectedValueOnce(new Error("digest failed"))
            .mockResolvedValue(new Uint8Array(32).buffer);
        vi.stubGlobal("crypto", {
            randomUUID: () => "00000000-0000-4000-8000-000000000000",
            subtle: { digest },
        });
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-123" });
        trackOnboardingEvent("github_app_install_started", { orgId: "org-123" });
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(sendBeacon).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();

        trackOnboardingEvent("integration_skipped", { orgId: "org-123" });
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        expect(digest).toHaveBeenCalledTimes(2);
        const raw = (sendBeacon.mock.calls[0] as [string, string])[1];
        expect(JSON.parse(raw).events[0].payload.surface).toBe("integration_skipped");
        expect(JSON.parse(raw).orgIdHash).toMatch(/^[0-9a-f]{64}$/);
        for (const call of sendBeacon.mock.calls) {
            expect((call as [string, string])[1]).not.toContain("org-123");
        }
    });

    it("never makes an event wait on another org's pending digest", async () => {
        const resolvers: Array<(digest: ArrayBuffer) => void> = [];
        const digest = vi.fn(
            () =>
                new Promise<ArrayBuffer>((resolve) => {
                    resolvers.push(resolve);
                }),
        );
        vi.stubGlobal("crypto", {
            randomUUID: () => "00000000-0000-4000-8000-000000000000",
            subtle: { digest },
        });
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-a" });
        trackOnboardingEvent("integration_step_viewed", { orgId: "org-b" });
        expect(digest).toHaveBeenCalledTimes(2);
        resolvers[1]?.(new Uint8Array(32).buffer);
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(1));
        resolvers[0]?.(new Uint8Array(32).buffer);
        await waitFor(() => expect(sendBeacon).toHaveBeenCalledTimes(2));
    });
});

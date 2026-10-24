// Pinned copy of the ops product-telemetry intake rules.
// Source: dev-health-ops internal/api/producttelemetry/producttelemetry.go
// (blob 364d64313e3c at origin/main d09b1bc002074324f610752d7c1c116a741662c9).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendBeacon = vi.fn();
vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        sendBeacon: (...args: unknown[]) => sendBeacon(...args),
        request: vi.fn().mockResolvedValue(new Response("{}")),
    },
}));

import { resetTelemetryForTests } from "@/lib/telemetry";

import { ONBOARDING_EVENTS } from "../events";
import { resetOnboardingOnceTracking, trackOnboardingEvent } from "../track";

const OPS_EVENT_NAMES = [
    "page_viewed",
    "feature_viewed",
    "filter_changed",
    "chart_interacted",
    "navigation_interacted",
    "guide_opened",
    "session_started",
    "session_ended",
    "client_error",
];

const isString = (value: unknown): value is string => typeof value === "string";

function opsProblems(body: unknown): string[] {
    const problems: string[] = [];
    const batch = body as Record<string, unknown>;
    if ("source" in batch && batch.source !== "dev-health-web") problems.push("source");
    if (batch.orgIdHash != null && !isString(batch.orgIdHash)) problems.push("orgIdHash");
    const events = batch.events;
    if (!Array.isArray(events) || events.length < 1 || events.length > 500) {
        return [...problems, "events"];
    }
    events.forEach((event: Record<string, unknown>, index) => {
        if (!isString(event.name) || !OPS_EVENT_NAMES.includes(event.name)) {
            problems.push(`events.${index}.name`);
        }
        for (const key of ["schemaVersion", "eventId", "sessionId", "anonymousUserId"]) {
            if (!isString(event[key])) problems.push(`events.${index}.${key}`);
        }
        if (!isString(event.ts) || Number.isNaN(Date.parse(event.ts))) {
            problems.push(`events.${index}.ts`);
        }
        for (const key of ["orgIdHash", "routePattern"]) {
            if (event[key] != null && !isString(event[key]))
                problems.push(`events.${index}.${key}`);
        }
        const payload = event.payload as Record<string, unknown> | undefined;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            problems.push(`events.${index}.payload`);
        } else {
            for (const value of Object.values(payload)) {
                if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
                    problems.push(`events.${index}.payload.value`);
                }
            }
        }
    });
    return problems;
}

describe("onboarding funnel events against the ops intake rules", () => {
    beforeEach(() => {
        sendBeacon.mockReset().mockReturnValue(true);
        resetOnboardingOnceTracking();
        resetTelemetryForTests();
        delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(ONBOARDING_EVENTS)("%s is accepted by the intake validator", (name) => {
        trackOnboardingEvent(name, { orgId: "org-123", step: "intro" });
        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const body = JSON.parse((sendBeacon.mock.calls[0] as [string, string])[1]) as unknown;
        expect(opsProblems(body)).toEqual([]);
    });

    it("the pinned validator refuses the old shape", () => {
        const old = {
            source: "dev-health-web",
            orgIdHash: null,
            events: [
                {
                    name: "workspace_created",
                    schemaVersion: "v",
                    ts: new Date().toISOString(),
                    payload: {},
                },
            ],
        };
        expect(opsProblems(old)).toEqual(
            expect.arrayContaining([
                "events.0.name",
                "events.0.eventId",
                "events.0.sessionId",
                "events.0.anonymousUserId",
            ]),
        );
    });
});

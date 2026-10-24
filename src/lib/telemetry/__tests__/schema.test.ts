import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ONBOARDING_EVENTS } from "@/lib/onboarding/events";

import { ROUTE_TEMPLATES } from "../routePatterns";
import {
    applyTelemetrySchema,
    CHARTS,
    CHART_ACTIONS,
    FILTER_KEYS,
    FILTER_VIEWS,
    isKnownRoutePattern,
    APP_ROUTES,
    canonicalRoute,
    closeTelemetryEvent,
    STATIC_ROUTE_SEGMENTS,
    UNMATCHED_ROUTE,
    TELEMETRY_SCHEMA,
} from "../schema";
import type { TelemetryEventName, TelemetryPayloadByName } from "../types";

const VALID: { [Name in TelemetryEventName]?: TelemetryPayloadByName[Name] } = {
    page_viewed: { routePattern: "/metrics", page: "/metrics", referrerRoutePattern: null },
    feature_viewed: { feature: "metrics", surface: "route", routePattern: "/metrics" },
    filter_changed: { view: "metrics", filterKey: "repo", valueCount: 2, isCustomDateRange: null },
    chart_interacted: {
        chart: "quadrant",
        action: "overlay_toggled",
        surface: "quadrant_panel",
        scope: "team",
    },
    session_started: { entryRoutePattern: "/metrics" },
    session_ended: { durationMs: 1200, pagesViewed: 3, interactions: 4 },
    client_error: {
        boundary: "route",
        digest: "123456",
        errorClass: "TypeError",
        routePattern: "/metrics",
    },
};

const accepted = (name: TelemetryEventName, payload: Record<string, unknown>) => {
    const result = applyTelemetrySchema(name, payload);
    if (!result.ok) throw new Error(`rejected on ${result.key}`);
    return result.payload;
};

describe("applyTelemetrySchema", () => {
    it.each(Object.entries(VALID))("keeps a valid %s payload unchanged", (name, payload) => {
        expect(accepted(name as TelemetryEventName, payload as Record<string, unknown>)).toEqual(
            payload,
        );
    });

    it("rejects feature_viewed with surface org-123 (a required field outside its set)", () => {
        const result = applyTelemetrySchema("feature_viewed", {
            feature: "metrics",
            surface: "org-123",
            routePattern: "/metrics",
        });
        expect(result).toEqual({ ok: false, key: "surface" });
    });

    it("drops usr_8f2a91c3b7d4 as an optional chart scope and keeps the event", () => {
        const payload = accepted("chart_interacted", {
            ...VALID.chart_interacted,
            scope: "usr_8f2a91c3b7d4",
        });
        expect("scope" in payload).toBe(false);
        expect(JSON.stringify(payload)).not.toContain("usr_8f2a91c3b7d4");
    });

    it.each(Object.keys(VALID))("drops an extra ownerRef key from %s", (name) => {
        const payload = accepted(name as TelemetryEventName, {
            ...(VALID[name as keyof typeof VALID] as object),
            ownerRef: "o-1",
            org_id: "org-123",
            OrgID: "org-789",
            userId: "u-1",
        });
        expect(Object.keys(payload).some((k) => /owner|org|user/i.test(k))).toBe(false);
        expect(JSON.stringify(payload)).not.toMatch(/o-1|org-123|org-789|u-1/);
    });

    it("rejects an event whose required field is missing or undefined", () => {
        expect(applyTelemetrySchema("session_started", {})).toEqual({
            ok: false,
            key: "entryRoutePattern",
        });
        expect(applyTelemetrySchema("session_started", { entryRoutePattern: undefined })).toEqual({
            ok: false,
            key: "entryRoutePattern",
        });
    });

    it("rejects an unknown event name", () => {
        expect(applyTelemetrySchema("order_placed" as TelemetryEventName, {}).ok).toBe(false);
    });

    it.each([
        ["a negative count", { durationMs: -1, pagesViewed: 1, interactions: 1 }],
        ["a fraction", { durationMs: 1.5, pagesViewed: 1, interactions: 1 }],
        ["a huge count", { durationMs: 1, pagesViewed: 1e9, interactions: 1 }],
        ["a string count", { durationMs: "5", pagesViewed: 1, interactions: 1 }],
    ])("rejects session_ended with %s", (_label, payload) => {
        expect(applyTelemetrySchema("session_ended", payload).ok).toBe(false);
    });

    it("does not read inherited keys", () => {
        const payload = Object.create({ entryRoutePattern: "/metrics" }) as Record<string, unknown>;
        expect(applyTelemetrySchema("session_started", payload).ok).toBe(false);
    });

    it("drops a client_error digest that is not numeric and an errorClass outside the list is rejected", () => {
        const payload = accepted("client_error", {
            ...VALID.client_error,
            digest: "ada@example.com",
        });
        expect("digest" in payload).toBe(false);
        expect(
            applyTelemetrySchema("client_error", {
                ...VALID.client_error,
                errorClass: "CustomerAcmeError",
            }),
        ).toEqual({ ok: false, key: "errorClass" });
    });
});

describe("onboarding funnel shape", () => {
    it.each(ONBOARDING_EVENTS)(
        "admits feature_viewed onboarding_funnel / %s with only the step as an extra key",
        (surface) => {
            const payload = accepted("feature_viewed", {
                feature: "onboarding_funnel",
                surface,
                routePattern: "/auth/onboard",
                step: 2,
            });
            expect(payload).toEqual({
                feature: "onboarding_funnel",
                surface,
                routePattern: "/auth/onboard",
                step: 2,
            });
        },
    );

    it("rejects an onboarding surface under a chart or a non-funnel feature", () => {
        expect(
            applyTelemetrySchema("chart_interacted", {
                ...VALID.chart_interacted,
                surface: "signup_completed",
            }),
        ).toEqual({ ok: false, key: "surface" });
        expect(
            applyTelemetrySchema("feature_viewed", {
                feature: "onboarding",
                surface: "route",
                routePattern: "/metrics",
            }),
        ).toEqual({ ok: false, key: "feature" });
    });
});

describe("the optional onboarding step", () => {
    const base = {
        feature: "onboarding_funnel",
        surface: "workspace_created",
        routePattern: "/auth/onboard",
    };

    it.each([0, 1, 99])("keeps step %s", (step) => {
        expect(accepted("feature_viewed", { ...base, step }).step).toBe(step);
    });

    it.each([-1, 100, 1.5, 4815162342, "3", "ada@example.com", true, Number.NaN])(
        "drops step %s and keeps the event",
        (step) => {
            const payload = accepted("feature_viewed", { ...base, step });
            expect("step" in payload).toBe(false);
        },
    );
});

describe("route values", () => {
    it.each([
        "/",
        "/metrics",
        "/people/[person_id]",
        "/org/admin/sync/[configId]/runs/[runId]",
        "/[unmatched]",
    ])("accepts %s", (value) => expect(isKnownRoutePattern(value)).toBe(true));

    it.each([
        "/org-123",
        "/metrics/settings",
        "/people/metrics",
        "/org/admin/people",
        "/[id]",
        "/people/usr_8f2a91c3b7d4",
        "/metrics/ada@example.com",
        "metrics",
        "/metrics?tab=a",
        "/people/550e8400-e29b-41d4-a716-446655440000",
        "/" + "a".repeat(300),
        "",
        5,
        null,
    ])("rejects %s", (value) => expect(isKnownRoutePattern(value)).toBe(false));

    it("sends an id-shaped page route as the fixed unmatched constant, with no path data", () => {
        const payload = accepted("page_viewed", {
            routePattern: "/people/usr_8f2a91c3b7d4",
            page: "/org-123",
            referrerRoutePattern: "/x/ada@example.com",
        });
        expect(payload).toEqual({
            routePattern: UNMATCHED_ROUTE,
            page: UNMATCHED_ROUTE,
            referrerRoutePattern: UNMATCHED_ROUTE,
        });
        expect(JSON.stringify(payload)).not.toMatch(/usr_|org-123|ada/);
    });

    it("rejects a non-string route and keeps a null referrer", () => {
        expect(applyTelemetrySchema("page_viewed", { routePattern: 5, page: "/metrics" })).toEqual({
            ok: false,
            key: "routePattern",
        });
        const payload = accepted("page_viewed", {
            ...VALID.page_viewed,
            referrerRoutePattern: null,
        });
        expect(payload.referrerRoutePattern).toBeNull();
    });
});

describe("closed sets are pinned to the code that feeds them", () => {
    const APP_ROOT = path.resolve(__dirname, "../../../app");

    function appRoutes(dir: string, segments: string[] = []): string[] {
        const names = fs.readdirSync(dir);
        const found = names.some((n) => n === "page.tsx" || n === "route.ts")
            ? ["/" + segments.join("/")]
            : [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === "__tests__") continue;
            if (/^\(.+\)$/.test(entry.name))
                found.push(...appRoutes(path.join(dir, entry.name), segments));
            else if (!entry.name.startsWith("_") && !entry.name.startsWith("@"))
                found.push(...appRoutes(path.join(dir, entry.name), [...segments, entry.name]));
        }
        return found;
    }

    it("APP_ROUTES equals the page and route-handler paths of src/app", () => {
        expect([...APP_ROUTES].sort()).toEqual([...new Set(appRoutes(APP_ROOT))].sort());
    });

    it("every known route is accepted, with its own placeholders or another bracketed token", () => {
        for (const route of APP_ROUTES) {
            expect(canonicalRoute(route)).not.toBeNull();
            expect(canonicalRoute(route.replace(/\[[^\]]+\]/g, "[x]"))).toBe(canonicalRoute(route));
        }
    });

    it("STATIC_ROUTE_SEGMENTS holds only first segments of known routes", () => {
        for (const segment of STATIC_ROUTE_SEGMENTS) {
            expect(APP_ROUTES.some((route) => route.split("/")[1] === segment)).toBe(true);
        }
    });

    it("every ROUTE_TEMPLATES entry is accepted", () => {
        for (const template of ROUTE_TEMPLATES) expect(isKnownRoutePattern(template)).toBe(true);
    });

    it("every payload key of every event type has a spec", () => {
        const specs = TELEMETRY_SCHEMA as Record<string, Record<string, unknown>>;
        const names = Object.keys(specs).sort();
        expect(names).toEqual(
            [
                "chart_interacted",
                "client_error",
                "feature_viewed",
                "filter_changed",
                "guide_opened",
                "navigation_interacted",
                "page_viewed",
                "session_ended",
                "session_started",
            ].sort(),
        );
        expect(Object.keys(specs.filter_changed).sort()).toEqual(
            ["filterKey", "isCustomDateRange", "valueCount", "view"].sort(),
        );
    });

    it("the enums include every literal of the payload types", () => {
        const chart: TelemetryPayloadByName["chart_interacted"]["chart"][] = [...CHARTS];
        const action: TelemetryPayloadByName["chart_interacted"]["action"][] = [...CHART_ACTIONS];
        const key: TelemetryPayloadByName["filter_changed"]["filterKey"][] = [...FILTER_KEYS];
        expect([chart.length, action.length, key.length]).toEqual([5, 5, 9]);
        for (const view of FILTER_VIEWS) expect(view).toMatch(/^[a-z-]+$/);
    });
});

describe("route combinations that are not routes", () => {
    it("sends /metrics/settings as the unmatched value in a page view", () => {
        const payload = accepted("page_viewed", {
            routePattern: "/metrics/settings",
            page: "/metrics/settings",
            referrerRoutePattern: null,
        });
        expect(payload).toMatchObject({ routePattern: UNMATCHED_ROUTE, page: UNMATCHED_ROUTE });
    });
});

describe("dynamic slots never echo the input", () => {
    it.each([
        ["/people/[ada_lovelace]", "/people/[person_id]"],
        ["/reports/[acme.corp.secret]", "/reports/[id]"],
        ["/api/auth/[john.smith]", "/api/auth/[...nextauth]"],
        ["/org/admin/sync/[a]/runs/[b]", "/org/admin/sync/[configId]/runs/[runId]"],
    ])("%s is sent as %s", (input, output) => {
        expect(canonicalRoute(input)).toBe(output);
        const payload = accepted("page_viewed", {
            routePattern: input,
            page: input,
            referrerRoutePattern: input,
        });
        expect(payload).toEqual({
            routePattern: output,
            page: output,
            referrerRoutePattern: output,
        });
        expect(isKnownRoutePattern(input)).toBe(false);
    });

    it.each(["/people/ada_lovelace", "/people/[ada lovelace]", "/people/[]", "/people/[a]/x"])(
        "%s is not a route",
        (input) => expect(canonicalRoute(input)).toBeNull(),
    );
});

describe("event names are own keys of the schema", () => {
    it.each(["toString", "__proto__", "constructor", "hasOwnProperty"])("%s is refused", (name) => {
        expect(applyTelemetrySchema(name as TelemetryEventName, {}).ok).toBe(false);
        expect(closeTelemetryEvent({ ...validEnvelope(), name } as never)).toBeNull();
    });
});

const SESSION = "11111111-1111-4111-8111-111111111111";
const ANON = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

function validEnvelope() {
    return {
        name: "session_started" as const,
        schemaVersion: "2026-05-telemetry-v1",
        eventId: EVENT_ID,
        ts: "2026-10-24T00:00:00.000Z",
        sessionId: SESSION,
        anonymousUserId: ANON,
        orgIdHash: null as string | null,
        routePattern: "/metrics" as string | null,
        payload: { entryRoutePattern: "/metrics" } as Record<string, unknown>,
    };
}

describe("closeTelemetryEvent", () => {
    it("keeps a valid event unchanged", () => {
        expect(closeTelemetryEvent(validEnvelope())).toEqual(validEnvelope());
        expect(
            closeTelemetryEvent({ ...validEnvelope(), orgIdHash: "fnv1a-0000000a" }),
        ).not.toBeNull();
        expect(
            closeTelemetryEvent({ ...validEnvelope(), anonymousUserId: "a".repeat(64) }),
        ).not.toBeNull();
    });

    it("drops unknown payload keys and closes the envelope route", () => {
        const closed = closeTelemetryEvent({
            ...validEnvelope(),
            routePattern: "/metrics/settings",
            payload: { entryRoutePattern: "/metrics", ownerRef: "owner-secret", org_id: "org-123" },
        });
        expect(closed?.payload).toEqual({ entryRoutePattern: "/metrics" });
        expect(closed?.routePattern).toBe(UNMATCHED_ROUTE);
        expect(JSON.stringify(closed)).not.toMatch(/owner-secret|org-123|settings/);
    });

    it("drops unknown ENVELOPE keys (planted email and name)", () => {
        const closed = closeTelemetryEvent({
            ...validEnvelope(),
            email: "ada@example.com",
            fullName: "John Smith",
            nested: { userId: "u-1" },
        } as never);
        expect(Object.keys(closed ?? {}).sort()).toEqual(
            [
                "anonymousUserId",
                "eventId",
                "name",
                "orgIdHash",
                "payload",
                "routePattern",
                "schemaVersion",
                "sessionId",
                "ts",
            ].sort(),
        );
        expect(JSON.stringify(closed)).not.toMatch(/ada@|John|u-1/);
    });

    it.each([
        ["a free-text sessionId", { sessionId: "John Smith" }],
        ["an e-mail anonymousUserId", { anonymousUserId: "ada@example.com" }],
        ["a name as eventId", { eventId: "Ada Lovelace" }],
        ["a free-text orgIdHash", { orgIdHash: "Acme Corp" }],
        ["a timestamp with text", { ts: "yesterday at Acme" }],
        ["another schemaVersion", { schemaVersion: "v-ada" }],
        ["a numeric route", { routePattern: 5 }],
        ["an unknown name", { name: "order_placed" }],
    ])("drops the event with %s", (_label, patch) => {
        expect(closeTelemetryEvent({ ...validEnvelope(), ...patch } as never)).toBeNull();
    });

    it("returns null for a payload that is not an object or misses a required field", () => {
        expect(closeTelemetryEvent({ ...validEnvelope(), payload: [] as never })).toBeNull();
        expect(closeTelemetryEvent({ ...validEnvelope(), payload: {} })).toBeNull();
        expect(closeTelemetryEvent({ ...validEnvelope(), payload: "x" as never })).toBeNull();
    });
});

describe("the unmatched feature", () => {
    it("is in the closed feature set", () => {
        expect(
            applyTelemetrySchema("feature_viewed", {
                feature: "unmatched",
                surface: "route",
                routePattern: UNMATCHED_ROUTE,
            }).ok,
        ).toBe(true);
    });
});

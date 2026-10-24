import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROUTE_TEMPLATES } from "../routePatterns";
import {
    applyTelemetrySchema,
    CHARTS,
    CHART_ACTIONS,
    FILTER_KEYS,
    FILTER_VIEWS,
    isKnownRoutePattern,
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

describe("route values", () => {
    it.each([
        "/",
        "/metrics",
        "/people/[person_id]",
        "/org/admin/sync/[configId]/runs/[runId]",
        "/[id]",
    ])("accepts %s", (value) => expect(isKnownRoutePattern(value)).toBe(true));

    it.each([
        "/org-123",
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

    function staticDirs(dir: string): string[] {
        const found: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === "__tests__") continue;
            const isGroup = /^\(.+\)$/.test(entry.name);
            const isDynamic = entry.name.startsWith("[");
            const isPrivate = entry.name.startsWith("_") || entry.name.startsWith("@");
            if (!isGroup && !isDynamic && !isPrivate) found.push(entry.name);
            found.push(...staticDirs(path.join(dir, entry.name)));
        }
        return found;
    }

    it("STATIC_ROUTE_SEGMENTS equals the static directories of src/app", () => {
        expect([...new Set(staticDirs(APP_ROOT))].sort()).toEqual(
            [...STATIC_ROUTE_SEGMENTS].sort(),
        );
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

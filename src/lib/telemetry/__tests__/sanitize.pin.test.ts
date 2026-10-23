import { describe, expect, it } from "vitest";

import { ONBOARDING_EVENTS } from "@/lib/onboarding/events";

import { errorClassOf } from "../emitters";
import { ROUTE_TEMPLATES, routePatternForPathname } from "../routePatterns";
import { sanitizeTelemetryPayload } from "../sanitize";
import type { TelemetryEventName, TelemetryPayloadByName } from "../types";

// One payload per event name, built the way the real emitters and call sites build them.
const route = routePatternForPathname("/people/p1/metrics/cycle_time");
const FIXTURES: { [Name in TelemetryEventName]: TelemetryPayloadByName[Name] } = {
    page_viewed: { routePattern: route, page: route, referrerRoutePattern: "/investment" },
    feature_viewed: { feature: "people", surface: "route", routePattern: route },
    filter_changed: {
        view: "work_graph",
        filterKey: "issueType",
        valueCount: 3,
        isCustomDateRange: null,
    },
    chart_interacted: {
        chart: "quadrant",
        action: "overlay_ignored",
        surface: "quadrant_panel",
        scope: "team",
    },
    navigation_interacted: { group: "investment", item: "overview", action: "item_selected" },
    guide_opened: { guide: "quadrant_guide", surface: "quadrant_panel" },
    session_started: { entryRoutePattern: "/" },
    session_ended: { durationMs: 123456, pagesViewed: 4, interactions: 9 },
    client_error: {
        boundary: "route",
        digest: "2194721067",
        errorClass: errorClassOf(new TypeError("x")),
        routePattern: route,
    },
};

describe("sanitize accepts every real payload unchanged", () => {
    it.each(Object.entries(FIXTURES))("%s", (_name, payload) => {
        expect(sanitizeTelemetryPayload(payload)).toEqual({ ok: true, payload });
    });

    it("covers every event name", () => {
        const names: TelemetryEventName[] = [
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
        expect(Object.keys(FIXTURES).sort()).toEqual([...names].sort());
    });

    it("accepts every route pattern the router can produce", () => {
        const samples = ROUTE_TEMPLATES.map((template) =>
            template.replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000001"),
        );
        for (const sample of samples) {
            const pattern = routePatternForPathname(sample);
            expect(sanitizeTelemetryPayload({ routePattern: pattern })).toEqual({
                ok: true,
                payload: { routePattern: pattern },
            });
        }
        for (const template of ROUTE_TEMPLATES) {
            expect(sanitizeTelemetryPayload({ routePattern: template }).ok).toBe(true);
        }
        for (const path of ["/", "/investment", "/org/admin/sync", "/a/12345/b", "/x/y/z"]) {
            expect(
                sanitizeTelemetryPayload({ routePattern: routePatternForPathname(path) }).ok,
            ).toBe(true);
        }
    });

    it("accepts the onboarding funnel payload (the ids are stripped, nothing else is sent)", () => {
        for (const name of ONBOARDING_EVENTS) {
            expect(name).toMatch(/^[a-z_]+$/);
            expect(sanitizeTelemetryPayload({ orgId: "org-123", userId: "u-1" })).toEqual({
                ok: true,
                payload: {},
            });
        }
    });
});

export type TelemetryPrimitive = string | number | boolean | null;

export type TelemetryEventName =
    | "page_viewed"
    | "feature_viewed"
    | "filter_changed"
    | "chart_interacted"
    | "navigation_interacted"
    | "guide_opened"
    | "session_started"
    | "session_ended"
    | "client_error";

export type TelemetryPayloadByName = {
    page_viewed: {
        routePattern: string;
        page: string;
        referrerRoutePattern: string | null;
    };
    feature_viewed: {
        feature: string;
        surface: string;
        routePattern: string;
    };
    filter_changed: {
        view: string;
        filterKey:
            | "scope"
            | "date"
            | "repo"
            | "developer"
            | "work"
            | "flow"
            | "artifact"
            | "blocked"
            | "issueType";
        valueCount: number;
        isCustomDateRange: boolean | null;
    };
    chart_interacted: {
        chart: "quadrant" | "timeseries" | "treemap" | "flame" | "sankey";
        action: "point_selected" | "overlay_toggled" | "overlay_ignored" | "drilldown" | "zoom";
        surface: string;
        scope: string | null;
    };
    navigation_interacted: {
        group: string;
        item: string | null;
        action: "group_expanded" | "group_collapsed" | "item_selected";
    };
    guide_opened: {
        guide: string;
        surface: string;
    };
    session_started: {
        entryRoutePattern: string;
    };
    session_ended: {
        durationMs: number;
        pagesViewed: number;
        interactions: number;
    };
    client_error: {
        boundary: "route" | "global";
        digest: string | null;
        errorClass: string;
        routePattern: string | null;
    };
};

export type TelemetryEvent<Name extends TelemetryEventName = TelemetryEventName> = {
    name: Name;
    schemaVersion: "2026-05-telemetry-v1";
    eventId: string;
    ts: string;
    sessionId: string;
    anonymousUserId: string;
    orgIdHash: string | null;
    routePattern: string | null;
    payload: TelemetryPayloadByName[Name];
};

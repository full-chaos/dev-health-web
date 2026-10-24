import { ROUTE_TEMPLATES } from "./routePatterns";
import type { TelemetryEventName, TelemetryPayloadByName, TelemetryPrimitive } from "./types";

/**
 * Closed value sets for every product-telemetry field (CHAOS-11061). A field outside its set is
 * never sent: an unknown key is dropped, a bad optional (nullable) field is dropped, and a bad
 * required field drops the whole event. Values are never logged, only the key.
 */

/** Directory names under src/app (route groups and dynamic segments excluded); pinned by a test that walks the tree. */
export const STATIC_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
    "about",
    "acr",
    "admin",
    "agent-context",
    "ai",
    "api",
    "attribution",
    "audit",
    "audit-logs",
    "auth",
    "authorize",
    "automations",
    "backlog-risk",
    "batches",
    "billing",
    "billing-refunds-test",
    "bottleneck",
    "byo-llm",
    "callback",
    "capacity",
    "capacity-planning",
    "change-password",
    "code",
    "cognitive-load",
    "complete",
    "complexity",
    "compounding",
    "connectors",
    "context-fabric",
    "context-packet",
    "context-packets",
    "coverage",
    "credentials",
    "cto-architecture",
    "customer-push",
    "dashboard",
    "data-health",
    "delivery-forecast",
    "demo",
    "deployments",
    "device",
    "diagnose",
    "edit",
    "engineering-manager",
    "error",
    "evidence",
    "examples",
    "experiments",
    "explore",
    "feature-flags",
    "feedback",
    "forgot-password",
    "github",
    "github-app",
    "govern",
    "health",
    "identities",
    "identity",
    "impact",
    "improve",
    "incident-correlation",
    "install",
    "integration",
    "integrations",
    "investment",
    "invoices",
    "ip-allowlist",
    "issues",
    "landscape",
    "licensing",
    "mapping",
    "marketing",
    "metrics",
    "new",
    "onboard",
    "operating-review",
    "opportunities",
    "org",
    "organizations",
    "orgs",
    "pagerduty",
    "people",
    "pipelines",
    "plan",
    "plans",
    "platform-devex",
    "pricing",
    "privacy",
    "product-telemetry",
    "prs",
    "quality",
    "refunds",
    "repos",
    "repositories",
    "reports",
    "reset-password",
    "retention",
    "review-load",
    "risk",
    "runs",
    "security",
    "service-accounts",
    "settings",
    "signin",
    "signup",
    "subscriptions",
    "superadmin",
    "switch-org",
    "sync",
    "team-flow",
    "teams",
    "terms",
    "test-gaps",
    "testops",
    "tests",
    "trial-checkout",
    "use-cases",
    "users",
    "validate",
    "validation",
    "verify",
    "vp-engineering",
    "work",
    "work-graph",
    "workspace",
]);

const PLACEHOLDER_SEGMENTS: ReadonlySet<string> = new Set([
    "[id]",
    "[unmatched]",
    ...ROUTE_TEMPLATES.flatMap((template) => template.split("/").filter((s) => s.startsWith("["))),
]);

/** The one value sent for a path outside the known routes (a 404, an injected path): no path data. */
export const UNMATCHED_ROUTE = "/[unmatched]";

/** "/" , a ROUTE_TEMPLATES entry, or a path of known static segments and known placeholders. */
export function isKnownRoutePattern(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 256 || !value.startsWith("/")) return false;
    if (value === "/") return true;
    const segments = value.slice(1).split("/");
    return segments.every((s) => STATIC_ROUTE_SEGMENTS.has(s) || PLACEHOLDER_SEGMENTS.has(s));
}

export const FILTER_VIEWS = [
    "people",
    "home",
    "metrics",
    "work",
    "investment",
    "code",
    "quality",
    "opportunities",
    "explore",
    "landscape",
    "testops",
    "security",
    "security-repo",
    "feature-flags",
    "capacity-planning",
    "complexity",
    "cognitive-load",
    "risk-compounding",
    "ai",
    "unknown",
] as const;
export const FILTER_KEYS = [
    "scope",
    "date",
    "repo",
    "developer",
    "work",
    "flow",
    "artifact",
    "blocked",
    "issueType",
] as const;
export const CHARTS = ["quadrant", "timeseries", "treemap", "flame", "sankey"] as const;
export const CHART_ACTIONS = [
    "point_selected",
    "overlay_toggled",
    "overlay_ignored",
    "drilldown",
    "zoom",
] as const;
export const SCOPES = ["org", "team", "repo", "person", "developer", "service"] as const;
export const NAVIGATION_ACTIONS = ["group_expanded", "group_collapsed", "item_selected"] as const;
export const BOUNDARIES = ["route", "global"] as const;
export const SURFACES = ["route", "quadrant_panel"] as const;
export const ERROR_CLASSES = [
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "EvalError",
    "URIError",
    "AggregateError",
    "ChunkLoadError",
    "AbortError",
    "NetworkError",
] as const;
/** Navigation groups, items and guides have no caller yet: none is accepted until one adds its set here. */
const NO_VALUES: readonly string[] = [];

const oneOf = (values: readonly string[]) => (value: unknown) =>
    typeof value === "string" && values.includes(value);
const intUpTo = (max: number) => (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;

type Spec = {
    optional: boolean;
    accepts: (value: unknown) => boolean;
    coerce?: (value: unknown) => unknown;
};
const required = (accepts: Spec["accepts"]): Spec => ({ optional: false, accepts });
const nullable = (accepts: Spec["accepts"]): Spec => ({
    optional: true,
    accepts: (value) => value === null || accepts(value),
});

/** A route field: a string outside the known routes becomes UNMATCHED_ROUTE; a non-string stays invalid. */
const toUnmatched = (value: unknown) => (typeof value === "string" ? UNMATCHED_ROUTE : undefined);
const route = (): Spec => ({ optional: false, accepts: isKnownRoutePattern, coerce: toUnmatched });
const nullableRoute = (): Spec => ({
    optional: true,
    accepts: (value) => value === null || isKnownRoutePattern(value),
    coerce: toUnmatched,
});

const feature = (value: unknown) =>
    value === "home" || (typeof value === "string" && STATIC_ROUTE_SEGMENTS.has(value));

type Schema = {
    [Name in TelemetryEventName]: { [Key in keyof TelemetryPayloadByName[Name]]-?: Spec };
};

export const TELEMETRY_SCHEMA = {
    page_viewed: {
        routePattern: route(),
        page: route(),
        referrerRoutePattern: nullableRoute(),
    },
    feature_viewed: {
        feature: required(feature),
        surface: required(oneOf(SURFACES)),
        routePattern: route(),
    },
    filter_changed: {
        view: required(oneOf(FILTER_VIEWS)),
        filterKey: required(oneOf(FILTER_KEYS)),
        valueCount: required(intUpTo(10_000)),
        isCustomDateRange: nullable((value) => typeof value === "boolean"),
    },
    chart_interacted: {
        chart: required(oneOf(CHARTS)),
        action: required(oneOf(CHART_ACTIONS)),
        surface: required(oneOf(SURFACES)),
        scope: nullable(oneOf(SCOPES)),
    },
    navigation_interacted: {
        group: required(oneOf(NO_VALUES)),
        item: nullable(oneOf(NO_VALUES)),
        action: required(oneOf(NAVIGATION_ACTIONS)),
    },
    guide_opened: {
        guide: required(oneOf(NO_VALUES)),
        surface: required(oneOf(SURFACES)),
    },
    session_started: { entryRoutePattern: route() },
    session_ended: {
        durationMs: required(intUpTo(86_400_000)),
        pagesViewed: required(intUpTo(10_000)),
        interactions: required(intUpTo(100_000)),
    },
    client_error: {
        boundary: required(oneOf(BOUNDARIES)),
        digest: nullable((value) => typeof value === "string" && /^[0-9]{1,20}$/.test(value)),
        errorClass: required(oneOf(ERROR_CLASSES)),
        routePattern: nullableRoute(),
    },
} satisfies Schema;

export type SchemaResult =
    { ok: true; payload: Record<string, TelemetryPrimitive> } | { ok: false; key: string };

/**
 * Keep only the keys the event's schema names. A bad nullable field is dropped; a bad required
 * or missing required field rejects the event (`ok: false`, the key only, never the value).
 */
export function applyTelemetrySchema(
    name: TelemetryEventName,
    payload: Record<string, unknown>,
): SchemaResult {
    const schema = (TELEMETRY_SCHEMA as Record<string, Record<string, Spec> | undefined>)[name];
    if (!schema) return { ok: false, key: "name" };
    const out: Record<string, TelemetryPrimitive> = {};
    for (const [key, spec] of Object.entries(schema)) {
        const value = Object.hasOwn(payload, key) ? payload[key] : undefined;
        const kept = value !== undefined && !spec.accepts(value) ? spec.coerce?.(value) : value;
        if (kept !== undefined && spec.accepts(kept)) {
            out[key] = kept as TelemetryPrimitive;
        } else if (!spec.optional) {
            return { ok: false, key };
        }
    }
    return { ok: true, payload: out };
}

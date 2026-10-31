import { ONBOARDING_EVENTS } from "@/lib/onboarding/events";

import { ROUTE_TEMPLATES } from "./routePatterns";
import type { TelemetryEventName, TelemetryPayloadByName, TelemetryPrimitive } from "./types";

/**
 * Closed value sets for every product-telemetry field (CHAOS-11061). A field outside its set is
 * never sent: an unknown key is dropped, a bad optional (nullable) field is dropped, and a bad
 * required field drops the whole event. Values are never logged, only the key.
 */

/** Every page and route handler under src/app (route groups removed); pinned by a test that walks the tree. */
export const APP_ROUTES: readonly string[] = [
    "/",
    "/acr/authorize",
    "/acr/device",
    "/agent-context",
    "/agent-context/context-packet",
    "/ai",
    "/ai/attribution",
    "/ai/automations",
    "/ai/evidence",
    "/ai/impact",
    "/ai/impact/evidence",
    "/ai/review-load",
    "/ai/risk",
    "/ai/test-gaps",
    "/api/acr/authorize",
    "/api/acr/device",
    "/api/agent-context/context-packets",
    "/api/agent-context/evidence/[evidenceRefId]",
    "/api/agent-context/repositories",
    "/api/ask-dev/investigations",
    "/api/auth/[...nextauth]",
    "/api/auth/change-password",
    "/api/auth/organizations",
    "/api/auth/revoke-session",
    "/api/auth/switch-org",
    "/api/feedback",
    "/ask-dev/oauth/callback",
    "/ask-dev/oauth/start",
    "/auth/error",
    "/auth/forgot-password",
    "/auth/onboard",
    "/auth/onboard/complete",
    "/auth/onboard/integration",
    "/auth/onboard/workspace",
    "/auth/reset-password",
    "/auth/signin",
    "/auth/signup",
    "/auth/trial-checkout",
    "/auth/verify",
    "/bottleneck",
    "/capacity",
    "/capacity-planning",
    "/code",
    "/cognitive-load",
    "/complexity",
    "/dashboard",
    "/data-health",
    "/data-health/connectors",
    "/data-health/identity",
    "/data-health/mapping",
    "/demo",
    "/demo/chart-escape",
    "/deployments/[deployment_id]",
    "/dev",
    "/diagnose",
    "/diagnose/work-graph",
    "/explore",
    "/explore/landscape",
    "/feature-flags",
    "/govern",
    "/health",
    "/improve",
    "/improve/automations",
    "/improve/experiments",
    "/incident-correlation",
    "/investment",
    "/issues/[issue_id]",
    "/landscape",
    "/marketing",
    "/marketing/about",
    "/marketing/billing-refunds-test",
    "/marketing/context-fabric",
    "/marketing/context-fabric/use-cases",
    "/marketing/cto-architecture",
    "/marketing/engineering-manager",
    "/marketing/platform-devex",
    "/marketing/pricing",
    "/marketing/privacy",
    "/marketing/security",
    "/marketing/terms",
    "/marketing/vp-engineering",
    "/metrics",
    "/oauth/acr-client.json",
    "/operating-review",
    "/opportunities",
    "/org/admin",
    "/org/admin/ai",
    "/org/admin/ai/byo-llm",
    "/org/admin/audit-logs",
    "/org/admin/identities",
    "/org/admin/identities/[id]/edit",
    "/org/admin/identities/new",
    "/org/admin/integrations",
    "/org/admin/integrations/[provider]",
    "/org/admin/integrations/[provider]/customer-push/[source_id]",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/batches",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/batches/[ingestion_id]",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/credentials",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/credentials/new",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/examples",
    "/org/admin/integrations/[provider]/customer-push/[source_id]/validate",
    "/org/admin/integrations/[provider]/customer-push/new",
    "/org/admin/integrations/github-app/callback",
    "/org/admin/integrations/github-app/install",
    "/org/admin/integrations/github/sync",
    "/org/admin/integrations/pagerduty/callback",
    "/org/admin/ip-allowlist",
    "/org/admin/retention",
    "/org/admin/settings",
    "/org/admin/sync",
    "/org/admin/sync/[configId]",
    "/org/admin/sync/[configId]/edit",
    "/org/admin/sync/[configId]/runs/[runId]",
    "/org/admin/sync/new",
    "/org/admin/teams",
    "/org/admin/teams/[id]/edit",
    "/org/admin/teams/new",
    "/org/admin/users",
    "/org/admin/users/[id]",
    "/org/admin/users/[id]/edit",
    "/org/admin/users/new",
    "/people",
    "/people/[person_id]",
    "/people/[person_id]/metrics/[metric]",
    "/plan",
    "/plan/backlog-risk",
    "/plan/capacity",
    "/plan/delivery-forecast",
    "/prs/[pr_id]",
    "/quality",
    "/reports",
    "/reports/[id]",
    "/reports/new",
    "/risk/compounding",
    "/security",
    "/security/repos/[repoId]",
    "/settings",
    "/superadmin",
    "/superadmin/audit",
    "/superadmin/billing/audit",
    "/superadmin/billing/invoices",
    "/superadmin/billing/plans",
    "/superadmin/billing/refunds",
    "/superadmin/billing/subscriptions",
    "/superadmin/context-fabric/validation",
    "/superadmin/licensing",
    "/superadmin/licensing/[orgId]",
    "/superadmin/orgs",
    "/superadmin/orgs/[id]",
    "/superadmin/orgs/new",
    "/superadmin/product-telemetry",
    "/superadmin/product-telemetry/[orgId]",
    "/superadmin/service-accounts/new",
    "/superadmin/settings",
    "/superadmin/users",
    "/superadmin/users/[id]",
    "/superadmin/users/new",
    "/team-flow",
    "/testops",
    "/testops/coverage",
    "/testops/pipelines",
    "/testops/risk",
    "/testops/tests",
    "/work",
];

const TEMPLATES: readonly (readonly string[])[] = [...new Set([...ROUTE_TEMPLATES, ...APP_ROUTES])]
    .filter((route) => route !== "/")
    .map((route) => route.slice(1).split("/"));

/** First static segment of every known route: the closed `feature` values for a route view. */
export const STATIC_ROUTE_SEGMENTS: ReadonlySet<string> = new Set(
    TEMPLATES.map((segments) => segments[0]).filter((segment) => !segment.startsWith("[")),
);

const isPlaceholder = (segment: string) => /^\[[A-Za-z_.]+\]$/.test(segment);

/** The one value sent for a path outside the known routes (a 404, an injected path): no path data. */
export const UNMATCHED_ROUTE = "/[unmatched]";

/**
 * The canonical form of a route: "/" or the first known template that the path matches segment for
 * segment. A static segment must be equal. A dynamic slot must hold a bracketed token, and the
 * output carries the template's OWN placeholder text there, never the input ("/people/[ada]" gives
 * "/people/[person_id]"). Null for anything else, so a mix of known segments that is not a route
 * ("/metrics/settings") is not known.
 */
export function canonicalRoute(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 256 || !value.startsWith("/")) return null;
    if (value === "/") return "/";
    if (value === UNMATCHED_ROUTE) return UNMATCHED_ROUTE;
    const segments = value.slice(1).split("/");
    const template = TEMPLATES.find(
        (candidate) =>
            candidate.length === segments.length &&
            candidate.every((part, index) =>
                part.startsWith("[") ? isPlaceholder(segments[index]) : part === segments[index],
            ),
    );
    return template ? "/" + template.join("/") : null;
}

/** True only for a value that is already canonical. */
export function isKnownRoutePattern(value: unknown): value is string {
    return typeof value === "string" && canonicalRoute(value) === value;
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
export const FEATURE_SURFACES = ["route", ...ONBOARDING_EVENTS] as const;
export const SURFACES = ["quadrant_panel"] as const;
export const ONBOARDING_FEATURE = "onboarding_funnel";
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
const toUnmatched = (value: unknown) =>
    typeof value === "string" ? (canonicalRoute(value) ?? UNMATCHED_ROUTE) : undefined;
const route = (): Spec => ({ optional: false, accepts: isKnownRoutePattern, coerce: toUnmatched });
const nullableRoute = (): Spec => ({
    optional: true,
    accepts: (value) => value === null || isKnownRoutePattern(value),
    coerce: toUnmatched,
});

const feature = (value: unknown) =>
    value === "home" ||
    value === "unmatched" ||
    value === ONBOARDING_FEATURE ||
    (typeof value === "string" && STATIC_ROUTE_SEGMENTS.has(value));

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
        surface: required(oneOf(FEATURE_SURFACES)),
        routePattern: route(),
        step: nullable(intUpTo(99)),
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

/** An envelope route: the pattern when known, else the fixed unmatched value. */
export function closedRoutePattern(pattern: string): string {
    return canonicalRoute(pattern) ?? UNMATCHED_ROUTE;
}

/** crypto.randomUUID() and uuidFromRandomBytes() in telemetry.ts: lowercase, version 4, variant 8-b. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The no-crypto fallback in telemetry.ts: `telemetry-${Date.now().toString(36)}-${counter.toString(36)}`. */
const FALLBACK_ID = /^telemetry-([0-9a-z]{8,9})-([0-9a-z]{1,3})$/;
const MIN_FALLBACK_MS = Date.UTC(2020, 0, 1);
const MAX_FALLBACK_MS = Date.UTC(2100, 0, 1);

/** Exactly the shapes randomId() can return; a name or word of another shape or length does not pass. */
function isGeneratedId(value: string): boolean {
    if (UUID_V4.test(value)) return true;
    const match = FALLBACK_ID.exec(value);
    if (!match) return false;
    const millis = Number.parseInt(match[1], 36);
    return millis >= MIN_FALLBACK_MS && millis < MAX_FALLBACK_MS;
}
/** hashIdentifier output: a SHA-256 hex digest or the FNV-1a fallback. */
const HASHED_ID = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export const TELEMETRY_SCHEMA_VERSION = "2026-05-telemetry-v1";

const isString = (value: unknown): value is string => typeof value === "string";

/**
 * The event as it may leave the browser, built from an explicit allowlist of envelope keys, each
 * checked: an unknown envelope key is dropped, a malformed envelope value drops the event, the
 * route goes through the template matcher, and the payload through its event schema. Null when
 * anything required is not valid.
 */
export function closeTelemetryEvent<Event extends { name: TelemetryEventName }>(
    event: Event,
): Event | null {
    const raw = event as unknown as Record<string, unknown>;
    const name = raw.name;
    if (!isString(name) || !Object.hasOwn(TELEMETRY_SCHEMA, name)) return null;
    const payload = raw.payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const closed = applyTelemetrySchema(
        name as TelemetryEventName,
        payload as Record<string, unknown>,
    );
    if (!closed.ok) return null;
    const { schemaVersion, eventId, ts, sessionId, anonymousUserId, orgIdHash, routePattern } = raw;
    if (
        schemaVersion !== TELEMETRY_SCHEMA_VERSION ||
        !isString(eventId) ||
        !isGeneratedId(eventId) ||
        !isString(ts) ||
        !ISO_TIMESTAMP.test(ts) ||
        !isString(sessionId) ||
        !isGeneratedId(sessionId) ||
        !isString(anonymousUserId) ||
        !(isGeneratedId(anonymousUserId) || HASHED_ID.test(anonymousUserId)) ||
        !(orgIdHash === null || (isString(orgIdHash) && HASHED_ID.test(orgIdHash))) ||
        !(routePattern === null || isString(routePattern))
    ) {
        return null;
    }
    return {
        name,
        schemaVersion,
        eventId,
        ts,
        sessionId,
        anonymousUserId,
        orgIdHash,
        routePattern: routePattern === null ? null : closedRoutePattern(routePattern),
        payload: closed.payload,
    } as unknown as Event;
}

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
    if (!Object.hasOwn(TELEMETRY_SCHEMA, name)) return { ok: false, key: "name" };
    const schema = (TELEMETRY_SCHEMA as Record<string, Record<string, Spec>>)[name];
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

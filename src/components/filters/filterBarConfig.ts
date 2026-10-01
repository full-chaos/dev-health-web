import type { MetricFilter } from "@/lib/filters/types";

export type FilterBarView =
    | "people"
    | "home"
    | "metrics"
    | "work"
    | "investment"
    | "code"
    | "quality"
    | "opportunities"
    | "explore"
    | "landscape"
    | "testops"
    | "security"
    | "feature-flags"
    | "capacity-planning"
    | "complexity"
    | "cognitive-load"
    | "risk-compounding"
    | "ai";

export type UnreadFilter =
    "developers" | "roles" | "flowStage" | "blocked" | "artifacts" | "issueType";

export type FilterVisibility = {
    scope?: boolean;
    repo?: boolean;
    developer?: boolean;
    workType?: boolean;
    /** The view's queries take ONE work type (the AI `AIScopeInput.workType` is a single string): the Work control is single-select. */
    workTypeSingle?: boolean;
    /**
     * URL filters this view's queries do not read: the drawer does not offer them, and a value
     * left in an old URL is neither shown as a pill nor counted as active. Unset = all are read.
     */
    unreadFilters?: UnreadFilter[];
    flowStage?: boolean;
    date?: boolean;
};

export type FilterBarClientProps = {
    condensed?: boolean;
    view?: FilterBarView;
    tab?: string;
    resolvedVisibility?: FilterVisibility;
    resolvedScopeLock?: MetricFilter["scope"]["level"] | null;
};

const DEFAULT_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: true,
    workType: true,
    flowStage: false,
    date: true,
};

const METRICS_DEFAULT_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: true,
    workType: false,
    flowStage: false,
    date: true,
};

const QUALITY_TESTOPS_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: false,
    workType: false,
    flowStage: false,
    date: true,
};

const METRICS_FLOW_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: true,
    workType: false,
    flowStage: true,
    date: true,
};

const WORK_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: false,
    developer: false,
    workType: true,
    flowStage: false,
    date: true,
};

const PEOPLE_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: false,
    developer: true,
    workType: false,
    flowStage: false,
    date: true,
};

const CODE_VISIBILITY: FilterVisibility = {
    scope: false,
    repo: true,
    developer: true,
    workType: false,
    flowStage: false,
    date: true,
};

const EXPLORE_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: true,
    workType: true,
    flowStage: true,
    date: true,
};

// Capacity planning derives team from filters.scope; backlog is collected
// inline on the page. No repo/developer/workType breakdown.
const CAPACITY_PLANNING_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: false,
    developer: false,
    workType: false,
    flowStage: false,
    date: true,
};

// Complexity is repo-centric (hotspots) but never breaks down by person.
const COMPLEXITY_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: false,
    workType: false,
    flowStage: false,
    date: true,
};

// Cognitive load preserves the no-surveillance contract — team/repo scope
// only (repo filtering flows through the always-visible GlobalContextBarClient
// picker; this flag keeps FilterBarClient's own config consistent with the
// sibling repo-scoped views below rather than silently disagreeing with it).
// Developer scope is gated separately at the page level (self-only).
const COGNITIVE_LOAD_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: false,
    workType: false,
    flowStage: false,
    date: true,
};

// Compounding risk is a team/repo signal — developer scope is forbidden
// by the no-surveillance contract on this surface.
const RISK_COMPOUNDING_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: false,
    workType: false,
    flowStage: false,
    date: true,
};

// AI workflow surfaces expose team / repo / work-type scoping but never
// person-level breakdowns (aggregated reviewer distribution only). The AI queries
// read team, repo, the date range and the work category only (CHAOS-7744): the
// other filters are not offered and not shown or counted when an old URL has them.
const AI_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: false,
    workType: true,
    workTypeSingle: true,
    unreadFilters: ["developers", "roles", "flowStage", "blocked", "artifacts", "issueType"],
    flowStage: false,
    date: true,
};

const resolveViewVisibility = (view?: FilterBarView, tab?: string): FilterVisibility => {
    if (view === "metrics") {
        if (tab === "flow") {
            return METRICS_FLOW_VISIBILITY;
        }
        return METRICS_DEFAULT_VISIBILITY;
    }
    if (view === "work" || view === "investment") {
        return WORK_VISIBILITY;
    }
    if (view === "people") {
        return PEOPLE_VISIBILITY;
    }
    if (view === "code") {
        return CODE_VISIBILITY;
    }
    if (view === "quality" || view === "testops") {
        return QUALITY_TESTOPS_VISIBILITY;
    }
    if (view === "opportunities") {
        return WORK_VISIBILITY;
    }
    if (view === "explore" || view === "landscape") {
        return EXPLORE_VISIBILITY;
    }
    if (view === "security") {
        return {
            scope: false,
            repo: false,
            developer: false,
            workType: false,
            flowStage: false,
            date: false,
        };
    }
    if (view === "capacity-planning") {
        return CAPACITY_PLANNING_VISIBILITY;
    }
    if (view === "complexity") {
        return COMPLEXITY_VISIBILITY;
    }
    if (view === "cognitive-load") {
        return COGNITIVE_LOAD_VISIBILITY;
    }
    if (view === "risk-compounding") {
        return RISK_COMPOUNDING_VISIBILITY;
    }
    if (view === "ai") {
        return AI_VISIBILITY;
    }
    return DEFAULT_VISIBILITY;
};

/**
 * Filters NO reader uses, on every view (CHAOS-7795, CHAOS-7796). "Reader" = the Go query API, the
 * Python API (canary / shadow routing) and the web client. Traced:
 * - `what.artifacts`: only printed as a chip on the explore page.
 * - `who.roles`, `how.blocked`, `how.flow_stage`, `why.issue_type`: not applied by any query. Go
 *   `analytics/filtertranslation.go:151` ("never translated"), `analytics/filters.go:23-32` only
 *   makes a flow matrix REJECT; Python `api/graphql/sql/filter_translation.py` has no branch for
 *   them, `compiler.py:283-286` is the same rejection, `loaders/analytics_loader.py:99-113` builds a
 *   cache key. Web: the investment fetchers send flow stage and issue type
 *   (`investmentFetchers.ts:82-88`) and both backends drop them; the explore page prints them.
 */
const NEVER_READ: UnreadFilter[] = ["artifacts", "roles", "flowStage", "blocked", "issueType"];

/**
 * Per view, the filters its queries do not read, besides `NEVER_READ`. `developers` are applied
 * only by the investment queries (Go `analytics/investment.go:546`, `filtertranslation.go:202`;
 * Python `filter_translation.py:246-264`) and used client-side by the People search
 * (`PeopleSearch.tsx:56`). The work category is applied by the home path (repos + work category:
 * `home/scopefilter.go:122,180`) and the investment queries; views whose pages call neither read
 * scope, repo and dates only. A view that is not traced (no `view`, feature flags) gets
 * `NEVER_READ` alone.
 */
const VIEW_UNREAD: Partial<Record<FilterBarView, UnreadFilter[]>> = {
    home: ["developers"],
    metrics: ["developers"],
    work: ["developers"],
    code: ["developers"],
    quality: ["developers"],
    opportunities: ["developers"],
    explore: ["developers"],
    ai: ["developers"],
    testops: ["developers", "workCategory"],
    landscape: ["developers", "workCategory"],
    complexity: ["developers", "workCategory"],
    "cognitive-load": ["developers", "workCategory"],
    "capacity-planning": ["developers", "workCategory"],
    "risk-compounding": ["developers", "workCategory"],
    security: ["developers", "workCategory"],
    people: ["workCategory"],
    // investment: developers and the work category are read (the investment queries send both).
};

export const resolveVisibility = (view?: FilterBarView, tab?: string): FilterVisibility => {
    const visibility = resolveViewVisibility(view, tab);
    const unread = new Set<UnreadFilter>([
        ...NEVER_READ,
        ...((view && VIEW_UNREAD[view]) ?? []),
        ...(visibility.unreadFilters ?? []),
    ]);
    return { ...visibility, unreadFilters: Array.from(unread) };
};

/**
 * The controls a view really offers: a control whose filter nothing reads is not offered. Used for
 * what the drawer shows. It is NOT used to decide whether the view has page filters (scope lock,
 * default `f`): that stays as the view was configured.
 */
export const maskUnreadControls = (visibility: FilterVisibility): FilterVisibility => ({
    ...visibility,
    developer:
        visibility.developer &&
        (isFilterRead(visibility, "developers") || isFilterRead(visibility, "roles")),
    workType:
        visibility.workType &&
        (isFilterRead(visibility, "workCategory") || isFilterRead(visibility, "issueType")),
    flowStage:
        visibility.flowStage &&
        (isFilterRead(visibility, "flowStage") || isFilterRead(visibility, "blocked")),
});

export const resolveScopeLock = (view?: FilterBarView): MetricFilter["scope"]["level"] | null => {
    const lockedViews: FilterBarView[] = [
        "metrics",
        "quality",
        "testops",
        "work",
        "investment",
        "opportunities",
        "home",
        "people",
        "capacity-planning",
        "complexity",
        "cognitive-load",
        "risk-compounding",
        "ai",
    ];

    return view && lockedViews.includes(view) ? "team" : null;
};

/** True when the view's queries read this URL filter (so it is shown as a pill and counted). */
export const isFilterRead = (visibility: FilterVisibility, filter: UnreadFilter): boolean =>
    !visibility.unreadFilters?.includes(filter);

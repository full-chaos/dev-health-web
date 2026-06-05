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

export type FilterVisibility = {
    scope?: boolean;
    repo?: boolean;
    developer?: boolean;
    workType?: boolean;
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
// only. Developer scope is gated separately at the page level (self-only).
const COGNITIVE_LOAD_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: false,
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
// person-level breakdowns (aggregated reviewer distribution only).
const AI_VISIBILITY: FilterVisibility = {
    scope: true,
    repo: true,
    developer: false,
    workType: true,
    flowStage: false,
    date: true,
};

export const resolveVisibility = (view?: FilterBarView, tab?: string): FilterVisibility => {
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

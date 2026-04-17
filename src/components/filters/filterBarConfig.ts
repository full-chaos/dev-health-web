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
  | "testops"
  | "security"
  | "feature-flags";

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

export const resolveVisibility = (
  view?: FilterBarView,
  tab?: string
): FilterVisibility => {
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
    return METRICS_DEFAULT_VISIBILITY;
  }
  if (view === "opportunities") {
    return WORK_VISIBILITY;
  }
  if (view === "explore") {
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
  return DEFAULT_VISIBILITY;
};

export const resolveScopeLock = (
  view?: FilterBarView
): MetricFilter["scope"]["level"] | null => {
  const lockedViews: FilterBarView[] = [
    "metrics",
    "quality",
    "testops",
    "work",
    "investment",
    "opportunities",
    "home",
    "people",
  ];

  return view && lockedViews.includes(view) ? "team" : null;
};

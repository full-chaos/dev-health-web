/**
 * FilterBar — RSC + Client hybrid wrapper.
 *
 * This server component resolves static configuration (visibility flags and
 * scope lock) based on the `view` and `tab` props, then passes the computed
 * values to the interactive FilterBarClient component.
 *
 * Benefits over a pure client component:
 *  - Visibility and scopeLock logic runs once on the server; the client
 *    component receives plain boolean props instead of re-running JS logic.
 *  - No JavaScript needed for config resolution on the client.
 */

import { Suspense } from "react";
import { FilterBarClient } from "./FilterBarClient";
import type { FilterBarClientProps } from "./FilterBarClient";

type FilterBarView =
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
  | "security";

type FilterVisibility = {
  scope?: boolean;
  repo?: boolean;
  developer?: boolean;
  workType?: boolean;
  flowStage?: boolean;
  date?: boolean;
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

function resolveVisibility(view?: FilterBarView, tab?: string): FilterVisibility {
  if (view === "metrics") {
    return tab === "flow" ? METRICS_FLOW_VISIBILITY : METRICS_DEFAULT_VISIBILITY;
  }
  if (view === "work" || view === "investment") return WORK_VISIBILITY;
  if (view === "people") return PEOPLE_VISIBILITY;
  if (view === "code") return CODE_VISIBILITY;
  if (view === "quality" || view === "testops") return METRICS_DEFAULT_VISIBILITY;
  if (view === "opportunities") return WORK_VISIBILITY;
  if (view === "explore") return EXPLORE_VISIBILITY;
  if (view === "security") {
    // Security uses its own URL-based filter state (SecurityFilter / encodeSecurityFilter).
    // Hide all MetricFilter chips so the legacy bar renders as an empty shell on this view.
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
}

function resolveScopeLock(view?: FilterBarView): "team" | null {
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
}

type FilterBarProps = {
  condensed?: boolean;
  view?: FilterBarView;
  tab?: string;
};

/**
 * RSC wrapper — computes config on the server and passes to client.
 *
 * FilterBarClient is wrapped in Suspense because it calls useSearchParams()
 * which requires a Suspense boundary in Next.js 13+.
 */
export function FilterBar({ condensed, view, tab }: FilterBarProps) {
  const resolvedVisibility = resolveVisibility(view, tab);
  const resolvedScopeLock = resolveScopeLock(view);

  const clientProps: FilterBarClientProps = {
    condensed,
    view,
    tab,
    resolvedVisibility,
    resolvedScopeLock,
  };

  return (
    <Suspense fallback={<div className="h-14 animate-pulse rounded-xl bg-(--card-80)" />}>
      <FilterBarClient {...clientProps} />
    </Suspense>
  );
}

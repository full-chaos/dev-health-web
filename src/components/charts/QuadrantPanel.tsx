"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { QuadrantAxis, QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { QuadrantChart } from "./QuadrantChart";

const AXIS_DESCRIPTIONS: Record<string, string> = {
  churn: "Rate of code change, rework, and revision.",
  throughput: "Completed delivery units over time.",
  cycle_time: "Elapsed time from start to delivery.",
  lead_time: "Elapsed time from request to delivery.",
  wip: "Average concurrent work in progress.",
  wip_saturation: "Average concurrent work in progress.",
  review_load: "Incoming review requests per reviewer.",
  review_latency: "Elapsed time before reviews complete.",
};

const describeAxis = (axis: QuadrantAxis) =>
  AXIS_DESCRIPTIONS[axis.metric] ??
  `Observed ${axis.label.toLowerCase()} over the selected window.`;

const defaultHeatmapPath = (axes: QuadrantResponse["axes"]) => {
  const metrics = new Set([axes.x.metric, axes.y.metric]);
  if (metrics.has("churn")) {
    return "/code";
  }
  if (
    metrics.has("review_load") ||
    metrics.has("review_latency") ||
    metrics.has("cycle_time") ||
    metrics.has("lead_time") ||
    metrics.has("wip") ||
    metrics.has("wip_saturation")
  ) {
    return "/work";
  }
  return "/work";
};

type QuadrantPanelProps = {
  title: string;
  description: string;
  data?: QuadrantResponse | null;
  filters: MetricFilter;
  relatedLinks?: Array<{ label: string; href: string }>;
  emptyState?: string;
};

export function QuadrantPanel({
  title,
  description,
  data,
  filters,
  relatedLinks,
  emptyState = "Quadrant data unavailable.",
}: QuadrantPanelProps) {
  const scopeType =
    filters.scope.level === "developer" ? "person" : filters.scope.level;
  const isPersonScope = scopeType === "person";
  const focusEntityIds = isPersonScope
    ? (filters.scope.ids ?? []).slice(0, 1)
    : (filters.scope.ids ?? []);
  const [selectedPoint, setSelectedPoint] = useState<QuadrantPoint | null>(null);

  const handlePointSelect = (point: QuadrantPoint) => {
    setSelectedPoint(point);
  };

  useEffect(() => {
    setSelectedPoint(null);
  }, [data]);

  if (!data || !data.points?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-5 text-sm text-[var(--ink-muted)]">
        {emptyState}
      </div>
    );
  }

  const axisXDescription = describeAxis(data.axes.x);
  const axisYDescription = describeAxis(data.axes.y);
  const pointMeaning = isPersonScope
    ? "A point represents your operating mode for a single time window."
    : "A point represents an observed system state for the selected scope and time window.";
  const movementMeaning = isPersonScope
    ? "Movement reflects how your operating mode changes across time windows; direction matters more than absolute position."
    : "Movement reflects change in operating mode across time windows; direction matters more than absolute position.";
  const notMeaning = isPersonScope
    ? "Quadrants do not indicate ranking or comparison, and they are not labels of your quality."
    : "Quadrants do not indicate ranking or comparison, and they are not labels of team, repo, or developer quality.";
  const cohortMeaning = isPersonScope
    ? "Only your trajectory is shown; no peer comparison is displayed."
    : scopeType === "team"
      ? focusEntityIds.length
        ? "Team points are labeled for orientation; the focus team is highlighted."
        : "Team points are labeled for orientation; labels do not imply ranking."
      : focusEntityIds.length
        ? "Unlabeled points show the filtered cohort background; labels appear only for focus entities."
        : "Points represent the filtered cohort; labels appear when a focus entity is selected.";
  const zoneMeaning = data.annotations?.length
    ? "Shaded zones indicate operating conditions or pressure, not outcomes."
    : null;

  const explainHref =
    selectedPoint?.evidence_link
      ? buildExploreUrl({ api: selectedPoint.evidence_link, filters })
      : null;
  const workItemHref = explainHref ? `${explainHref}#evidence` : null;
  const heatmapLink = (relatedLinks ?? []).find((link) =>
    link.label.toLowerCase().includes("heatmap")
  );
  const heatmapHref =
    heatmapLink?.href ??
    withFilterParam(defaultHeatmapPath(data.axes), filters);
  const supplementalLinks = (relatedLinks ?? []).filter(
    (link) => !link.label.toLowerCase().includes("heatmap")
  );

  const selectedLabel = selectedPoint
    ? isPersonScope
      ? "Your operating mode"
      : selectedPoint.entity_label
    : null;

  return (
    <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl">{title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          Select a point to investigate
        </div>
      </div>
      <div className="mt-4">
        <QuadrantChart
          data={data}
          height={340}
          onPointSelect={handlePointSelect}
          focusEntityIds={focusEntityIds}
          scopeType={scopeType}
        />
      </div>
      {selectedPoint ? (
        <div className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Next steps
              </p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                {selectedLabel}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              {selectedPoint.window_start} – {selectedPoint.window_end}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em]">
            {explainHref ? (
              <Link
                href={explainHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                Explain what changed
              </Link>
            ) : null}
            {heatmapHref ? (
              <Link
                href={heatmapHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                View related heatmap
              </Link>
            ) : null}
            {workItemHref ? (
              <Link
                href={workItemHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                Inspect representative work item
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Select a point to open investigation steps.
        </p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs text-[var(--ink-muted)]">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Legend
          </p>
          <div className="mt-3 space-y-2">
            <p>
              <span className="font-semibold text-[var(--foreground)]">X-axis:</span>{" "}
              {data.axes.x.label} — {axisXDescription}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">Y-axis:</span>{" "}
              {data.axes.y.label} — {axisYDescription}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">Point:</span>{" "}
              {pointMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Movement:
              </span>{" "}
              {movementMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Not a ranking:
              </span>{" "}
              {notMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Cohort:
              </span>{" "}
              {cohortMeaning}
            </p>
            {zoneMeaning ? (
              <p>
                <span className="font-semibold text-[var(--foreground)]">
                  Zones:
                </span>{" "}
                {zoneMeaning}
              </p>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs text-[var(--ink-muted)]">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            {isPersonScope ? "How to read your view" : "How to read this view"}
          </p>
          <div className="mt-3 space-y-2">
            <p>
              <span className="font-semibold text-[var(--foreground)]">For:</span>{" "}
              {isPersonScope
                ? "Track your operating mode across windows and notice shifts in constraints."
                : "Classify operating modes and detect shifts in constraints across scopes."}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Not for:
              </span>{" "}
              {isPersonScope
                ? "Performance review, scoring, or peer comparison."
                : "Leaderboards, rankings, or quality judgments."}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">Next:</span>{" "}
              {isPersonScope
                ? "Use the related heatmap and flame view to inspect what changed in your work."
                : "Use the related heatmap and flame view to inspect representative work items."}
            </p>
          </div>
        </div>
      </div>
      {supplementalLinks.length ? (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {supplementalLinks.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-1 uppercase tracking-[0.2em] text-[var(--accent-2)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

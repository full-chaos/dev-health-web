"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { findZoneMatches, getZoneOverlay } from "@/lib/quadrantZones";
import { trackTelemetryEvent } from "@/lib/telemetry";
import type { QuadrantAxis, QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { QuadrantChart } from "./QuadrantChart";

const AXIS_DESCRIPTIONS: Record<string, string> = {
  churn: "Rate of code change, rework, and revision.",
  throughput: "Completed delivery units in the window.",
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
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [showZoneOverlay, setShowZoneOverlay] = useState(false);
  const [zoneQuestionsKey, setZoneQuestionsKey] = useState<string | null>(null);
  const zoneOverlay = useMemo(() => getZoneOverlay(data), [data]);
  const dataKey = useMemo(() => {
    if (!data?.points?.length) {
      return null;
    }
    const pointsKey = data.points
      .map(
        (point) =>
          `${point.entity_id}:${point.window_start}:${point.window_end}`
      )
      .join("|");
    return `${data.axes.x.metric}:${data.axes.y.metric}:${pointsKey}`;
  }, [data]);
  const activeSelectedPoint =
    dataKey && selectedPointKey === dataKey ? selectedPoint : null;
  const zoneMatches =
    activeSelectedPoint && showZoneOverlay && zoneOverlay
      ? findZoneMatches(zoneOverlay, activeSelectedPoint)
      : [];
  const zoneIgnoredLogged = useRef(false);
  const axesKey = data ? `${data.axes.x.metric}:${data.axes.y.metric}` : null;

  const handlePointSelect = (point: QuadrantPoint) => {
    setSelectedPoint(point);
    setSelectedPointKey(dataKey);
    setZoneQuestionsKey(null);
  };

  useEffect(() => {
    zoneIgnoredLogged.current = false;
  }, [zoneOverlay]);

  useEffect(() => {
    if (!zoneOverlay || !axesKey || showZoneOverlay || !activeSelectedPoint) {
      return;
    }
    if (zoneIgnoredLogged.current) {
      return;
    }
    trackTelemetryEvent("quadrant_zone_overlay_ignored", {
      axes: axesKey,
      scope: scopeType,
    });
    zoneIgnoredLogged.current = true;
  }, [activeSelectedPoint, axesKey, scopeType, showZoneOverlay, zoneOverlay]);

  if (!data || !data.points?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-5 text-sm text-[var(--ink-muted)]">
        {emptyState}
      </div>
    );
  }

  const axisXDescription = describeAxis(data.axes.x);
  const axisYDescription = describeAxis(data.axes.y);
  const pointMeaning =
    "Each dot represents an observed system state over a fixed time window.";
  const positionMeaning = "Position reflects operating mode, not performance.";
  const quadrantMeaning = "Quadrants do not imply good or bad.";
  const noRankingMeaning =
    "Avoid ranking, percentile, or score language for this view.";
  const snapshotMeaning =
    "Compare snapshots by changing the time window; do not infer direction from a single view.";
  const cohortMeaning = isPersonScope
    ? "Individual scope shows a single dot; no peer comparison is displayed."
    : scopeType === "team"
      ? focusEntityIds.length
        ? "Team dots are labeled for orientation; the focus team is highlighted."
        : "Team dots are labeled for orientation; labels do not imply ranking."
      : focusEntityIds.length
        ? "Unlabeled dots show the filtered cohort background; labels appear only for focus entities."
        : "Dots represent the filtered cohort; labels appear when a focus entity is selected.";
  const zoneMeaning = zoneOverlay
    ? "Experimental zone maps highlight fuzzy, overlapping regions derived from observed metrics."
    : data.annotations?.length
      ? "Shaded zones indicate operating conditions or pressure, not outcomes."
      : null;

  const metricExplainHref = activeSelectedPoint?.evidence_link
    ? buildExploreUrl({ api: activeSelectedPoint.evidence_link, filters })
    : buildExploreUrl({ metric: data.axes.y.metric, filters });
  const flameHref = metricExplainHref ? `${metricExplainHref}#evidence` : null;
  const heatmapLink = (relatedLinks ?? []).find((link) =>
    link.label.toLowerCase().includes("heatmap")
  );
  const heatmapHref =
    heatmapLink?.href ??
    withFilterParam(defaultHeatmapPath(data.axes), filters);
  const supplementalLinks = (relatedLinks ?? []).filter(
    (link) => !link.label.toLowerCase().includes("heatmap")
  );

  const selectedLabel = activeSelectedPoint
    ? isPersonScope
      ? "Selected dot: You"
      : `Selected dot: ${activeSelectedPoint.entity_label}`
    : null;
  const showZoneMenu = zoneMatches.length > 0;
  const showZoneQuestions =
    zoneQuestionsKey !== null &&
    zoneQuestionsKey === dataKey &&
    showZoneOverlay &&
    showZoneMenu;
  const handleZoneToggle = (next: boolean) => {
    setShowZoneOverlay(next);
    setZoneQuestionsKey(null);
    if (zoneOverlay && axesKey) {
      trackTelemetryEvent("quadrant_zone_overlay_toggled", {
        enabled: next,
        axes: axesKey,
        scope: scopeType,
      });
    }
  };

  return (
    <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-display)] text-xl">{title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          Select a dot to investigate
        </div>
      </div>
      {zoneOverlay ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
          <label className="inline-flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[11px]">
            <input
              type="checkbox"
              checked={showZoneOverlay}
              onChange={(event) => handleZoneToggle(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent-2)]"
            />
            <span>Show exploratory interpretation (experimental)</span>
          </label>
          <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
            Optional overlay
          </span>
        </div>
      ) : null}
      <div className="mt-4">
        <QuadrantChart
          data={data}
          height={340}
          onPointSelect={handlePointSelect}
          focusEntityIds={focusEntityIds}
          scopeType={scopeType}
          zoneOverlay={zoneOverlay}
          showZoneOverlay={showZoneOverlay}
        />
      </div>
      {activeSelectedPoint ? (
        <div className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                {showZoneMenu ? "Context menu (experimental)" : "Next steps"}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                {selectedLabel}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              {activeSelectedPoint.window_start} – {activeSelectedPoint.window_end}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em]">
            {showZoneMenu ? (
              <button
                type="button"
                onClick={() =>
                  setZoneQuestionsKey((prev) =>
                    dataKey && prev !== dataKey ? dataKey : null
                  )
                }
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                Investigate common constraints
              </button>
            ) : null}
            {metricExplainHref ? (
              <Link
                href={metricExplainHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                Open metric explain view
              </Link>
            ) : null}
            {heatmapHref ? (
              <Link
                href={heatmapHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                {showZoneMenu ? "View related heatmaps" : "View related heatmap"}
              </Link>
            ) : null}
            {flameHref ? (
              <Link
                href={flameHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                {showZoneMenu
                  ? "Open representative flame diagram"
                  : "Open flame diagram"}
              </Link>
            ) : null}
          </div>
          {showZoneMenu && showZoneQuestions ? (
            <div className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-3 text-[11px] text-[var(--ink-muted)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Experimental zone map
                </p>
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Heuristic
                </span>
              </div>
              <div className="mt-3 space-y-4">
                {zoneMatches.map((zone) => (
                  <div key={zone.id} className="space-y-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {zone.label}
                    </p>
                    <p>
                      <span className="font-semibold text-[var(--foreground)]">
                        Typical signals:
                      </span>{" "}
                      {zone.signals.join(", ")}.
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                      Questions to ask
                    </p>
                    <ul className="list-disc pl-4">
                      {zone.investigations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-[var(--ink-muted)]">
                This is a common pattern, not a conclusion. Always validate with
                drill-down evidence.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Select a dot to open investigation steps.
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
              <span className="font-semibold text-[var(--foreground)]">Dot:</span>{" "}
              {pointMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Position:
              </span>{" "}
              {positionMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Quadrants:
              </span>{" "}
              {quadrantMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                No ranking:
              </span>{" "}
              {noRankingMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Cohort:
              </span>{" "}
              {cohortMeaning}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Time window:
              </span>{" "}
              {snapshotMeaning}
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
                ? "See your current operating mode under competing pressures."
                : "Identify operating modes and clusters under competing pressures."}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">
                Not for:
              </span>{" "}
              {isPersonScope
                ? "Performance review, scoring, percentiles, or peer comparison."
                : "Leaderboards, rankings, percentiles, or quality judgments."}
            </p>
            <p>
              <span className="font-semibold text-[var(--foreground)]">Next:</span>{" "}
              {isPersonScope
                ? "Change the time window to compare snapshots, then use the heatmap, flame diagram, or metric explain view for causes."
                : "Change the time window to compare snapshots, then use the heatmap, flame diagram, or metric explain view for causes."}
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

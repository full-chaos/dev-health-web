"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

const ANNOTATION_COLOR = "rgba(148, 163, 184, 0.2)";
const overlayKeyFor = (type: "zone" | "annotation", id: string | number) =>
  `${type}:${id}`;

const rgbaPattern =
  /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i;
const hexPattern = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const clampAlpha = (alpha: number) => Math.min(1, Math.max(0, alpha));

const withAlpha = (color: string, alpha: number) => {
  const nextAlpha = clampAlpha(alpha);
  const trimmed = color.trim();
  const match = trimmed.match(rgbaPattern);
  if (match) {
    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    if ([red, green, blue].some((value) => Number.isNaN(value))) {
      return color;
    }
    return `rgba(${red}, ${green}, ${blue}, ${nextAlpha})`;
  }
  const hexMatch = trimmed.match(hexPattern);
  if (!hexMatch) {
    return color;
  }
  const hex = hexMatch[1];
  const normalized =
    hex.length === 3 ? hex.split("").map((item) => item + item).join("") : hex;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return color;
  }
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${nextAlpha})`;
};

const formatLegendSignals = (signals: string[]) => signals.join(" + ");

const formatAnnotationType = (label: string) =>
  label.replace(/_/g, " ").trim();

const buildLegendSwatchStyle = (color: string): CSSProperties => ({
  background: `radial-gradient(circle at 35% 35%, ${withAlpha(
    color,
    0.4
  )}, ${withAlpha(color, 0.14)} 60%, rgba(0, 0, 0, 0) 100%)`,
  borderColor: withAlpha(color, 0.45),
  boxShadow: `0 0 12px ${withAlpha(color, 0.3)}`,
});

type QuadrantPanelProps = {
  title: string;
  description: string;
  data?: QuadrantResponse | null;
  filters: MetricFilter;
  relatedLinks?: Array<{ label: string; href: string }>;
  emptyState?: string;
};

type ZoneLegendItem = {
  key: string;
  label: string;
  description: string;
  color: string;
  overlayKey: string;
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
  const [showZoneOverlay, setShowZoneOverlay] = useState(true);
  const [zoneQuestionsKey, setZoneQuestionsKey] = useState<string | null>(null);
  const [hoveredOverlayKey, setHoveredOverlayKey] = useState<string | null>(null);
  const zoneOverlay = useMemo(() => getZoneOverlay(data), [data]);
  const hasInterpretationOverlay = Boolean(
    zoneOverlay || data?.annotations?.length
  );
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
  const zoneLegendItems = useMemo(() => {
    if (!showZoneOverlay || !data) {
      return [];
    }
    const items: ZoneLegendItem[] = [];
    if (zoneOverlay?.zones?.length) {
      items.push(
        ...zoneOverlay.zones.map((zone) => ({
          key: `zone-${zone.id}`,
          label: zone.label,
          description: zone.signals.length
            ? formatLegendSignals(zone.signals)
            : "Common operating mode.",
          color: zone.color,
          overlayKey: overlayKeyFor("zone", zone.id),
        }))
      );
    }
    if (data.annotations?.length) {
      items.push(
        ...data.annotations.map((annotation, index) => ({
          key: `annotation-${index}`,
          label: annotation.description,
          description: annotation.type
            ? formatAnnotationType(annotation.type)
            : "Annotation",
          color: ANNOTATION_COLOR,
          overlayKey: overlayKeyFor("annotation", index),
        }))
      );
    }
    return items;
  }, [data, showZoneOverlay, zoneOverlay]);
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
    setHoveredOverlayKey(null);
  }, [dataKey, showZoneOverlay]);

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
  const zoneMeaning = hasInterpretationOverlay
    ? "Zones are interpretive overlays that suggest common system modes; turn off anytime."
    : null;
  const infoTitle = isPersonScope ? "How to read your view" : "How to read this view";
  const forMeaning = isPersonScope
    ? "See your current operating mode under competing pressures."
    : "Identify operating modes and clusters under competing pressures.";
  const notForMeaning = isPersonScope
    ? "Performance review, scoring, percentiles, or peer comparison."
    : "Leaderboards, rankings, percentiles, or quality judgments.";
  const nextMeaning =
    "Change the time window to compare snapshots, then use the heatmap, flame diagram, or metric explain view for causes.";

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
  const flowBreakdownHref = withFilterParam("/work", filters);
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
  const showZoneLegend = showZoneOverlay && zoneLegendItems.length > 0;
  const handleZoneToggle = (next: boolean) => {
    setShowZoneOverlay(next);
    setZoneQuestionsKey(null);
    setHoveredOverlayKey(null);
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
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Operating modes under competing pressures
          </p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          Select a dot to investigate
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-3 text-xs text-[var(--ink-muted)]">
        {hasInterpretationOverlay ? (
          <div className="space-y-1">
            <label className="inline-flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[11px]">
              <input
                type="checkbox"
                checked={showZoneOverlay}
                onChange={(event) => handleZoneToggle(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent-2)]"
              />
              <span>Show exploratory interpretation</span>
            </label>
            <p className="text-[11px] text-[var(--ink-muted)]">
              Highlights common system modes observed in similar systems.
            </p>
          </div>
        ) : null}
        <details className="relative ml-auto">
          <summary className="flex list-none cursor-pointer items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-[var(--ink-muted)] [&::-webkit-details-marker]:hidden">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--card-stroke)] bg-[var(--card)] text-[11px] text-[var(--foreground)]">
              ⓘ
            </span>
            View guide
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-80 max-w-[90vw] rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] p-4 text-[11px] text-[var(--ink-muted)] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              {infoTitle}
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
                <span className="font-semibold text-[var(--foreground)]">Cohort:</span>{" "}
                {cohortMeaning}
              </p>
              <p>
                <span className="font-semibold text-[var(--foreground)]">
                  Time window:
                </span>{" "}
                {snapshotMeaning}
              </p>
              <p>
                <span className="font-semibold text-[var(--foreground)]">For:</span>{" "}
                {forMeaning}
              </p>
              <p>
                <span className="font-semibold text-[var(--foreground)]">Next:</span>{" "}
                {nextMeaning}
              </p>
            </div>
            {zoneMeaning ? (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  What zones mean
                </p>
                <div className="mt-2 space-y-2">
                  <p>
                    <span className="font-semibold text-[var(--foreground)]">
                      Zones:
                    </span>{" "}
                    {zoneMeaning}
                  </p>
                </div>
              </>
            ) : null}
            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              What this view is not for
            </p>
            <div className="mt-2 space-y-2">
              <p>
                <span className="font-semibold text-[var(--foreground)]">
                  Not for:
                </span>{" "}
                {notForMeaning}
              </p>
              <p>
                <span className="font-semibold text-[var(--foreground)]">
                  No ranking:
                </span>{" "}
                {noRankingMeaning}
              </p>
            </div>
          </div>
        </details>
      </div>
      <div
        className={
          showZoneLegend
            ? "mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]"
            : "mt-4"
        }
      >
        <div>
          <QuadrantChart
            data={data}
            height={340}
            onPointSelect={handlePointSelect}
            focusEntityIds={focusEntityIds}
            scopeType={scopeType}
            zoneOverlay={zoneOverlay}
            showZoneOverlay={showZoneOverlay}
            highlightOverlayKey={hoveredOverlayKey}
          />
        </div>
        {showZoneLegend ? (
          <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs text-[var(--ink-muted)]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Zone legend
              </p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Interpretive
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {zoneLegendItems.map((item) => {
                const isActive = hoveredOverlayKey === item.overlayKey;
                return (
                  <div
                    key={item.key}
                    onMouseEnter={() => setHoveredOverlayKey(item.overlayKey)}
                    onMouseLeave={() => setHoveredOverlayKey(null)}
                    onFocus={() => setHoveredOverlayKey(item.overlayKey)}
                    onBlur={() => setHoveredOverlayKey(null)}
                    tabIndex={0}
                    className={`flex gap-3 rounded-xl border px-2 py-2 transition ${
                      isActive
                        ? "border-[var(--card-stroke)] bg-[var(--card-70)]"
                        : "border-transparent"
                    }`}
                  >
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full border"
                      style={buildLegendSwatchStyle(item.color)}
                    />
                    <div>
                      <p className="text-xs font-semibold text-[var(--foreground)]">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-[var(--ink-muted)]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {activeSelectedPoint ? (
        <div className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                {showZoneMenu ? "Interpretive context" : "Next steps"}
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
            {flowBreakdownHref ? (
              <Link
                href={flowBreakdownHref}
                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)]"
              >
                Follow-up: Investment / Flow Breakdown
              </Link>
            ) : null}
          </div>
          {showZoneMenu && showZoneQuestions ? (
            <div className="mt-4 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] p-3 text-[11px] text-[var(--ink-muted)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Exploratory zone map
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

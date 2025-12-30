"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";

import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import {
  findZoneMatches,
  getQuadrantDefinition,
  getZoneOverlay,
} from "@/lib/quadrantZones";
import { trackTelemetryEvent } from "@/lib/telemetry";
import type { QuadrantAxis, QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { QuadrantChart } from "./QuadrantChart";
import { SankeyInvestigationPanel } from "./SankeyInvestigationPanel";
import { InvestigationPanel } from "./InvestigationPanel";

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
  chartHeight?: number;
  showViewGuide?: boolean;
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
  chartHeight = 340,
  showViewGuide = true,
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
  const [showSankey, setShowSankey] = useState(false);
  const [zoneQuestionsKey, setZoneQuestionsKey] = useState<string | null>(null);
  const [hoveredOverlayKey, setHoveredOverlayKey] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const zoneOverlay = useMemo(() => getZoneOverlay(data), [data]);
  const quadrantDefinition = useMemo(
    () => (data ? getQuadrantDefinition(data.axes) : null),
    [data]
  );
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
          description: zone.description || "Common operating mode.",
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
  const selectablePoints = useMemo(() => {
    if (!data?.points?.length) {
      return [];
    }
    return data.points.length <= 6 ? data.points : [];
  }, [data]);
  const activeHoveredOverlayKey = useMemo(() => {
    if (!showZoneOverlay || !hoveredOverlayKey) {
      return null;
    }
    return zoneLegendItems.some((item) => item.overlayKey === hoveredOverlayKey)
      ? hoveredOverlayKey
      : null;
  }, [hoveredOverlayKey, showZoneOverlay, zoneLegendItems]);
  const zoneIgnoredLogged = useRef(false);
  const axesKey = data ? `${data.axes.x.metric}:${data.axes.y.metric}` : null;

  const handlePointSelect = (point: QuadrantPoint) => {
    setSelectedPoint(point);
    setSelectedPointKey(dataKey);
    setZoneQuestionsKey(null);
    setShowSankey(false);
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


  useEffect(() => {
    if (!isGuideOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGuideOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGuideOpen]);

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
  const influenceNarrative = quadrantDefinition?.influence;
  const influenceLens = influenceNarrative?.lens ?? "Operating mode";
  const influenceFraming =
    influenceNarrative?.framing ??
    "This view highlights competing pressures without ranking.";
  const influenceHabits = influenceNarrative?.habits ?? [];
  const influenceQuestions = influenceNarrative?.questions ?? [];
  const influenceNotes = influenceNarrative?.notes ?? [];
  const influenceNext =
    influenceNarrative?.next ??
    "Use heatmaps, flame diagrams, and metric explain views to investigate causes.";
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
    ? "Zones are interpretive overlays that suggest common system modes under this lens; turn off anytime."
    : null;
  const infoTitle = isPersonScope ? "How to read your view" : "How to read this view";
  const notForMeaning = isPersonScope
    ? "Performance review, scoring, percentiles, or peer comparison."
    : "Leaderboards, rankings, percentiles, or quality judgments.";
  const legendLensLabel = influenceNarrative?.lens ?? null;

  const metricExplainHref = activeSelectedPoint?.evidence_link
    ? buildExploreUrl({ api: activeSelectedPoint.evidence_link, filters })
    : buildExploreUrl({ metric: data.axes.y.metric, filters });
  const flameHref = metricExplainHref ? `${metricExplainHref}#evidence` : null;
  const aggregatedFlameMode = data.axes.x.metric.includes("churn")
    ? "code_hotspots"
    : "cycle_breakdown";
  const aggregatedFlameHref = withFilterParam(`/flame?mode=${aggregatedFlameMode}`, filters);
  const cycleBreakdownFlameHref = withFilterParam("/flame?mode=cycle_breakdown", filters);
  const throughputFlameHref = withFilterParam("/flame?mode=throughput", filters);
  const hotspotsFlameHref = withFilterParam("/flame?mode=code_hotspots", filters);
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl">{title}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          <span>Select a dot to investigate</span>
          {showViewGuide ? (
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-[var(--ink-muted)]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--card-stroke)] bg-[var(--card)] text-[11px] text-[var(--foreground)]">
                ⓘ
              </span>
              View guide
            </button>
          ) : null}
        </div>
      </div>
      {showViewGuide && isGuideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsGuideOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5 text-[11px] text-[var(--ink-muted)] shadow-[0_30px_70px_-35px_rgba(0,0,0,0.7)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  {infoTitle}
                </p>
                <p className="mt-2 text-sm text-[var(--foreground)]">
                  How to read this view
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="rounded-full border border-[var(--card-stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-muted)]"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <p>
                <span className="font-semibold text-[var(--foreground)] uppercase tracking-wider text-[10px]">
                  1. Lenses:
                </span>{" "}
                {influenceLens}. {influenceFraming}
              </p>
              <p>
                <span className="font-semibold text-[var(--foreground)] uppercase tracking-wider text-[10px]">
                  2. Coordinates:
                </span>{" "}
                {data.axes.x.label} ({axisXDescription}) vs {data.axes.y.label} ({axisYDescription}).
              </p>
              <p>
                <span className="font-semibold text-[var(--foreground)] uppercase tracking-wider text-[10px]">
                  3. System Patterns:
                </span>{" "}
                {pointMeaning} {positionMeaning} {quadrantMeaning}
              </p>
            </div>
            {influenceNotes.length ? (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Field notes
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {influenceNotes.slice(0, 3).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {influenceHabits.length ? (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Habits that shape this view
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {influenceHabits.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {influenceQuestions.length ? (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Questions to investigate
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {influenceQuestions.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Where to look next
            </p>
            <p className="mt-2">{influenceNext}</p>
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
        </div>
      ) : null}
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
      </div>
      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div
            className={`grid w-full gap-4 lg:items-start ${showZoneLegend
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]"
              : "grid-cols-1"
              }`}
          >
            <div className="min-w-0">
              <QuadrantChart
                data={data}
                height={chartHeight}
                className="w-full"
                style={{ minWidth: 0 }}
                onPointSelect={handlePointSelect}
                focusEntityIds={focusEntityIds}
                scopeType={scopeType}
                zoneOverlay={zoneOverlay}
                showZoneOverlay={showZoneOverlay}
                highlightOverlayKey={activeHoveredOverlayKey}
              />
            </div>
            {showZoneLegend ? (
              <div className="min-w-0 rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-4 text-xs text-[var(--ink-muted)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                    Zone legend
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                    Interpretive
                  </span>
                </div>
                {legendLensLabel ? (
                  <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                    {legendLensLabel}
                  </p>
                ) : null}
                <div className="mt-3 space-y-3">
                  {zoneLegendItems.map((item) => {
                    const isActive = activeHoveredOverlayKey === item.overlayKey;
                    return (
                      <div
                        key={item.key}
                        onMouseEnter={() => setHoveredOverlayKey(item.overlayKey)}
                        onMouseLeave={() => setHoveredOverlayKey(null)}
                        onFocus={() => setHoveredOverlayKey(item.overlayKey)}
                        onBlur={() => setHoveredOverlayKey(null)}
                        tabIndex={0}
                        className={`flex gap-3 rounded-xl border px-2 py-2 transition ${isActive
                          ? "border-[var(--card-stroke)] bg-[var(--card-70)]"
                          : "border-transparent"
                          }`}
                      >
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full border"
                          style={buildLegendSwatchStyle(item.color)}
                        />
                        <div className="min-w-0">
                          <p className="break-words text-xs font-semibold text-[var(--foreground)]">
                            {item.label}
                          </p>
                          <p className="break-words text-[11px] leading-snug text-[var(--ink-muted)] line-clamp-2">
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

          {!activeSelectedPoint && (
            <div className="text-xs text-[var(--ink-muted)] bg-[var(--card-80)] rounded-2xl p-4 border border-dashed border-[var(--card-stroke)]">
              <p>Select a dot in the chart above to investigate causes and patterns.</p>
              {selectablePoints.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectablePoints.map((point) => (
                    <button
                      key={point.entity_id}
                      type="button"
                      onClick={() => handlePointSelect(point)}
                      className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[var(--accent-2)] hover:bg-[var(--accent-2)]/5 transition"
                    >
                      {point.entity_label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {supplementalLinks.length > 0 && (
            <div className="flex flex-wrap gap-3 text-xs">
              {supplementalLinks.map((link) => (
                <Link
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-4 py-2 uppercase tracking-[0.2em] text-[var(--accent-2)] hover:bg-[var(--accent-2)]/5 transition"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {activeSelectedPoint && (
          <aside className="lg:w-[380px] shrink-0 border border-[var(--card-stroke)] rounded-[32px] overflow-hidden shadow-2xl">
            <InvestigationPanel
              point={activeSelectedPoint}
              data={data}
              filters={filters}
              onClose={() => {
                setSelectedPoint(null);
                setSelectedPointKey(null);
              }}
            />
          </aside>
        )}
      </div>

      {showSankey && activeSelectedPoint && (
        <div className="mt-8 border-t border-[var(--card-stroke)] pt-8">
          <SankeyInvestigationPanel
            key={`${activeSelectedPoint.entity_id}-${dataKey ?? "sankey"}`}
            point={activeSelectedPoint}
            filters={filters}
          />
        </div>
      )}
    </div>
  );
}

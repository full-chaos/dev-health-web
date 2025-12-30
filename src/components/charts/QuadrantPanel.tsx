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
import {
  getQuadrantDefinition,
  getZoneOverlay,
} from "@/lib/quadrantZones";
import { trackTelemetryEvent } from "@/lib/telemetry";
import type { QuadrantAxis, QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { QuadrantChart } from "./QuadrantChart";
import { InvestigationPanel } from "./InvestigationPanel";

const AXIS_DESCRIPTIONS: Record<string, string> = {
  churn: "System change and technical revision volume.",
  throughput: "Completed delivery units in the window.",
  cycle_time: "Elapsed time from start to delivery.",
  lead_time: "Elapsed time from request to delivery.",
  wip: "Average concurrent work in flight.",
  wip_saturation: "Average concurrent work in flight.",
  review_load: "Review requests per reviewer.",
  review_latency: "Elapsed time for review completion.",
};

const describeAxis = (axis: QuadrantAxis) =>
  AXIS_DESCRIPTIONS[axis.metric] ??
  `Observed ${axis.label.toLowerCase()} over the selected window.`;


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
  const scopedData = useMemo(() => {
    if (!data || !isPersonScope) {
      return data;
    }
    const focusId = focusEntityIds[0];
    if (!focusId) {
      return { ...data, points: [] };
    }
    const points = (data.points ?? []).filter(
      (point) => point.entity_id === focusId
    );
    return { ...data, points };
  }, [data, focusEntityIds, isPersonScope]);
  const [selectedPoint, setSelectedPoint] = useState<QuadrantPoint | null>(null);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [showZoneOverlay, setShowZoneOverlay] = useState(true);
  const [hoveredOverlayKey, setHoveredOverlayKey] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const zoneOverlay = useMemo(() => {
    if (!scopedData) {
      return null;
    }
    const scopedOverlay = getZoneOverlay(scopedData);
    if (!scopedOverlay && isPersonScope && data) {
      return getZoneOverlay(data);
    }
    return scopedOverlay;
  }, [data, isPersonScope, scopedData]);
  const quadrantDefinition = useMemo(
    () => (scopedData ? getQuadrantDefinition(scopedData.axes) : null),
    [scopedData]
  );
  const hasInterpretationOverlay = Boolean(
    zoneOverlay || scopedData?.annotations?.length
  );
  const dataKey = useMemo(() => {
    if (!scopedData?.points?.length) {
      return null;
    }
    const pointsKey = scopedData.points
      .map(
        (point) =>
          `${point.entity_id}:${point.window_start}:${point.window_end}`
      )
      .join("|");
    return `${scopedData.axes.x.metric}:${scopedData.axes.y.metric}:${pointsKey}`;
  }, [scopedData]);
  const activeSelectedPoint =
    dataKey && selectedPointKey === dataKey ? selectedPoint : null;
  const zoneLegendItems = useMemo(() => {
    if (!showZoneOverlay || !scopedData) {
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
    if (scopedData.annotations?.length) {
      items.push(
        ...scopedData.annotations.map((annotation, index) => ({
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
  }, [scopedData, showZoneOverlay, zoneOverlay]);
  const selectablePoints = useMemo(() => {
    if (!scopedData?.points?.length) {
      return [];
    }
    return scopedData.points.length <= 6 ? scopedData.points : [];
  }, [scopedData]);
  const activeHoveredOverlayKey = useMemo(() => {
    if (!showZoneOverlay || !hoveredOverlayKey) {
      return null;
    }
    return zoneLegendItems.some((item) => item.overlayKey === hoveredOverlayKey)
      ? hoveredOverlayKey
      : null;
  }, [hoveredOverlayKey, showZoneOverlay, zoneLegendItems]);
  const zoneIgnoredLogged = useRef(false);
  const axesKey = scopedData ? `${scopedData.axes.x.metric}:${scopedData.axes.y.metric}` : null;

  const handlePointSelect = (point: QuadrantPoint) => {
    setSelectedPoint(point);
    setSelectedPointKey(dataKey);
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

  if (!scopedData || !scopedData.points?.length) {
    return (
      <div className="rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm text-(--ink-muted)">
        {emptyState}
      </div>
    );
  }

  const axisXDescription = describeAxis(scopedData.axes.x);
  const axisYDescription = describeAxis(scopedData.axes.y);
  const pointMeaning =
    "Each dot represents an observed system state over a fixed time window.";
  const positionMeaning = "Position reflects operating mode, not performance.";
  const quadrantMeaning = "Quadrants do not imply good or bad.";
  const noRankingMeaning =
    "Avoid ranking, percentile, or score language for this view.";
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
  const zoneMeaning = hasInterpretationOverlay
    ? "Zones are interpretive overlays that suggest common system modes under this lens; turn off anytime."
    : null;
  const infoTitle = isPersonScope ? "How to read your view" : "How to read this view";
  const notForMeaning = isPersonScope
    ? "Performance review, scoring, percentiles, or peer comparison."
    : "Leaderboards, rankings, percentiles, or quality judgments.";
  const legendLensLabel = influenceNarrative?.lens ?? null;

  const supplementalLinks = (relatedLinks ?? []).filter(
    (link) => !link.label.toLowerCase().includes("heatmap")
  );

  const showZoneLegend = showZoneOverlay && zoneLegendItems.length > 0;
  const handleZoneToggle = (next: boolean) => {
    setShowZoneOverlay(next);
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
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-(--font-display) text-xl">{title}</h2>
          <p className="mt-2 text-sm text-(--ink-muted)">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
          <span>Select a dot to investigate</span>
          {showViewGuide ? (
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="flex items-center gap-2 rounded-full border border-(--card-stroke) bg-(--card-80) px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-(--ink-muted)"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-(--card-stroke) bg-card text-[11px] text-foreground">
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
            className="w-full max-w-lg rounded-3xl border border-(--card-stroke) bg-card p-5 text-[11px] text-(--ink-muted) shadow-[0_30px_70px_-35px_rgba(0,0,0,0.7)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
                  {infoTitle}
                </p>
                <p className="mt-2 text-sm text-foreground">
                  How to read this view
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <p>
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                  1. Lenses:
                </span>{" "}
                {influenceLens}. {influenceFraming}
              </p>
              <p>
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                  2. Coordinates:
                </span>{" "}
                {scopedData.axes.x.label} ({axisXDescription}) vs {scopedData.axes.y.label} ({axisYDescription}).
              </p>
              <p>
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                  3. System Patterns:
                </span>{" "}
                {pointMeaning} {positionMeaning} {quadrantMeaning}
              </p>
            </div>
            {influenceNotes.length ? (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
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
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
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
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
                  Questions to investigate
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {influenceQuestions.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
              Where to look next
            </p>
            <p className="mt-2">{influenceNext}</p>
            {zoneMeaning ? (
              <>
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
                  What zones mean
                </p>
                <div className="mt-2 space-y-2">
                  <p>
                    <span className="font-semibold text-foreground">
                      Zones:
                    </span>{" "}
                    {zoneMeaning}
                  </p>
                </div>
              </>
            ) : null}
            <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
              What this view is not for
            </p>
            <div className="mt-2 space-y-2">
              <p>
                <span className="font-semibold text-foreground">
                  Not for:
                </span>{" "}
                {notForMeaning}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  No ranking:
                </span>{" "}
                {noRankingMeaning}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-start gap-3 text-xs text-(--ink-muted)">
        {hasInterpretationOverlay ? (
          <div className="space-y-1">
            <label className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) bg-(--card-80) px-3 py-2 text-[11px]">
              <input
                type="checkbox"
                checked={showZoneOverlay}
                onChange={(event) => handleZoneToggle(event.target.checked)}
                className="h-3.5 w-3.5 accent-(--accent-2)"
              />
              <span>Show exploratory interpretation</span>
            </label>
            <p className="text-[11px] text-(--ink-muted)">
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
                data={scopedData}
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
              <div className="min-w-0 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4 text-xs text-(--ink-muted)">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
                    Zone legend
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">
                    Interpretive
                  </span>
                </div>
                {legendLensLabel ? (
                  <p className="mt-1 text-[11px] text-(--ink-muted)">
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
                          ? "border-(--card-stroke) bg-(--card-70)"
                          : "border-transparent"
                          }`}
                      >
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full border"
                          style={buildLegendSwatchStyle(item.color)}
                        />
                        <div className="min-w-0">
                          <p className={`break-words font-semibold text-foreground ${isActive ? "text-xs" : "text-[11px]"}`}>
                            {item.label}
                          </p>
                          {isActive && (
                            <p className="mt-1 break-words text-[11px] leading-snug text-(--ink-muted) animate-in fade-in slide-in-from-top-1 duration-200">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {!activeSelectedPoint && (
            <div className="text-xs text-(--ink-muted) bg-(--card-80) rounded-2xl p-4 border border-dashed border-(--card-stroke)">
              <p>
                {isPersonScope
                  ? "Individual in view."
                  : "Select a dot in the chart above to investigate causes and patterns."}
              </p>
              {selectablePoints.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectablePoints.map((point) =>
                    isPersonScope ? (
                      <span
                        key={point.entity_id}
                        className="rounded-full border border-(--card-stroke) bg-card px-3 py-1 text-(--accent-2)"
                      >
                        {point.entity_label}
                      </span>
                    ) : (
                      <button
                        key={point.entity_id}
                        type="button"
                        onClick={() => handlePointSelect(point)}
                        className="rounded-full border border-(--card-stroke) bg-card px-3 py-1 text-(--accent-2) hover:bg-(--accent-2)/5 transition"
                      >
                        {point.entity_label}
                      </button>
                    )
                  )}
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
                  className="rounded-full border border-(--card-stroke) bg-(--card-80) px-4 py-2 uppercase tracking-[0.2em] text-(--accent-2) hover:bg-(--accent-2)/5 transition"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {activeSelectedPoint && (
          <aside className="lg:w-[380px] shrink-0 border border-(--card-stroke) rounded-[32px] overflow-hidden shadow-2xl">
            <InvestigationPanel
              point={activeSelectedPoint}
              data={data}
              filters={filters}
              title={title}
              onClose={() => {
                setSelectedPoint(null);
                setSelectedPointKey(null);
              }}
            />
          </aside>
        )}
      </div>

    </div>
  );
}

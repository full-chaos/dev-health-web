import type { QuadrantPoint, QuadrantResponse } from "./types";

export type ZoneRegion = {
  id: string;
  label: string;
  signals: string[];
  investigations: string[];
  color: string;
  xRange: [number, number];
  yRange: [number, number];
};

export type ZoneOverlay = {
  id: string;
  label: string;
  zones: ZoneRegion[];
};

type AxisBands = {
  min: number;
  max: number;
  lowMax: number;
  highMin: number;
};

type ZoneTemplate = {
  id: string;
  label: string;
  churn: "low" | "high";
  throughput: "low" | "high";
  signals: string[];
  investigations: string[];
  color: string;
};

const CHURN_THROUGHPUT_ZONES: ZoneTemplate[] = [
  {
    id: "stability-dominant",
    label: "Stability-Dominant Zone",
    churn: "low",
    throughput: "high",
    signals: ["Low churn", "High or stable throughput"],
    investigations: [
      "Is ownership concentrated in a small set of repos or services?",
      "Is bus factor risk rising while throughput stays steady?",
      "Are deferred quality signals building without visible churn?",
    ],
    color: "rgba(34, 197, 94, 0.12)",
  },
  {
    id: "expansion-pressure",
    label: "Expansion Pressure Zone",
    churn: "high",
    throughput: "high",
    signals: ["Rising churn", "Rising throughput"],
    investigations: [
      "What share of work is planned versus unplanned as volume grows?",
      "Is architectural change accelerating alongside throughput?",
      "Is review load growth keeping pace with the expansion?",
    ],
    color: "rgba(59, 130, 246, 0.12)",
  },
  {
    id: "coordination-pressure",
    label: "Saturation / Coordination Pressure Zone",
    churn: "high",
    throughput: "low",
    signals: ["Rising churn", "Flat or declining throughput"],
    investigations: [
      "Is review latency rising as change volume climbs?",
      "Are WIP limits being exceeded or ignored?",
      "Are rework loops or handoffs increasing?",
      "Do dependency bottlenecks show up in drill-down evidence?",
    ],
    color: "rgba(244, 63, 94, 0.12)",
  },
  {
    id: "constrained-underutilized",
    label: "Constrained / Underutilized Zone",
    churn: "low",
    throughput: "low",
    signals: ["Low churn", "Low throughput"],
    investigations: [
      "Is work blocked by external dependencies?",
      "Is intake throttling limiting throughput?",
      "Are blockers accumulating without visible churn?",
    ],
    color: "rgba(249, 115, 22, 0.12)",
  },
];

const percentileFromSorted = (sorted: number[], percentile: number) => {
  if (!sorted.length) {
    return 0;
  }
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex] ?? 0;
  }
  const weight = position - lowerIndex;
  const lowerValue = sorted[lowerIndex] ?? 0;
  const upperValue = sorted[upperIndex] ?? 0;
  return lowerValue + (upperValue - lowerValue) * weight;
};

const buildAxisBands = (
  points: QuadrantPoint[],
  key: "x" | "y"
): AxisBands | null => {
  const values = points
    .map((point) => point[key])
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  if (min === max) {
    return null;
  }
  const lowMax = percentileFromSorted(sorted, 0.55);
  const highMin = percentileFromSorted(sorted, 0.45);
  return {
    min,
    max,
    lowMax: Math.max(min, Math.min(lowMax, max)),
    highMin: Math.min(max, Math.max(highMin, min)),
  };
};

export const getZoneOverlay = (
  data: QuadrantResponse | null | undefined
): ZoneOverlay | null => {
  if (!data?.points?.length) {
    return null;
  }
  const xMetric = data.axes.x.metric;
  const yMetric = data.axes.y.metric;
  const hasChurn = xMetric === "churn" || yMetric === "churn";
  const hasThroughput = xMetric === "throughput" || yMetric === "throughput";
  if (!hasChurn || !hasThroughput) {
    return null;
  }
  const churnAxis: "x" | "y" = xMetric === "churn" ? "x" : "y";
  const throughputAxis: "x" | "y" = xMetric === "throughput" ? "x" : "y";
  if (churnAxis === throughputAxis) {
    return null;
  }
  const xBands = buildAxisBands(data.points, "x");
  const yBands = buildAxisBands(data.points, "y");
  if (!xBands || !yBands) {
    return null;
  }

  const churnBands = churnAxis === "x" ? xBands : yBands;
  const throughputBands = throughputAxis === "x" ? xBands : yBands;
  const churnRanges = {
    low: [churnBands.min, churnBands.lowMax] as [number, number],
    high: [churnBands.highMin, churnBands.max] as [number, number],
  };
  const throughputRanges = {
    low: [throughputBands.min, throughputBands.lowMax] as [number, number],
    high: [throughputBands.highMin, throughputBands.max] as [number, number],
  };

  const zones = CHURN_THROUGHPUT_ZONES.map((zone) => {
    const churnRange = zone.churn === "low" ? churnRanges.low : churnRanges.high;
    const throughputRange =
      zone.throughput === "low" ? throughputRanges.low : throughputRanges.high;
    const xRange = churnAxis === "x" ? churnRange : throughputRange;
    const yRange = churnAxis === "y" ? churnRange : throughputRange;
    return {
      id: zone.id,
      label: zone.label,
      signals: zone.signals,
      investigations: zone.investigations,
      color: zone.color,
      xRange,
      yRange,
    };
  });

  return {
    id: "churn-throughput",
    label: "Churn x Throughput",
    zones,
  };
};

export const findZoneMatches = (
  overlay: ZoneOverlay,
  point: QuadrantPoint
): ZoneRegion[] =>
  overlay.zones.filter(
    (zone) =>
      point.x >= zone.xRange[0] &&
      point.x <= zone.xRange[1] &&
      point.y >= zone.yRange[0] &&
      point.y <= zone.yRange[1]
  );

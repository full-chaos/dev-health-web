import type { QuadrantPoint, QuadrantResponse } from "./types";

export type ZoneRegion = {
  id: string;
  label: string;
  description: string;
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

export type QuadrantInfluence = {
  lens: string;
  framing: string;
  habits: string[];
  questions: string[];
  next: string;
  notes?: string[];
};

export type QuadrantDefinition = {
  id: string;
  label: string;
  metrics: [string, string];
  influence: QuadrantInfluence;
  zones: ZoneTemplate[];
};

type AxisBands = {
  min: number;
  max: number;
  lowMax: number;
  highMin: number;
};

type MetricLevel = "low" | "high";

type ZoneTemplate = {
  id: string;
  label: string;
  description: string;
  levels: Record<string, MetricLevel>;
  signals: string[];
  investigations: string[];
  color: string;
};

const SHARED_NOTES = [
  "Coordination across lenses is expected; views are complementary, not contradictory.",
  "This lens highlights a dominant pressure, not the whole system.",
];

const QUADRANT_DEFINITIONS: QuadrantDefinition[] = [
  {
    id: "churn-throughput",
    label: "Churn x Throughput",
    metrics: ["churn", "throughput"],
    influence: {
      lens: "Change strategy and system stability",
      framing:
        "This view differentiates refactor-heavy and delivery-heavy operating modes.",
      habits: [
        "Architectural evolution and platform shifts",
        "Technical debt repayment cadence",
        "Shifting product requirements or scope changes",
        "Late discovery of dependencies and rework loops",
        "Intentional stabilization periods",
      ],
      questions: [
        "Is churn intentional or reactive?",
        "Is rework discovered early or late?",
        "Does change convert into durable progress?",
      ],
      next:
        "Use code and work heatmaps, flame diagrams, and metric explain views to see where change concentrates.",
      notes: [...SHARED_NOTES],
    },
    zones: [
      {
        id: "stability-dominant",
        label: "Stability-Dominant Zone",
        description: "Stability dominates while delivery remains steady.",
        levels: { churn: "low", throughput: "high" },
        signals: ["Low churn", "Steady throughput", "Few rework loops"],
        investigations: [
          "Is stability intentional or a pause in change?",
          "Are architectural risks building silently?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "expansion-pressure",
        label: "Expansion Pressure Zone",
        description: "Expansion and steady delivery coexist as change and delivery remain high.",
        levels: { churn: "high", throughput: "high" },
        signals: ["Rising churn", "Strong throughput", "Parallel refactors"],
        investigations: [
          "Is churn planned or reactive rework?",
          "Are dependencies discovered late in cycles?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "coordination-pressure",
        label: "Saturation / Coordination Pressure Zone",
        description: "High change with lagging delivery suggests coordination pressure.",
        levels: { churn: "high", throughput: "low" },
        signals: ["High churn", "Flat throughput", "Handoff delays"],
        investigations: [
          "Are reviews slowing down conversion?",
          "Is rework discovered late in the window?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "constrained-underutilized",
        label: "Constrained / Underutilized Zone",
        description: "Flow is limited by potential constraints or intentional pauses.",
        levels: { churn: "low", throughput: "low" },
        signals: ["Low churn", "Low throughput", "Blocked intake"],
        investigations: [
          "Are external constraints limiting delivery?",
          "Is demand muted or scope unclear?",
        ],
        color: "rgba(249, 115, 22, 0.12)",
      },
    ],
  },
  {
    id: "cycle-throughput",
    label: "Cycle Time x Throughput",
    metrics: ["cycle_time", "throughput"],
    influence: {
      lens: "Momentum",
      framing:
        "This view highlights momentum - how quickly work moves through the system relative to what gets delivered.",
      habits: [
        "Requirement clarity and ready backlog",
        "Defect and rework rate",
        "CI/CD reliability",
        "Release and deployment practices",
        "Operational maturity in handoffs",
      ],
      questions: [
        "Is work spending more time waiting than executing?",
        "Are defects or unclear requirements elongating cycles?",
        "Is delivery speed constrained by tooling or process?",
      ],
      next:
        "Use work heatmaps, flame diagrams, and metric explain views to see where time accumulates.",
      notes: [...SHARED_NOTES],
    },
    zones: [
      {
        id: "rapid-flow",
        label: "Rapid Flow Zone",
        description: "Steady output with short cycles indicates high momentum.",
        levels: { cycle_time: "low", throughput: "high" },
        signals: ["Low cycle time", "Small batches", "Minimal waiting"],
        investigations: [
          "Is flow stable across the window?",
          "Are releases gated by manual policy?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "batch-delivery",
        label: "Batch Delivery Zone",
        description: "High output with long cycles suggests batching or waiting.",
        levels: { cycle_time: "high", throughput: "high" },
        signals: ["High throughput", "Batching releases", "Accumulated waiting"],
        investigations: [
          "Is work waiting more than executing?",
          "Are release gates driving long cycles?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "friction-dominant",
        label: "Friction-Dominant Zone",
        description: "Limited output with long cycles indicates delivery friction.",
        levels: { cycle_time: "high", throughput: "low" },
        signals: ["High latency", "Queueing handoffs", "Frequent rework"],
        investigations: [
          "Are requirements elongating cycles?",
          "Where is work consistently stalling?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "quick-low-output",
        label: "Quick Cycles, Low Output Zone",
        description: "Short cycles with limited output suggest light demand or intake.",
        levels: { cycle_time: "low", throughput: "low" },
        signals: ["Short cycles", "Small items", "Low intake volume"],
        investigations: [
          "Is demand or intake limiting output?",
          "Is capacity reserved for other work?",
        ],
        color: "rgba(249, 115, 22, 0.12)",
      },
    ],
  },
  {
    id: "wip-throughput",
    label: "WIP x Throughput",
    metrics: ["wip", "throughput"],
    influence: {
      lens: "Product direction and role clarity",
      framing:
        "This view reflects clarity of product direction and role boundaries under load.",
      habits: [
        "Well-defined product intent",
        "Limited prototyping churn",
        "Clear ownership of tasks and subtasks",
        "Explicit work intake and prioritization",
        "Stable role boundaries for cross-team work",
      ],
      questions: [
        "Is work starting faster than it finishes?",
        "Are people context-switching due to unclear scope?",
        "Is prototyping bleeding into execution?",
      ],
      next:
        "Use work heatmaps, flame diagrams, and metric explain views to see where work piles up.",
      notes: [...SHARED_NOTES],
    },
    zones: [
      {
        id: "focused-delivery",
        label: "Focused Delivery Zone",
        description: "Steady output with lean work in flight suggests focused direction.",
        levels: { wip: "low", throughput: "high" },
        signals: ["Low WIP", "Lean intake", "Directional focus"],
        investigations: [
          "Is focus sustained across the window?",
          "Are role boundaries stable under load?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "high-load-converting",
        label: "High Load, Converting Zone",
        description: "Steady output with high work in flight suggests rising coordination pressure.",
        levels: { wip: "high", throughput: "high" },
        signals: ["High WIP", "Strong output", "Rising handoffs"],
        investigations: [
          "Is work starting faster than it finishes?",
          "Is prototyping bleeding into delivery?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "diffuse-effort",
        label: "Diffuse Effort Zone",
        description: "High work in flight without conversion suggests blurred scope or ownership.",
        levels: { wip: "high", throughput: "low" },
        signals: ["Context switching", "Prototype churn", "Blurred scope"],
        investigations: [
          "Are owners clear as load rises?",
          "Is intake intentionally prioritized?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "limited-intake",
        label: "Limited Intake Zone",
        description: "Low work in flight and output suggests limited demand or flow constraints.",
        levels: { wip: "low", throughput: "low" },
        signals: ["Low WIP", "Blocked intake", "Light demand"],
        investigations: [
          "Is demand muted or undefined?",
          "Are external dependencies gating flow?",
        ],
        color: "rgba(249, 115, 22, 0.12)",
      },
    ],
  },
  {
    id: "review-load-latency",
    label: "Review Load x Review Latency",
    metrics: ["review_load", "review_latency"],
    influence: {
      lens: "Collaboration health and ownership distribution",
      framing:
        "This view highlights collaboration dynamics and ownership distribution under review pressure.",
      habits: [
        "Appropriately sized changes",
        "Healthy review practices and expectations",
        "Emerging subject-matter expertise",
        "Uneven skill distribution",
        "Portfolio or project load",
      ],
      questions: [
        "Are changes sized for effective review?",
        "Is review load concentrated on a few people?",
        "Is up-leveling or redistribution needed?",
      ],
      next:
        "Use review heatmaps, flame diagrams, and metric explain views to see where review wait accumulates.",
      notes: [
        ...SHARED_NOTES,
        "Signals can surface at individual, team, or portfolio scope without ranking.",
      ],
    },
    zones: [
      {
        id: "responsive-review",
        label: "Responsive Review Zone",
        description: "Light review demand and quick turnaround indicate healthy collaboration.",
        levels: { review_load: "low", review_latency: "low" },
        signals: ["Fast turnaround", "Small changes", "High availability"],
        investigations: [
          "Are review practices consistent?",
          "Is ownership effectively distributed?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "distributed-review",
        label: "Distributed Review Zone",
        description: "High review demand with quick turnaround suggests spread ownership.",
        levels: { review_load: "high", review_latency: "low" },
        signals: ["Shared load", "Low latency", "High throughput"],
        investigations: [
          "Is review load fairly distributed?",
          "Are SMEs scaling support?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "bottlenecked-review",
        label: "Bottlenecked Review Zone",
        description: "High review demand with slow turnaround suggests concentrated ownership.",
        levels: { review_load: "high", review_latency: "high" },
        signals: ["Queueing", "Concentrated load", "Large cycles"],
        investigations: [
          "Is redistribution or up-leveling needed?",
          "Are changes sized for effective review?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "deferred-review",
        label: "Deferred Review Zone",
        description: "Slow turnaround with light review demand suggests split attention.",
        levels: { review_load: "low", review_latency: "high" },
        signals: ["Slow turnaround", "Light load", "Split attention"],
        investigations: [
          "Are reviews blocked bycommitments?",
          "Are expectations explicit?",
        ],
        color: "rgba(249, 115, 22, 0.12)",
      },
    ],
  },
];

const normalizeMetric = (metric: string) => {
  if (metric === "wip_saturation") {
    return "wip";
  }
  if (metric === "lead_time") {
    return "cycle_time";
  }
  return metric;
};

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

const resolveQuadrantDefinition = (axes: QuadrantResponse["axes"]) => {
  const xMetric = normalizeMetric(axes.x.metric);
  const yMetric = normalizeMetric(axes.y.metric);
  const definition = QUADRANT_DEFINITIONS.find(
    (item) => item.metrics.includes(xMetric) && item.metrics.includes(yMetric)
  );
  if (!definition) {
    return null;
  }
  return { definition, xMetric, yMetric };
};

export const getQuadrantDefinition = (axes: QuadrantResponse["axes"]) =>
  resolveQuadrantDefinition(axes)?.definition ?? null;

export const getZoneOverlay = (
  data: QuadrantResponse | null | undefined
): ZoneOverlay | null => {
  if (!data?.points?.length) {
    return null;
  }
  const resolved = resolveQuadrantDefinition(data.axes);
  if (!resolved) {
    return null;
  }
  const xBands = buildAxisBands(data.points, "x");
  const yBands = buildAxisBands(data.points, "y");
  if (!xBands || !yBands) {
    return null;
  }

  const { definition, xMetric, yMetric } = resolved;
  const rangesByMetric: Record<string, { low: [number, number]; high: [number, number] }> =
  {
    [xMetric]: {
      low: [xBands.min, xBands.lowMax],
      high: [xBands.highMin, xBands.max],
    },
    [yMetric]: {
      low: [yBands.min, yBands.lowMax],
      high: [yBands.highMin, yBands.max],
    },
  };

  const zones = definition.zones
    .map((zone) => {
      const xLevel = zone.levels[xMetric];
      const yLevel = zone.levels[yMetric];
      if (!xLevel || !yLevel) {
        return null;
      }
      return {
        id: zone.id,
        label: zone.label,
        description: zone.description,
        signals: zone.signals,
        investigations: zone.investigations,
        color: zone.color,
        xRange: rangesByMetric[xMetric][xLevel],
        yRange: rangesByMetric[yMetric][yLevel],
      };
    })
    .filter((zone): zone is ZoneRegion => Boolean(zone));

  return {
    id: definition.id,
    label: definition.label,
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

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
  "Overlap across quadrants is expected; a team can look constrained in one lens and stable in another without contradiction.",
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
        description:
          "Delivery is steady while change volume stays low; stability dominates.",
        levels: { churn: "low", throughput: "high" },
        signals: [
          "Low churn with steady throughput",
          "Incremental change with stable delivery",
          "Few rework cycles",
        ],
        investigations: [
          "Is stability intentional or a pause in change?",
          "Are hidden risks building without visible churn?",
          "Is architectural evolution deferred?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "expansion-pressure",
        label: "Expansion Pressure Zone",
        description:
          "Change volume and delivery are both high; the system is evolving while shipping.",
        levels: { churn: "high", throughput: "high" },
        signals: [
          "Rising churn with strong throughput",
          "Parallel refactors and delivery",
          "Frequent dependency changes",
        ],
        investigations: [
          "Is churn planned or reactive?",
          "Are dependencies discovered late?",
          "Is review capacity keeping pace with change?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "coordination-pressure",
        label: "Saturation / Coordination Pressure Zone",
        description:
          "Change volume is high but throughput lags; coordination pressure may dominate.",
        levels: { churn: "high", throughput: "low" },
        signals: [
          "High churn with flat throughput",
          "Rework loops or handoffs increasing",
          "Dependencies queueing",
        ],
        investigations: [
          "Is rework discovered late in the window?",
          "Are handoffs or reviews slowing conversion?",
          "Does change convert into durable progress?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "constrained-underutilized",
        label: "Constrained / Underutilized Zone",
        description:
          "Low change and low delivery; constraints or intentional pauses may limit flow.",
        levels: { churn: "low", throughput: "low" },
        signals: [
          "Low churn with low throughput",
          "Intake throttled or blocked",
          "External dependencies dominate",
        ],
        investigations: [
          "Are external constraints limiting delivery?",
          "Is demand muted or unclear?",
          "Are dependencies gating change?",
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
        description:
          "Short cycles with steady output; momentum is dominant.",
        levels: { cycle_time: "low", throughput: "high" },
        signals: [
          "Low cycle time with steady throughput",
          "Small batch sizes",
          "Minimal waiting between stages",
        ],
        investigations: [
          "Is flow stable across the window?",
          "Are releases gated by tooling or policies?",
          "Are any steps consistently waiting?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "batch-delivery",
        label: "Batch Delivery Zone",
        description:
          "Output remains high but cycles are long; batching or waiting may dominate.",
        levels: { cycle_time: "high", throughput: "high" },
        signals: [
          "High throughput with long cycles",
          "Batching work for release",
          "Waiting accumulates between stages",
        ],
        investigations: [
          "Is work spending more time waiting than executing?",
          "Are long cycles driven by release gates?",
          "Are dependencies extending cycle times?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "friction-dominant",
        label: "Friction-Dominant Zone",
        description:
          "Work stays in flight for long periods with limited output; pipeline friction dominates.",
        levels: { cycle_time: "high", throughput: "low" },
        signals: [
          "Long cycles with low throughput",
          "Queueing at handoffs",
          "Frequent rework",
        ],
        investigations: [
          "Are defects or unclear requirements elongating cycles?",
          "Is delivery speed constrained by tooling or process?",
          "Where is time spent waiting?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "quick-low-output",
        label: "Quick Cycles, Low Output Zone",
        description:
          "Cycles are short but output is limited; demand or intake may be light.",
        levels: { cycle_time: "low", throughput: "low" },
        signals: [
          "Short cycles with low throughput",
          "Small work items",
          "Low intake volume",
        ],
        investigations: [
          "Is demand or intake limiting output?",
          "Are work items too small to move throughput?",
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
        description:
          "Lean work in flight with steady output; direction appears focused.",
        levels: { wip: "low", throughput: "high" },
        signals: [
          "Low WIP with steady throughput",
          "Limited context switching",
          "Clear intake boundaries",
        ],
        investigations: [
          "Is focus sustained across the window?",
          "Is intake intentionally constrained?",
          "Are role boundaries stable?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "high-load-converting",
        label: "High Load, Converting Zone",
        description:
          "Many items in flight while output holds; coordination pressure may be rising.",
        levels: { wip: "high", throughput: "high" },
        signals: [
          "High WIP with steady throughput",
          "Parallel workstreams active",
          "Frequent handoffs",
        ],
        investigations: [
          "Is work starting faster than it finishes?",
          "Are owners clear as load rises?",
          "Is prototyping bleeding into execution?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "diffuse-effort",
        label: "Diffuse Effort Zone",
        description:
          "High in-flight work without output conversion; scope or ownership may be blurred.",
        levels: { wip: "high", throughput: "low" },
        signals: [
          "High WIP with low throughput",
          "Context switching across initiatives",
          "Prototype churn",
        ],
        investigations: [
          "Are people context-switching due to unclear scope?",
          "Is work starting faster than it finishes?",
          "Is prototyping bleeding into execution?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "limited-intake",
        label: "Limited Intake Zone",
        description:
          "Few items in flight and low output; demand or constraints may limit flow.",
        levels: { wip: "low", throughput: "low" },
        signals: [
          "Low WIP with low throughput",
          "Intake throttled or paused",
          "External dependencies gating",
        ],
        investigations: [
          "Is demand muted or unclear?",
          "Are external constraints limiting intake?",
          "Is scope awaiting definition?",
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
        description:
          "Review demand is light and turnaround is quick; collaboration flow is smooth.",
        levels: { review_load: "low", review_latency: "low" },
        signals: [
          "Low review load with fast completion",
          "Small change size",
          "Many reviewers available",
        ],
        investigations: [
          "Are review practices consistent across areas?",
          "Are changes sized for effective review?",
          "Is ownership distributed?",
        ],
        color: "rgba(34, 197, 94, 0.12)",
      },
      {
        id: "distributed-review",
        label: "Distributed Review Zone",
        description:
          "Review demand is high with quick turnaround; ownership appears spread.",
        levels: { review_load: "high", review_latency: "low" },
        signals: [
          "High load with low latency",
          "Parallel review pipelines",
          "Shared review responsibility",
        ],
        investigations: [
          "Is review load evenly distributed?",
          "Are changes scoped for fast review?",
          "Are SMEs scaling review support?",
        ],
        color: "rgba(59, 130, 246, 0.12)",
      },
      {
        id: "bottlenecked-review",
        label: "Bottlenecked Review Zone",
        description:
          "Review demand is high and turnaround is slow; ownership may be concentrated.",
        levels: { review_load: "high", review_latency: "high" },
        signals: [
          "High load with slow completion",
          "Queueing for key reviewers",
          "Large or complex changes",
        ],
        investigations: [
          "Is review load concentrated on a few people?",
          "Are changes sized for effective review?",
          "Is up-leveling or redistribution needed?",
        ],
        color: "rgba(244, 63, 94, 0.12)",
      },
      {
        id: "deferred-review",
        label: "Deferred Review Zone",
        description:
          "Review demand is light but turnaround is slow; attention may be split elsewhere.",
        levels: { review_load: "low", review_latency: "high" },
        signals: [
          "Low load with slow completion",
          "Reviews waiting on schedules",
          "Context switching across priorities",
        ],
        investigations: [
          "Are reviews blocked by other commitments?",
          "Are review expectations explicit?",
          "Is review time treated as shared work?",
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

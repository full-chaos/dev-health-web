import {
  sankeyExpenseLinks,
  sankeyExpenseNodes,
  sankeyHotspotLinks,
  sankeyHotspotNodes,
  sankeyInvestmentLinks,
  sankeyInvestmentNodes,
  sankeyStateTransitionSample,
} from "@/data/devHealthOpsSample";
import { toSankeyData } from "@/lib/chartTransforms";
import { encodeFilterParam } from "@/lib/filters/encode";
import { applyWindowToFilters } from "@/lib/filters/time";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyLink, SankeyMode, SankeyNode } from "@/lib/types";

export type SankeyDataset = {
  mode: SankeyMode;
  label: string;
  description: string;
  unit: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
};

export const SANKEY_MODES: Array<{
  id: SankeyMode;
  label: string;
  description: string;
  unit: string;
}> = [
  {
    id: "investment",
    label: "Investment flow",
    description:
      "Where effort allocates across initiatives, areas, issue types, and work items.",
    unit: "items",
  },
  {
    id: "expense",
    label: "Investment expense",
    description:
      "Effort that shifts from planned work into unplanned work, rework, and rewrites. Not a financial cost.",
    unit: "items",
  },
  {
    id: "state",
    label: "State flow",
    description:
      "Issue, PR, and deployment paths that reveal stalls, loops, and retries.",
    unit: "items",
  },
  {
    id: "hotspot",
    label: "Code hotspot flow",
    description:
      "Where change concentrates from repos to files and change intent.",
    unit: "changes",
  },
];

const DEFAULT_METRIC_BY_MODE: Record<SankeyMode, string> = {
  investment: "throughput",
  expense: "churn",
  state: "cycle_time",
  hotspot: "churn",
};

const DEFAULT_API_BY_MODE: Record<
  SankeyMode,
  "/api/v1/drilldown/issues" | "/api/v1/drilldown/prs"
> = {
  investment: "/api/v1/drilldown/issues",
  expense: "/api/v1/drilldown/issues",
  state: "/api/v1/drilldown/issues",
  hotspot: "/api/v1/drilldown/prs",
};

const dedupeNodes = (nodes: SankeyNode[]) => {
  const map = new Map<string, SankeyNode>();
  nodes.forEach((node) => {
    if (!map.has(node.name)) {
      map.set(node.name, node);
    }
  });
  return Array.from(map.values());
};


export const getSankeyDefinition = (mode: SankeyMode) =>
  SANKEY_MODES.find((entry) => entry.id === mode) ?? SANKEY_MODES[0];

export const buildSankeyDataset = (mode: SankeyMode): SankeyDataset => {
  const definition = getSankeyDefinition(mode);
  if (mode === "investment") {
    return {
      mode,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      nodes: dedupeNodes(sankeyInvestmentNodes),
      links: sankeyInvestmentLinks,
    };
  }
  if (mode === "expense") {
    return {
      mode,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      nodes: dedupeNodes(sankeyExpenseNodes),
      links: sankeyExpenseLinks,
    };
  }
  if (mode === "state") {
    const sankey = toSankeyData(sankeyStateTransitionSample);
    const nodes = sankey.nodes.map((node) => ({
      ...node,
      group: "state" as const,
    }));
    return {
      mode,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      nodes: dedupeNodes(nodes),
      links: sankey.links,
    };
  }
  return {
    mode: "hotspot",
    label: definition.label,
    description: definition.description,
    unit: definition.unit,
    nodes: dedupeNodes(sankeyHotspotNodes),
    links: sankeyHotspotLinks,
  };
};

const inferEvidenceApi = (mode: SankeyMode, label?: string) => {
  const lower = label?.toLowerCase() ?? "";
  if (lower.includes("pr")) {
    return "/api/v1/drilldown/prs";
  }
  if (lower.includes("issue")) {
    return "/api/v1/drilldown/issues";
  }
  return DEFAULT_API_BY_MODE[mode];
};

export const buildSankeyEvidenceUrl = (params: {
  mode: SankeyMode;
  filters: MetricFilter;
  label?: string | null;
  linkLabel?: string | null;
  window_start?: string;
  window_end?: string;
}) => {
  const metric = DEFAULT_METRIC_BY_MODE[params.mode];
  const api = inferEvidenceApi(params.mode, params.label ?? undefined);
  const withWindow = applyWindowToFilters(
    params.filters,
    params.window_start,
    params.window_end
  );
  const urlParams = new URLSearchParams();
  if (metric) {
    urlParams.set("metric", metric);
  }
  urlParams.set("api", api);
  urlParams.set("f", encodeFilterParam(withWindow));
  if (params.label) {
    urlParams.set("category", params.label);
  }
  if (params.linkLabel) {
    urlParams.set("breakdown", params.linkLabel);
  }
  return `/explore?${urlParams.toString()}`;
};

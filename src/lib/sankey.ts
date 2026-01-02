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
  /** Map of parent node name to collapsed children names (for hierarchy aggregation) */
  collapsedMap?: Map<string, string[]>;
  /** Original nodes before aggregation (for details panel) */
  originalNodes?: SankeyNode[];
  /** Original links before aggregation (for details panel) */
  originalLinks?: SankeyLink[];
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

/**
 * Compute the hierarchy level for each node based on link structure.
 * Level 1 = nodes with no incoming links (sources/roots)
 * Level 2 = direct targets of Level 1
 * Level N = direct targets of Level N-1
 */
export const computeNodeLevels = (
  nodes: SankeyNode[],
  links: SankeyLink[]
): Map<string, number> => {
  const levels = new Map<string, number>();
  const incomingEdges = new Map<string, Set<string>>();
  const outgoingEdges = new Map<string, Set<string>>();

  // Build adjacency maps
  for (const link of links) {
    if (!incomingEdges.has(link.target)) {
      incomingEdges.set(link.target, new Set());
    }
    incomingEdges.get(link.target)!.add(link.source);

    if (!outgoingEdges.has(link.source)) {
      outgoingEdges.set(link.source, new Set());
    }
    outgoingEdges.get(link.source)!.add(link.target);
  }

  // Find root nodes (no incoming edges)
  const roots: string[] = [];
  for (const node of nodes) {
    if (!incomingEdges.has(node.name) || incomingEdges.get(node.name)!.size === 0) {
      roots.push(node.name);
      levels.set(node.name, 1);
    }
  }

  // BFS to assign levels
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) ?? 1;
    const targets = outgoingEdges.get(current);
    if (targets) {
      for (const target of targets) {
        const existingLevel = levels.get(target);
        const newLevel = currentLevel + 1;
        // Take the maximum level if multiple paths lead to this node
        if (existingLevel === undefined || newLevel > existingLevel) {
          levels.set(target, newLevel);
          queue.push(target);
        }
      }
    }
  }

  return levels;
};

/**
 * Aggregate nodes beyond maxLevel into their level N parent.
 * Returns a new dataset with collapsed nodes and aggregated links.
 */
export const aggregateToMaxLevel = (
  nodes: SankeyNode[],
  links: SankeyLink[],
  maxLevel: number
): { nodes: SankeyNode[]; links: SankeyLink[]; collapsedMap: Map<string, string[]> } => {
  const levels = computeNodeLevels(nodes, links);
  const collapsedMap = new Map<string, string[]>(); // parent -> collapsed children

  // Build parent lookup: for nodes beyond maxLevel, find their level-maxLevel ancestor
  const parentLookup = new Map<string, string>(); // node -> ancestor at maxLevel

  // Build incoming edge map
  const incomingEdges = new Map<string, string[]>();
  for (const link of links) {
    if (!incomingEdges.has(link.target)) {
      incomingEdges.set(link.target, []);
    }
    incomingEdges.get(link.target)!.push(link.source);
  }

  // For each node beyond maxLevel, trace back to find its maxLevel ancestor
  const findAncestor = (nodeName: string, visited = new Set<string>()): string => {
    if (visited.has(nodeName)) return nodeName; // cycle protection
    visited.add(nodeName);

    const level = levels.get(nodeName) ?? 1;
    if (level <= maxLevel) {
      return nodeName;
    }
    // Find parent(s) and recurse
    const parents = incomingEdges.get(nodeName) ?? [];
    if (parents.length === 0) {
      return nodeName; // no parent found, keep as-is
    }
    // Use first parent (deterministic)
    return findAncestor(parents[0], visited);
  };

  // Build the mapping
  for (const node of nodes) {
    const level = levels.get(node.name) ?? 1;
    if (level > maxLevel) {
      const ancestor = findAncestor(node.name);
      parentLookup.set(node.name, ancestor);
      if (!collapsedMap.has(ancestor)) {
        collapsedMap.set(ancestor, []);
      }
      collapsedMap.get(ancestor)!.push(node.name);
    }
  }

  // Filter nodes to maxLevel, adding collapsedChildren info
  const newNodes: SankeyNode[] = nodes
    .filter((node) => (levels.get(node.name) ?? 1) <= maxLevel)
    .map((node) => ({
      ...node,
      level: levels.get(node.name) ?? 1,
      collapsedChildren: collapsedMap.get(node.name),
    }));

  // Aggregate links: remap source/target to their ancestor if collapsed
  const linkMap = new Map<string, number>(); // "source->target" -> aggregated value
  for (const link of links) {
    const source = parentLookup.get(link.source) ?? link.source;
    const target = parentLookup.get(link.target) ?? link.target;
    // Skip self-loops created by aggregation
    if (source === target) continue;
    // Skip links that would go to collapsed nodes
    const sourceLevel = levels.get(source) ?? 1;
    const targetLevel = levels.get(target) ?? 1;
    if (sourceLevel > maxLevel || targetLevel > maxLevel) continue;

    const key = `${source}->${target}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + link.value);
  }

  const newLinks: SankeyLink[] = Array.from(linkMap.entries()).map(([key, value]) => {
    const [source, target] = key.split("->") as [string, string];
    return { source, target, value };
  });

  return { nodes: newNodes, links: newLinks, collapsedMap };
};

/**
 * Get detailed information about a node, including collapsed children and their contributions.
 */
export const getNodeDetails = (
  nodeName: string,
  nodes: SankeyNode[],
  links: SankeyLink[],
  collapsedMap?: Map<string, string[]>
): {
  name: string;
  value: number;
  percentage: number;
  children: Array<{ name: string; value: number }>;
} => {
  // Calculate total flow
  const totalFlow = links.reduce((sum, link) => {
    // Only count links from root nodes to avoid double counting
    const hasIncoming = links.some((l) => l.target === link.source);
    return hasIncoming ? sum : sum + link.value;
  }, 0);

  // Get direct value from links
  const outgoingValue = links
    .filter((l) => l.source === nodeName)
    .reduce((sum, l) => sum + l.value, 0);
  const incomingValue = links
    .filter((l) => l.target === nodeName)
    .reduce((sum, l) => sum + l.value, 0);
  const value = Math.max(outgoingValue, incomingValue);

  // Get collapsed children with their values
  const collapsedChildren = collapsedMap?.get(nodeName) ?? [];
  const children: Array<{ name: string; value: number }> = [];

  for (const childName of collapsedChildren) {
    const childOutgoing = links
      .filter((l) => l.source === childName)
      .reduce((sum, l) => sum + l.value, 0);
    const childIncoming = links
      .filter((l) => l.target === childName)
      .reduce((sum, l) => sum + l.value, 0);
    children.push({
      name: childName,
      value: Math.max(childOutgoing, childIncoming),
    });
  }

  // Sort children by value descending
  children.sort((a, b) => b.value - a.value);

  return {
    name: nodeName,
    value,
    percentage: totalFlow > 0 ? (value / totalFlow) * 100 : 0,
    children,
  };
};


export const getSankeyDefinition = (mode: SankeyMode) =>
  SANKEY_MODES.find((entry) => entry.id === mode) ?? SANKEY_MODES[0];

/** Maximum hierarchy levels to show in the Investment Flow Sankey by default */
const INVESTMENT_MAX_LEVELS = 2;

export const buildSankeyDataset = (mode: SankeyMode): SankeyDataset => {
  const definition = getSankeyDefinition(mode);
  if (mode === "investment") {
    const originalNodes = dedupeNodes(sankeyInvestmentNodes);
    const originalLinks = sankeyInvestmentLinks;
    // Apply level aggregation for investment flow (max 2 levels)
    const { nodes, links, collapsedMap } = aggregateToMaxLevel(
      originalNodes,
      originalLinks,
      INVESTMENT_MAX_LEVELS
    );
    return {
      mode,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      nodes,
      links,
      collapsedMap,
      originalNodes,
      originalLinks,
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

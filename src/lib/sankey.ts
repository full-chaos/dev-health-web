import type { SankeyLink, SankeyMode, SankeyNode } from "@/lib/types";
import { toSankeyData } from "@/lib/chartTransforms";
import { encodeFilterParam } from "@/lib/filters/encode";
import { applyWindowToFilters } from "@/lib/filters/time";
import type { MetricFilter } from "@/lib/filters/types";
import type { FlowTransitionSummary } from "@/data/devHealthOpsTypes";

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
    description: "Where effort allocates across initiatives, areas, issue types, and work items.",
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
    description: "Issue, PR, and deployment paths that reveal stalls, loops, and retries.",
    unit: "items",
  },
  {
    id: "hotspot",
    label: "Code hotspot flow",
    description: "Where change concentrates from repos to files and change intent.",
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

// ---------------------------------------------------------------------------
// Demo-data registry — populated at runtime via registerSankeyDemoData().
// Production bundles never import devHealthOpsSample; the store stays empty.
// ---------------------------------------------------------------------------
type SankeyDemoStore = {
  investmentNodes: SankeyNode[];
  investmentLinks: SankeyLink[];
  expenseNodes: SankeyNode[];
  expenseLinks: SankeyLink[];
  hotspotNodes: SankeyNode[];
  hotspotLinks: SankeyLink[];
  stateTransitions: FlowTransitionSummary[];
};

const _demoStore: SankeyDemoStore = {
  investmentNodes: [],
  investmentLinks: [],
  expenseNodes: [],
  expenseLinks: [],
  hotspotNodes: [],
  hotspotLinks: [],
  stateTransitions: [],
};

/**
 * Register sample data for demo / test mode.
 * Call this before using buildSankeyDataset in non-production contexts.
 * In production this function is never called, so the store stays empty.
 */
export const registerSankeyDemoData = (data: {
  investmentNodes: SankeyNode[];
  investmentLinks: SankeyLink[];
  expenseNodes: SankeyNode[];
  expenseLinks: SankeyLink[];
  hotspotNodes: SankeyNode[];
  hotspotLinks: SankeyLink[];
  stateTransitions: FlowTransitionSummary[];
}): void => {
  _demoStore.investmentNodes = data.investmentNodes;
  _demoStore.investmentLinks = data.investmentLinks;
  _demoStore.expenseNodes = data.expenseNodes;
  _demoStore.expenseLinks = data.expenseLinks;
  _demoStore.hotspotNodes = data.hotspotNodes;
  _demoStore.hotspotLinks = data.hotspotLinks;
  _demoStore.stateTransitions = data.stateTransitions;
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
      nodes: dedupeNodes(_demoStore.investmentNodes),
      links: _demoStore.investmentLinks,
    };
  }
  if (mode === "expense") {
    return {
      mode,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      nodes: dedupeNodes(_demoStore.expenseNodes),
      links: _demoStore.expenseLinks,
    };
  }
  if (mode === "state") {
    const sankey = toSankeyData(_demoStore.stateTransitions);
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
    nodes: dedupeNodes(_demoStore.hotspotNodes),
    links: _demoStore.hotspotLinks,
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
  const withWindow = applyWindowToFilters(params.filters, params.window_start, params.window_end);
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

// ============================================================================
// Sankey computation utilities (extracted from InvestmentView.tsx)
// ============================================================================

/**
 * Compute Sankey metrics: incoming/outgoing totals per node and total flow.
 */
export const computeSankeyMetrics = (nodes: SankeyNode[], links: SankeyLink[]) => {
  const incomingTotals = new Map<string, number>();
  const outgoingTotals = new Map<string, number>();
  const nodeValueByName = new Map<string, number>();

  links.forEach((link) => {
    outgoingTotals.set(link.source, (outgoingTotals.get(link.source) ?? 0) + link.value);
    incomingTotals.set(link.target, (incomingTotals.get(link.target) ?? 0) + link.value);
  });

  nodes.forEach((node) => {
    const incoming = incomingTotals.get(node.name) ?? 0;
    const outgoing = outgoingTotals.get(node.name) ?? 0;
    nodeValueByName.set(node.name, Math.max(incoming, outgoing));
  });

  const rootTotal = nodes.reduce((total, node) => {
    const incoming = incomingTotals.get(node.name) ?? 0;
    if (incoming === 0) {
      return total + (outgoingTotals.get(node.name) ?? 0);
    }
    return total;
  }, 0);

  const totalFlow =
    rootTotal > 0 ? rootTotal : links.reduce((total, link) => total + link.value, 0);

  return { incomingTotals, outgoingTotals, nodeValueByName, totalFlow };
};

/**
 * Limit repo nodes to top N, aggregating the rest into "Other repos".
 */
export const limitRepoNodes = <T extends { nodes: SankeyNode[]; links: SankeyLink[] }>(
  flow: T,
  topN: number,
  otherReposLabel = "Other repos",
): T => {
  const { nodes, links } = flow;
  const repoNodes = nodes.filter((node) => node.group === "repo");
  if (repoNodes.length <= topN) {
    return flow;
  }

  const groupByName = new Map(nodes.map((node) => [node.name, node.group]));
  const repoTotals = new Map<string, number>();
  links.forEach((link) => {
    if (groupByName.get(link.target) !== "repo") {
      return;
    }
    const sourceGroup = groupByName.get(link.source);
    if (sourceGroup !== "category" && sourceGroup !== "subcategory") {
      return;
    }
    repoTotals.set(link.target, (repoTotals.get(link.target) ?? 0) + link.value);
  });

  const orderedRepos = repoNodes
    .map((node) => node.name)
    .sort((a, b) => {
      const aValue = repoTotals.get(a) ?? 0;
      const bValue = repoTotals.get(b) ?? 0;
      if (bValue !== aValue) {
        return bValue - aValue;
      }
      return a.localeCompare(b);
    });
  const topRepos = orderedRepos.slice(0, topN);
  const keepRepos = new Set(topRepos);
  const hasOther = repoNodes.length > topN;

  const linkTotals = new Map<string, number>();
  const OTHER_REPO_KEY = `repo:${otherReposLabel}`;

  links.forEach((link) => {
    let source = link.source;
    let target = link.target;
    if (groupByName.get(target) === "repo" && !keepRepos.has(target)) {
      target = OTHER_REPO_KEY;
    }
    if (groupByName.get(source) === "repo" && !keepRepos.has(source)) {
      source = OTHER_REPO_KEY;
    }
    const key = `${source}|||${target}`;
    linkTotals.set(key, (linkTotals.get(key) ?? 0) + link.value);
  });

  const repoNodeByName = new Map(repoNodes.map((node) => [node.name, node]));
  const nonRepoNodes = nodes.filter((node) => node.group !== "repo");
  const orderedRepoNodes = topRepos
    .map((name) => repoNodeByName.get(name))
    .filter((node): node is SankeyNode => Boolean(node));

  if (hasOther) {
    if (!keepRepos.has(OTHER_REPO_KEY)) {
      const existing = repoNodeByName.get(OTHER_REPO_KEY);
      if (existing) {
        orderedRepoNodes.push(existing);
      } else {
        orderedRepoNodes.push({ name: OTHER_REPO_KEY, group: "repo" });
      }
    }
  }

  // Deduplicate all nodes by name to prevent "duplicate name or id" errors
  const allFinalNodes = [...nonRepoNodes, ...orderedRepoNodes];
  const uniqueNodeMap = new Map<string, SankeyNode>();
  allFinalNodes.forEach((node) => uniqueNodeMap.set(node.name, node));
  const limitedNodes = Array.from(uniqueNodeMap.values());

  const nodeNames = new Set(limitedNodes.map((node) => node.name));
  const limitedLinks = Array.from(linkTotals, ([key, value]) => {
    const [source, target] = key.split("|||");
    return { source, target, value };
  }).filter((link) => nodeNames.has(link.source) && nodeNames.has(link.target));

  return { ...flow, nodes: limitedNodes, links: limitedLinks };
};

export type SankeyResponseWithTeamAssociations = {
  mode: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
  hasTeamAssociations: boolean;
};

/**
 * Filter a Sankey diagram to show only nodes connected to a specific team.
 */
export const filterSankeyToTeam = <T extends { nodes: SankeyNode[]; links: SankeyLink[] }>(
  flow: T | null,
  teamName: string | null,
): T | null => {
  if (!flow || !teamName) {
    return flow;
  }
  // Find the team node - check both with and without prefix for compatibility
  const teamNode = flow.nodes.find(
    (node) => node.group === "team" && (node.name === teamName || node.name === `team:${teamName}`),
  );
  if (!teamNode) {
    return flow;
  }
  const teamNodeName = teamNode.name;
  const adjacency = new Map<string, string[]>();
  flow.links.forEach((link) => {
    const targets = adjacency.get(link.source) ?? [];
    targets.push(link.target);
    adjacency.set(link.source, targets);
  });
  const allowed = new Set<string>([teamNodeName]);
  const queue = [teamNodeName];
  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const targets = adjacency.get(current) ?? [];
    targets.forEach((target) => {
      if (!allowed.has(target)) {
        allowed.add(target);
        queue.push(target);
      }
    });
  }
  return {
    ...flow,
    nodes: flow.nodes.filter((node) => allowed.has(node.name)),
    links: flow.links.filter((link) => allowed.has(link.source) && allowed.has(link.target)),
  };
};

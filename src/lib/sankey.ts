import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { toSankeyData } from "@/lib/chartTransforms";
import { workItemStatusTransitionSample } from "@/data/devHealthOpsSample";
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
      "How planned effort converts into unplanned work, rework, and rewrites.",
    unit: "items",
  },
  {
    id: "state",
    label: "State flow",
    description:
      "Execution paths that reveal stalls, loops, and retry patterns.",
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

const toRangeDays = (start?: string, end?: string) => {
  if (!start || !end) {
    return null;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
};

const applyWindowToFilters = (
  filters: MetricFilter,
  windowStart?: string,
  windowEnd?: string
): MetricFilter => {
  if (!windowStart && !windowEnd) {
    return filters;
  }
  const rangeDays = toRangeDays(windowStart, windowEnd);
  return {
    ...filters,
    time: {
      ...filters.time,
      start_date: windowStart ?? filters.time.start_date,
      end_date: windowEnd ?? filters.time.end_date,
      range_days: rangeDays ?? filters.time.range_days,
    },
  };
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

const investmentNodes: SankeyNode[] = [
  { name: "Platform modernization", group: "initiative" },
  { name: "Growth experiments", group: "initiative" },
  { name: "Reliability hardening", group: "initiative" },
  { name: "Auth refresh", group: "project" },
  { name: "Billing revamp", group: "project" },
  { name: "Onboarding revamp", group: "project" },
  { name: "Search relevance", group: "project" },
  { name: "Incident automation", group: "project" },
  { name: "Observability uplift", group: "project" },
  { name: "Feature", group: "issue_type" },
  { name: "Bug", group: "issue_type" },
  { name: "Chore", group: "issue_type" },
  { name: "Task", group: "issue_type" },
  { name: "Incident", group: "issue_type" },
  { name: "Feature issues", group: "work_item" },
  { name: "Feature PRs", group: "work_item" },
  { name: "Bug issues", group: "work_item" },
  { name: "Bug PRs", group: "work_item" },
  { name: "Chore issues", group: "work_item" },
  { name: "Chore PRs", group: "work_item" },
  { name: "Task issues", group: "work_item" },
  { name: "Task PRs", group: "work_item" },
  { name: "Incident issues", group: "work_item" },
  { name: "Incident PRs", group: "work_item" },
];

const investmentLinks: SankeyLink[] = [
  { source: "Platform modernization", target: "Auth refresh", value: 30 },
  { source: "Platform modernization", target: "Billing revamp", value: 20 },
  { source: "Growth experiments", target: "Onboarding revamp", value: 28 },
  { source: "Growth experiments", target: "Search relevance", value: 12 },
  { source: "Reliability hardening", target: "Incident automation", value: 18 },
  { source: "Reliability hardening", target: "Observability uplift", value: 22 },
  { source: "Auth refresh", target: "Feature", value: 18 },
  { source: "Auth refresh", target: "Bug", value: 12 },
  { source: "Billing revamp", target: "Feature", value: 12 },
  { source: "Billing revamp", target: "Chore", value: 8 },
  { source: "Onboarding revamp", target: "Feature", value: 20 },
  { source: "Onboarding revamp", target: "Task", value: 8 },
  { source: "Search relevance", target: "Feature", value: 7 },
  { source: "Search relevance", target: "Bug", value: 5 },
  { source: "Incident automation", target: "Incident", value: 10 },
  { source: "Incident automation", target: "Task", value: 8 },
  { source: "Observability uplift", target: "Chore", value: 12 },
  { source: "Observability uplift", target: "Bug", value: 10 },
  { source: "Feature", target: "Feature issues", value: 22 },
  { source: "Feature", target: "Feature PRs", value: 35 },
  { source: "Bug", target: "Bug issues", value: 10 },
  { source: "Bug", target: "Bug PRs", value: 17 },
  { source: "Chore", target: "Chore issues", value: 6 },
  { source: "Chore", target: "Chore PRs", value: 14 },
  { source: "Task", target: "Task issues", value: 8 },
  { source: "Task", target: "Task PRs", value: 8 },
  { source: "Incident", target: "Incident issues", value: 4 },
  { source: "Incident", target: "Incident PRs", value: 6 },
];

const expenseNodes: SankeyNode[] = [
  { name: "Planned work", group: "planned" },
  { name: "Unplanned work", group: "unplanned" },
  { name: "Rework", group: "rework" },
  { name: "Abandonment / rewrite", group: "abandonment" },
];

const expenseLinks: SankeyLink[] = [
  { source: "Planned work", target: "Unplanned work", value: 42 },
  { source: "Unplanned work", target: "Rework", value: 19 },
  { source: "Rework", target: "Abandonment / rewrite", value: 7 },
];

const hotspotNodes: SankeyNode[] = [
  { name: "web-app", group: "repo" },
  { name: "core-api", group: "repo" },
  { name: "auth", group: "module" },
  { name: "search", group: "module" },
  { name: "billing", group: "module" },
  { name: "infra", group: "module" },
  { name: "src/auth", group: "directory" },
  { name: "src/search", group: "directory" },
  { name: "src/billing", group: "directory" },
  { name: "infra/pipeline", group: "directory" },
  { name: "token.ts", group: "file" },
  { name: "session.ts", group: "file" },
  { name: "ranking.ts", group: "file" },
  { name: "query.ts", group: "file" },
  { name: "billing.ts", group: "file" },
  { name: "invoice.ts", group: "file" },
  { name: "deploy.yml", group: "file" },
  { name: "rollback.yml", group: "file" },
  { name: "feature", group: "change_type" },
  { name: "fix", group: "change_type" },
  { name: "refactor", group: "change_type" },
];

const hotspotLinks: SankeyLink[] = [
  { source: "web-app", target: "auth", value: 18 },
  { source: "web-app", target: "search", value: 12 },
  { source: "core-api", target: "billing", value: 16 },
  { source: "core-api", target: "infra", value: 10 },
  { source: "auth", target: "src/auth", value: 18 },
  { source: "search", target: "src/search", value: 12 },
  { source: "billing", target: "src/billing", value: 16 },
  { source: "infra", target: "infra/pipeline", value: 10 },
  { source: "src/auth", target: "token.ts", value: 10 },
  { source: "src/auth", target: "session.ts", value: 8 },
  { source: "src/search", target: "ranking.ts", value: 7 },
  { source: "src/search", target: "query.ts", value: 5 },
  { source: "src/billing", target: "billing.ts", value: 10 },
  { source: "src/billing", target: "invoice.ts", value: 6 },
  { source: "infra/pipeline", target: "deploy.yml", value: 6 },
  { source: "infra/pipeline", target: "rollback.yml", value: 4 },
  { source: "token.ts", target: "feature", value: 6 },
  { source: "token.ts", target: "fix", value: 3 },
  { source: "token.ts", target: "refactor", value: 1 },
  { source: "session.ts", target: "feature", value: 3 },
  { source: "session.ts", target: "fix", value: 3 },
  { source: "session.ts", target: "refactor", value: 2 },
  { source: "ranking.ts", target: "feature", value: 4 },
  { source: "ranking.ts", target: "fix", value: 2 },
  { source: "ranking.ts", target: "refactor", value: 1 },
  { source: "query.ts", target: "feature", value: 2 },
  { source: "query.ts", target: "fix", value: 2 },
  { source: "query.ts", target: "refactor", value: 1 },
  { source: "billing.ts", target: "feature", value: 4 },
  { source: "billing.ts", target: "fix", value: 4 },
  { source: "billing.ts", target: "refactor", value: 2 },
  { source: "invoice.ts", target: "feature", value: 2 },
  { source: "invoice.ts", target: "fix", value: 3 },
  { source: "invoice.ts", target: "refactor", value: 1 },
  { source: "deploy.yml", target: "feature", value: 2 },
  { source: "deploy.yml", target: "fix", value: 2 },
  { source: "deploy.yml", target: "refactor", value: 2 },
  { source: "rollback.yml", target: "fix", value: 3 },
  { source: "rollback.yml", target: "refactor", value: 1 },
];

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
      nodes: dedupeNodes(investmentNodes),
      links: investmentLinks,
    };
  }
  if (mode === "expense") {
    return {
      mode,
      label: definition.label,
      description: definition.description,
      unit: definition.unit,
      nodes: dedupeNodes(expenseNodes),
      links: expenseLinks,
    };
  }
  if (mode === "state") {
    const sankey = toSankeyData(workItemStatusTransitionSample);
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
    nodes: dedupeNodes(hotspotNodes),
    links: hotspotLinks,
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

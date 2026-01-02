import type {
  FlowTransitionSummary,
  WorkItemFlowEfficiencyDaily,
  WorkItemMetricsDaily,
  WorkItemTypeByScope,
  WorkItemTypeSummary,
} from "@/data/devHealthOpsTypes";

export type PieSegment = {
  name: string;
  value: number;
};

export type NestedPieCategory = {
  name: string;
  value: number;
  key: string;
};

export type NestedPieSubtype = {
  name: string;
  value: number;
  parentKey: string;
};

type SparklineMetric = keyof Pick<
  WorkItemMetricsDaily,
  | "itemsStarted"
  | "itemsCompleted"
  | "wipCountEndOfDay"
  | "bugCompletedRatio"
  | "predictabilityScore"
>;

const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeKey = (value: string) => value.trim().toLowerCase();

const sumByKey = (items: Array<{ key: string; value: number }>) => {
  const totals = new Map<string, number>();
  items.forEach(({ key, value }) => {
    totals.set(key, (totals.get(key) ?? 0) + value);
  });
  return totals;
};

export const toThroughputBarSeries = (
  data: WorkItemMetricsDaily[],
  options: { scopeOrder?: string[] } = {}
) => {
  const plannedTotals = sumByKey(
    data.map((entry) => ({
      key: normalizeKey(entry.workScopeId),
      value: entry.itemsStarted,
    }))
  );
  const actualTotals = sumByKey(
    data.map((entry) => ({
      key: normalizeKey(entry.workScopeId),
      value: entry.itemsCompleted,
    }))
  );
  const keys = Array.from(
    new Set([...plannedTotals.keys(), ...actualTotals.keys()])
  );
  const normalizedScopeOrder = options.scopeOrder?.map((key) => normalizeKey(key));
  const orderedKeys = options.scopeOrder
    ? [
      ...(normalizedScopeOrder ?? []).filter((key) => keys.includes(key)),
      ...keys.filter((key) => !normalizedScopeOrder?.includes(key)),
    ]
    : keys;

  return {
    categories: orderedKeys.map((key) => titleCase(key)),
    planned: orderedKeys.map((key) => plannedTotals.get(key) ?? 0),
    actual: orderedKeys.map((key) => actualTotals.get(key) ?? 0),
  };
};

export const toTeamEfficiencyBarSeries = (
  data: WorkItemFlowEfficiencyDaily[],
  options: { percent?: boolean } = { percent: true }
) => {
  const totals = new Map<string, { sum: number; count: number; label: string }>();

  data.forEach((entry) => {
    const key = normalizeKey(entry.teamName ?? entry.teamId);
    const label = entry.teamName ? entry.teamName : titleCase(entry.teamId);
    const current = totals.get(key) ?? { sum: 0, count: 0, label };
    totals.set(key, {
      sum: current.sum + entry.flowEfficiency,
      count: current.count + 1,
      label,
    });
  });

  const rows = Array.from(totals.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    value: value.sum / Math.max(1, value.count),
  }));

  return {
    categories: rows.map((row) => row.label),
    values: rows.map((row) =>
      options.percent ? Math.round(row.value * 100) : row.value
    ),
  };
};

export const toSparklineSeries = (
  data: WorkItemMetricsDaily[],
  options: { workScopeId?: string; teamId?: string; metric?: SparklineMetric } = {}
) => {
  const metric = options.metric ?? "itemsCompleted";
  const filtered = data.filter((entry) => {
    if (
      options.workScopeId &&
      normalizeKey(entry.workScopeId) !== normalizeKey(options.workScopeId)
    ) {
      return false;
    }
    if (
      options.teamId &&
      normalizeKey(entry.teamId) !== normalizeKey(options.teamId)
    ) {
      return false;
    }
    return true;
  });

  const byDay = new Map<string, { sum: number; count: number }>();
  filtered.forEach((entry) => {
    const current = byDay.get(entry.day) ?? { sum: 0, count: 0 };
    const value = entry[metric];
    byDay.set(entry.day, { sum: current.sum + value, count: current.count + 1 });
  });

  const ratioMetrics: SparklineMetric[] = [
    "bugCompletedRatio",
    "predictabilityScore",
  ];
  const categories = Array.from(byDay.keys()).sort();
  const values = categories.map((day) => {
    const entry = byDay.get(day);
    if (!entry) {
      return 0;
    }
    if (ratioMetrics.includes(metric)) {
      return entry.sum / Math.max(1, entry.count);
    }
    return entry.sum;
  });

  return { categories, values };
};

export const toWorkItemTypeDonutData = (
  data: WorkItemTypeSummary[]
): PieSegment[] => {
  const totals = sumByKey(
    data.map((entry) => ({
      key: normalizeKey(entry.type),
      value: entry.count,
    }))
  );

  return Array.from(totals.entries()).map(([key, value]) => ({
    name: titleCase(key),
    value,
  }));
};

export const toNestedPieData = (data: WorkItemTypeByScope[]) => {
  const scopeTotals = new Map<string, { value: number; name: string }>();
  const subtypeTotals = new Map<
    string,
    { value: number; name: string; parentKey: string }
  >();

  data.forEach((entry) => {
    const scopeKey = normalizeKey(entry.workScopeId);
    const scopeName = titleCase(entry.workScopeId);
    const typeKey = normalizeKey(entry.type);
    const typeName = titleCase(entry.type);
    const scopeEntry = scopeTotals.get(scopeKey) ?? { value: 0, name: scopeName };
    scopeTotals.set(scopeKey, {
      value: scopeEntry.value + entry.count,
      name: scopeName,
    });

    const subtypeKey = `${scopeKey}:${typeKey}`;
    const subtypeEntry = subtypeTotals.get(subtypeKey) ?? {
      value: 0,
      name: typeName,
      parentKey: scopeKey,
    };
    subtypeTotals.set(subtypeKey, {
      value: subtypeEntry.value + entry.count,
      name: typeName,
      parentKey: scopeKey,
    });
  });

  const categories: NestedPieCategory[] = Array.from(scopeTotals.entries()).map(
    ([key, value]) => ({
      key,
      name: value.name,
      value: value.value,
    })
  );

  const subtypes: NestedPieSubtype[] = Array.from(subtypeTotals.values()).map(
    (entry) => ({
      name: entry.name,
      value: entry.value,
      parentKey: entry.parentKey,
    })
  );

  return { categories, subtypes };
};

export const toSankeyData = (data: FlowTransitionSummary[]) => {
  const linkTotals = new Map<string, number>();
  data.forEach((entry) => {
    const source = titleCase(entry.fromStatus);
    const target = titleCase(entry.toStatus);
    const key = `${source}->${target}`;
    linkTotals.set(key, (linkTotals.get(key) ?? 0) + entry.count);
  });

  const links = Array.from(linkTotals.entries()).map(([key, value]) => {
    const [source, target] = key.split("->");
    return { source, target, value };
  });

  const nodeNames = new Set<string>();
  links.forEach((link) => {
    nodeNames.add(link.source);
    nodeNames.add(link.target);
  });

  return {
    nodes: Array.from(nodeNames).map((name) => ({ name })),
    links,
  };
};

// --- Treemap / Sunburst data transformations ---

export type HierarchyNode = {
  name: string;
  value: number;
  children?: HierarchyNode[];
};

/**
 * Convert Investment data (categories + subtypes) into a hierarchical tree
 * for Treemap and Sunburst visualizations.
 */
export const toInvestmentHierarchy = (
  categories: Array<{ key: string; name: string; value: number }>,
  subtypes: Array<{ name: string; value: number; parentKey: string }>
): HierarchyNode => {
  const children: HierarchyNode[] = categories
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((category) => {
      const catSubtypes = subtypes
        .filter((s) => s.parentKey === category.key)
        .sort((a, b) => b.value - a.value);

      return {
        name: category.name,
        value: category.value,
        children: catSubtypes.length
          ? catSubtypes.map((s) => ({ name: s.name, value: s.value }))
          : undefined,
      };
    });

  const totalValue = children.reduce((sum, c) => sum + c.value, 0);

  return {
    name: "All",
    value: totalValue,
    children,
  };
};

/**
 * Convert Sankey hotspot data into a hierarchical tree for Treemap/Sunburst.
 * Builds: repo → directory → file hierarchy.
 */
export const toHotspotHierarchy = (
  nodes: Array<{ name: string; group?: string }>,
  links: Array<{ source: string; target: string; value: number }>
): HierarchyNode => {
  // Group nodes by their group type
  const nodesByName = new Map(nodes.map((n) => [n.name, n]));

  // Build adjacency list: source -> targets with values
  const adjacency = new Map<string, Array<{ target: string; value: number }>>();
  links.forEach((link) => {
    const targets = adjacency.get(link.source) ?? [];
    targets.push({ target: link.target, value: link.value });
    adjacency.set(link.source, targets);
  });

  // Find root nodes (nodes that appear as source but not as any target)
  const allTargets = new Set(links.map((l) => l.target));
  const rootNodeNames = nodes
    .filter((n) => !allTargets.has(n.name) && adjacency.has(n.name))
    .map((n) => n.name);

  // Recursive function to build tree
  const buildTree = (nodeName: string, visited = new Set<string>()): HierarchyNode => {
    if (visited.has(nodeName)) {
      return { name: nodeName, value: 0 };
    }
    visited.add(nodeName);

    const children = adjacency.get(nodeName);
    if (!children || children.length === 0) {
      // Leaf node - get value from incoming links
      const incomingValue = links
        .filter((l) => l.target === nodeName)
        .reduce((sum, l) => sum + l.value, 0);
      return { name: nodeName, value: incomingValue || 1 };
    }

    const childNodes = children
      .map((c) => buildTree(c.target, new Set(visited)))
      .sort((a, b) => b.value - a.value);

    const totalValue = childNodes.reduce((sum, c) => sum + c.value, 0);

    return {
      name: nodeName,
      value: totalValue,
      children: childNodes,
    };
  };

  const rootChildren = rootNodeNames
    .map((name) => buildTree(name))
    .sort((a, b) => b.value - a.value);

  const totalValue = rootChildren.reduce((sum, c) => sum + c.value, 0);

  return {
    name: "All",
    value: totalValue,
    children: rootChildren,
  };
};

/**
 * Convert FlowTransitionSummary data into transition matrix format for heatmap.
 */
export const toTransitionMatrix = (
  data: FlowTransitionSummary[]
): Array<{ fromStatus: string; toStatus: string; count: number }> => {
  const totals = new Map<string, number>();
  data.forEach((entry) => {
    const key = `${entry.fromStatus}|${entry.toStatus}`;
    totals.set(key, (totals.get(key) ?? 0) + entry.count);
  });

  return Array.from(totals.entries()).map(([key, count]) => {
    const [fromStatus, toStatus] = key.split("|");
    return { fromStatus, toStatus, count };
  });
};

// --- Stacked Area data transformations ---

export type ExpenseTimePoint = {
  date: string;
  planned: number;
  unplanned: number;
  rework: number;
  abandonment: number;
};

/**
 * Generate sample expense data over time for demonstration.
 * In production, this would come from the API.
 */
export const generateSampleExpenseData = (days: number = 30): ExpenseTimePoint[] => {
  const data: ExpenseTimePoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    // Generate somewhat realistic expense distribution
    const baseValue = 50 + Math.random() * 30;
    const variance = () => Math.random() * 0.3 - 0.15;

    data.push({
      date: dateStr,
      planned: Math.round(baseValue * (0.5 + variance())),
      unplanned: Math.round(baseValue * (0.25 + variance())),
      rework: Math.round(baseValue * (0.15 + variance())),
      abandonment: Math.round(baseValue * (0.1 + variance())),
    });
  }

  return data;
};

/**
 * Convert expense data to stacked area format.
 */
export const toStackedAreaData = (data: ExpenseTimePoint[]) => {
  return {
    data: data.map((d) => ({
      date: d.date,
      values: {
        Planned: d.planned,
        Unplanned: d.unplanned,
        Rework: d.rework,
        Abandonment: d.abandonment,
      },
    })),
    series: [
      { name: "Planned", color: "#3b82f6" },
      { name: "Unplanned", color: "#a855f7" },
      { name: "Rework", color: "#f97316" },
      { name: "Abandonment", color: "#ef4444" },
    ],
  };
};


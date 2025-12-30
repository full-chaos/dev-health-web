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

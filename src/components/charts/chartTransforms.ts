import type {
  WorkItemFlowEfficiencyDaily,
  WorkItemMetricsDaily,
  WorkItemStatusTransitionSummary,
  WorkItemTypeByScope,
  WorkItemTypeSummary,
} from "@/data/devHealthOpsTypes";
import {
  translateStatusCategory,
  translateTeamLabel,
  translateWorkItemType,
  translateWorkScopeId,
} from "@/data/devHealthOpsTranslations";

type SeriesPoint = {
  name: string;
  value: number;
};

export const toThroughputBarSeries = (
  rows: WorkItemMetricsDaily[],
  options?: {
    provider?: WorkItemMetricsDaily["provider"];
    teamId?: string;
    scopeOrder?: string[];
  }
) => {
  const grouped = new Map<string, { started: number; completed: number }>();
  for (const row of rows) {
    if (options?.provider && row.provider !== options.provider) {
      continue;
    }
    if (options?.teamId && row.teamId !== options.teamId) {
      continue;
    }
    const key = row.workScopeId;
    const existing = grouped.get(key) ?? { started: 0, completed: 0 };
    existing.started += row.itemsStarted;
    existing.completed += row.itemsCompleted;
    grouped.set(key, existing);
  }

  const orderedScopes =
    options?.scopeOrder?.length ? options.scopeOrder : Array.from(grouped.keys());

  const categories: string[] = [];
  const planned: number[] = [];
  const actual: number[] = [];

  for (const scope of orderedScopes) {
    const totals = grouped.get(scope);
    if (!totals) {
      continue;
    }
    categories.push(translateWorkScopeId(scope));
    planned.push(totals.started);
    actual.push(totals.completed);
  }

  return { categories, planned, actual };
};

export const toSparklineSeries = (
  rows: WorkItemMetricsDaily[],
  options?: {
    provider?: WorkItemMetricsDaily["provider"];
    teamId?: string;
    workScopeId?: string;
  }
) => {
  const filtered = rows.filter((row) => {
    if (options?.provider && row.provider !== options.provider) {
      return false;
    }
    if (options?.teamId && row.teamId !== options.teamId) {
      return false;
    }
    if (options?.workScopeId && row.workScopeId !== options.workScopeId) {
      return false;
    }
    return true;
  });

  const byDay = new Map<string, number>();
  for (const row of filtered) {
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.itemsCompleted);
  }

  const days = Array.from(byDay.keys()).sort();
  return {
    categories: days.map((day) => day.slice(5)),
    values: days.map((day) => byDay.get(day) ?? 0),
  };
};

export const toTeamEfficiencyBarSeries = (
  rows: WorkItemFlowEfficiencyDaily[],
  options?: { provider?: WorkItemFlowEfficiencyDaily["provider"] }
) => {
  const grouped = new Map<
    string,
    { teamName?: string; total: number; count: number }
  >();

  for (const row of rows) {
    if (options?.provider && row.provider !== options.provider) {
      continue;
    }
    const existing = grouped.get(row.teamId) ?? {
      teamName: row.teamName,
      total: 0,
      count: 0,
    };
    existing.total += row.flowEfficiency;
    existing.count += 1;
    existing.teamName = existing.teamName ?? row.teamName;
    grouped.set(row.teamId, existing);
  }

  const entries = Array.from(grouped.entries()).map(([teamId, data]) => ({
    teamId,
    teamName: translateTeamLabel(data.teamName, teamId),
    efficiency: data.count ? data.total / data.count : 0,
  }));

  entries.sort((a, b) => b.efficiency - a.efficiency);

  return {
    categories: entries.map((entry) => entry.teamName),
    values: entries.map((entry) => Math.round(entry.efficiency * 100)),
  };
};

export const toWorkItemTypeDonutData = (rows: WorkItemTypeSummary[]) => {
  return rows.map<SeriesPoint>((row) => ({
    name: translateWorkItemType(row.type),
    value: row.count,
  }));
};

export const toNestedPieData = (rows: WorkItemTypeByScope[]) => {
  const categoryMap = new Map<string, number>();
  const subtypes: Array<{ name: string; value: number; parentKey: string }> = [];

  for (const row of rows) {
    const categoryKey = row.workScopeId;
    categoryMap.set(categoryKey, (categoryMap.get(categoryKey) ?? 0) + row.count);
    subtypes.push({
      name: translateWorkItemType(row.type),
      value: row.count,
      parentKey: categoryKey,
    });
  }

  const categories = Array.from(categoryMap.entries()).map(([key, value]) => ({
    key,
    name: translateWorkScopeId(key),
    value,
  }));

  return { categories, subtypes };
};

export const toSankeyData = (rows: WorkItemStatusTransitionSummary[]) => {
  const nodeKeys = new Set<string>();
  const links = rows
    .filter((row) => row.count > 0)
    .map((row) => {
      const source = translateStatusCategory(row.fromStatus);
      const target = translateStatusCategory(row.toStatus);
      nodeKeys.add(source);
      nodeKeys.add(target);
      return { source, target, value: row.count };
    });

  const nodes = Array.from(nodeKeys).map((name) => ({ name }));

  return { nodes, links };
};

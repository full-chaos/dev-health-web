import { useCallback, useMemo, useState } from "react";
import { ChartTypeToggle, TREEMAP_SUNBURST_OPTIONS, type TreemapSunburstType } from "@/components/charts/ChartTypeToggle";
import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { TreemapChart, type TreemapNode } from "@/components/charts/TreemapChart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";
import { formatNumber } from "@/lib/formatters";
import {
  adjustHex,
  buildOptionalTimeRangeLabel,
  buildRepoTeamSankey,
  clamp,
  formatEffortUnit,
  formatQuality,
  formatSubcategoryLabel,
  isUnassignedLabel,
  normalizeThemeKey,
  normalizeUnassignedLabel,
  stripSankeyPrefix,
  titleCase,
  TOP_N_REPOS,
  UNASSIGNED_REPO_LABEL,
  UNASSIGNED_TEAM_LABEL,
} from "@/lib/investment";
import { getSortedSubcategories, getSortedThemes } from "@/lib/investmentMix";
import { computeSankeyMetrics, filterSankeyToTeam, limitRepoNodes } from "@/lib/sankey";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyNode, SankeyResponse, WorkUnitInvestment } from "@/lib/types";
import type { TreemapSelection } from "./types";

type InvestmentChartsProps = {
  filters: MetricFilter;
  workUnits: WorkUnitInvestment[];
  isLoading: boolean;
  investmentMix: ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix> | null;
  isMixLoading: boolean;
  focusTheme: string | null;
  setFocusTheme: (value: string | null) => void;
  setFocusSubcategory: (value: string | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (value: string | null | ((current: string | null) => string | null)) => void;
  focusedTeam: string | null;
  setFocusedTeam: (value: string | null) => void;
  teamCategoryFlow: SankeyResponse | null | undefined;
  baselineSankeyFlow: SankeyResponse | null | undefined;
  isCategoryFlowLoading: boolean;
  repoTeamFlow: SankeyResponse | null | undefined;
  isRepoTeamLoading: boolean;
  repoTeamFlowFailed: boolean;
  selectedThemeKey: string | null;
  showSubcategories: boolean;
};

export function InvestmentCharts({
  filters,
  workUnits,
  isLoading,
  investmentMix,
  isMixLoading,
  focusTheme,
  setFocusTheme,
  setFocusSubcategory,
  selectedCategory,
  setSelectedCategory,
  focusedTeam,
  setFocusedTeam,
  teamCategoryFlow,
  baselineSankeyFlow,
  isCategoryFlowLoading,
  repoTeamFlow,
  isRepoTeamLoading,
  repoTeamFlowFailed,
  selectedThemeKey,
  showSubcategories,
}: InvestmentChartsProps) {
  const chartTheme = useChartTheme();
  const chartColors = useChartColors();
  const [mixChartType, setMixChartType] = useState<TreemapSunburstType>("treemap");
  const [treemapSelection, setTreemapSelection] = useState<TreemapSelection | null>(null);

  const allSubcategoryIds = useMemo(() => {
    const ids = new Set<string>();
    workUnits.forEach((unit) => {
      Object.keys(unit.investment?.subcategories ?? {}).forEach((key) => {
        ids.add(key);
      });
    });
    return Array.from(ids).sort();
  }, [workUnits]);

  const themeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!investmentMix) return map;
    const themes = getSortedThemes(investmentMix);
    themes.forEach((theme, index) => {
      map.set(theme.key, chartColors[index % chartColors.length]);
    });
    return map;
  }, [investmentMix, chartColors]);

  const categoryColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!investmentMix) return map;
    const themes = getSortedThemes(investmentMix);
    const subcategories = getSortedSubcategories(investmentMix);

    themes.forEach((theme, index) => {
      const baseColor = chartColors[index % chartColors.length];
      map.set(theme.key, baseColor);
      const subs = subcategories.filter((s) => s.themeKey === theme.key);
      subs.forEach((sub, subIdx) => {
        map.set(sub.key, adjustHex(baseColor, 18 + (subIdx % 3) * 10));
      });
    });
    return map;
  }, [investmentMix, chartColors]);

  const resolveSubcategoryIdForColor = useCallback(
    (label: string) => {
      const normalized = label.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      return (
        allSubcategoryIds.find((id) => {
          const [themeKey] = id.split(".", 1);
          if (selectedThemeKey && themeKey !== selectedThemeKey) {
            return false;
          }
          const withTheme = formatSubcategoryLabel(id, true).toLowerCase();
          const withoutTheme = formatSubcategoryLabel(id, false).toLowerCase();
          return withTheme === normalized || withoutTheme === normalized;
        }) ?? null
      );
    },
    [allSubcategoryIds, selectedThemeKey]
  );

  const applySankeyNodeColor = useCallback(
    (node: SankeyNode) => {
      if (node.itemStyle?.color) {
        return node;
      }
      if (node.group === "category") {
        const themeKey = normalizeThemeKey(node.name);
        const color = themeKey ? themeColorMap.get(themeKey) : undefined;
        if (color) {
          return { ...node, itemStyle: { ...node.itemStyle, color } };
        }
      }
      if (node.group === "subcategory") {
        const subId = resolveSubcategoryIdForColor(node.name);
        const color = subId ? categoryColorMap.get(subId) : undefined;
        if (color) {
          return { ...node, itemStyle: { ...node.itemStyle, color } };
        }
      }
      return node;
    },
    [categoryColorMap, resolveSubcategoryIdForColor, themeColorMap]
  );

  const prepareSankeyFlow = useCallback(
    (flow: SankeyResponse | null, topN: number) => {
      if (!flow) {
        return null;
      }

      const groupByOriginalName = new Map<string, string | undefined>();
      flow.nodes.forEach((node) => {
        groupByOriginalName.set(node.name, node.group);
      });
      const normalizeName = (name: string, group?: string) => normalizeUnassignedLabel(name, group ?? groupByOriginalName.get(name));

      const nodeMap = new Map<string, SankeyNode>();
      flow.nodes.forEach((node) => {
        const normalizedName = normalizeName(node.name, node.group);
        const coloredNode = applySankeyNodeColor({ ...node, name: normalizedName });
        const existing = nodeMap.get(normalizedName);
        if (!existing) {
          nodeMap.set(normalizedName, coloredNode);
          return;
        }
        nodeMap.set(normalizedName, {
          ...existing,
          group: existing.group ?? coloredNode.group,
          itemStyle: existing.itemStyle?.color ? existing.itemStyle : coloredNode.itemStyle,
        });
      });

      const linkTotals = new Map<string, number>();
      flow.links.forEach((link) => {
        if (!Number.isFinite(link.value) || link.value <= 0) {
          return;
        }
        const source = normalizeName(link.source, groupByOriginalName.get(link.source));
        const target = normalizeName(link.target, groupByOriginalName.get(link.target));
        const key = `${source}|||${target}`;
        linkTotals.set(key, (linkTotals.get(key) ?? 0) + link.value);
        if (!nodeMap.has(source)) {
          nodeMap.set(source, { name: source, group: groupByOriginalName.get(link.source) });
        }
        if (!nodeMap.has(target)) {
          nodeMap.set(target, { name: target, group: groupByOriginalName.get(link.target) });
        }
      });

      let nodes = Array.from(nodeMap.values());
      let links = Array.from(linkTotals, ([key, value]) => {
        const [source, target] = key.split("|||");
        return { source, target, value };
      });

      if (topN > 0) {
        const limited = limitRepoNodes({ nodes, links }, topN);
        nodes = limited.nodes;
        links = limited.links;
      }

      const metrics = computeSankeyMetrics(nodes, links);
      nodes = nodes.map((node) => ({
        ...node,
        value: metrics.nodeValueByName.get(node.name) ?? node.value,
      }));

      return { ...flow, nodes, links };
    },
    [applySankeyNodeColor]
  );

  const mixThemes = useMemo(() => (investmentMix ? getSortedThemes(investmentMix) : []), [investmentMix]);
  const mixSubcategories = useMemo(() => (investmentMix ? getSortedSubcategories(investmentMix) : []), [investmentMix]);
  const mixTotalValue = useMemo(() => mixThemes.reduce((sum, entry) => sum + entry.value, 0), [mixThemes]);
  const focusedThemeTotalValue = useMemo(() => {
    if (!focusTheme || !investmentMix) return 0;
    return investmentMix.theme_distribution[focusTheme] ?? 0;
  }, [focusTheme, investmentMix]);
  const focusedThemeSubcategories = useMemo(() => {
    if (!focusTheme) return [];
    return mixSubcategories.filter((entry) => entry.themeKey === focusTheme);
  }, [focusTheme, mixSubcategories]);

  const handleThemeClick = useCallback(
    (themeKey: string) => {
      setFocusTheme(focusTheme === themeKey ? null : themeKey);
    },
    [focusTheme, setFocusTheme]
  );

  const handleSubcategoryClick = useCallback(
    (subcategoryKey: string) => {
      const [themeKey] = subcategoryKey.split(".", 1);
      setFocusTheme(themeKey || null);
      setFocusSubcategory(subcategoryKey);
    },
    [setFocusSubcategory, setFocusTheme]
  );

  const handleTreemapSelection = useCallback((node: { name: string; path: string[]; data?: TreemapNode }) => {
    const nodeData = node.data as
      | (TreemapNode & {
          nodeType?: "theme" | "subcategory";
          themeKey?: string;
          categoryId?: string;
          categoryLabel?: string;
        })
      | undefined;

    const nodeType = nodeData?.nodeType === "subcategory" ? "subcategory" : "theme";
    const categoryId = nodeData?.categoryId ?? null;
    const themeKey = nodeData?.themeKey ?? (categoryId ? categoryId.split(".", 1)[0] : null);
    const themeLabel = themeKey ? titleCase(themeKey) : (node.path[0] ?? node.name);
    const subcategoryLabel = nodeType === "subcategory" ? (nodeData?.categoryLabel ?? node.name) : undefined;
    const selectionKey = nodeType === "subcategory" ? `subcategory:${categoryId ?? node.name}` : `theme:${themeKey ?? node.name}`;

    setTreemapSelection((current) => {
      if (current?.key === selectionKey) {
        return null;
      }
      return {
        key: selectionKey,
        type: nodeType,
        themeLabel,
        themeKey,
        subcategoryLabel,
        subcategoryId: categoryId,
      };
    });
  }, []);

  const clearTreemapSelection = useCallback(() => {
    setTreemapSelection(null);
  }, []);

  const focusTreemapTheme = useCallback(() => {
    setTreemapSelection((current) => {
      if (!current || current.type !== "subcategory") {
        return current;
      }
      const themeKey = current.themeKey ?? current.themeLabel;
      return {
        key: `theme:${themeKey}`,
        type: "theme",
        themeLabel: current.themeLabel,
        themeKey: current.themeKey,
      };
    });
  }, []);

  const treemapData = useMemo<TreemapNode>(() => {
    if (!investmentMix) {
      return { name: "Investment", value: 0, children: [] };
    }
    const themes = getSortedThemes(investmentMix);
    const subcategories = getSortedSubcategories(investmentMix);
    const qualityDist = investmentMix.evidence_quality_distribution ?? {};

    const children = themes.map((theme) => {
      const themeLabel = titleCase(theme.key);
      const baseColor = themeColorMap.get(theme.key) ?? chartTheme.grid;
      const themeOpacity = qualityDist[theme.key];

      const themeSubcategories = subcategories
        .filter((sub) => sub.themeKey === theme.key)
        .map((sub, idx) => {
          const subLabel = formatSubcategoryLabel(sub.key, false);
          const subFullLabel = formatSubcategoryLabel(sub.key, true);
          const subOpacity = qualityDist[sub.key];

          return {
            name: subLabel,
            value: sub.value,
            itemStyle: {
              color: adjustHex(baseColor, 18 + (idx % 3) * 10),
              opacity: typeof subOpacity === "number" ? clamp(subOpacity) : undefined,
            },
            nodeType: "subcategory",
            categoryId: sub.key,
            categoryLabel: subLabel,
            categoryFullLabel: subFullLabel,
            qualityValue: subOpacity,
          } as TreemapNode;
        });

      return {
        name: themeLabel,
        value: theme.value,
        itemStyle: {
          color: baseColor,
          opacity: typeof themeOpacity === "number" ? clamp(themeOpacity) : undefined,
        },
        nodeType: "theme",
        themeKey: theme.key,
        children: themeSubcategories.length ? themeSubcategories : undefined,
      } as TreemapNode;
    });

    return { name: "Investment", value: mixTotalValue, children };
  }, [investmentMix, mixTotalValue, themeColorMap, chartTheme.grid]);

  const rawSankeyFlow = useMemo(() => filterSankeyToTeam(teamCategoryFlow ?? null, focusedTeam), [teamCategoryFlow, focusedTeam]);
  const rawBaselineFlow = useMemo(() => filterSankeyToTeam(baselineSankeyFlow ?? null, focusedTeam), [baselineSankeyFlow, focusedTeam]);
  const sankeyFlow = useMemo(() => prepareSankeyFlow(rawSankeyFlow, TOP_N_REPOS), [rawSankeyFlow, prepareSankeyFlow]);
  const baselineFlow = useMemo(() => prepareSankeyFlow(rawBaselineFlow, TOP_N_REPOS), [rawBaselineFlow, prepareSankeyFlow]);
  const isSankeyLoading = isCategoryFlowLoading;

  const sankeyMetrics = useMemo(() => (sankeyFlow ? computeSankeyMetrics(sankeyFlow.nodes, sankeyFlow.links) : null), [sankeyFlow]);
  const baselineMetrics = useMemo(() => (baselineFlow ? computeSankeyMetrics(baselineFlow.nodes, baselineFlow.links) : null), [baselineFlow]);
  const baselineSankeyTotal = baselineMetrics?.totalFlow ?? 0;

  const sankeyNodeMap = useMemo(() => {
    const map = new Map<string, SankeyNode>();
    (sankeyFlow?.nodes ?? []).forEach((node) => {
      map.set(node.name, node);
    });
    return map;
  }, [sankeyFlow]);

  const showBaselineDelta = !selectedCategory && baselineSankeyTotal > 0;
  const sankeyCoverage = useMemo(() => {
    const coverage = sankeyFlow?.coverage;
    return {
      team: coverage?.team ?? sankeyFlow?.team_coverage ?? 0,
      repo: coverage?.repo ?? sankeyFlow?.repo_coverage ?? 0,
    };
  }, [sankeyFlow]);

  const categoryShareSummary = useMemo(() => {
    if (!sankeyFlow || !sankeyFlow.links.length) return [];
    const targetGroup = showSubcategories ? "subcategory" : "category";
    const groupNames = new Set(sankeyFlow.nodes.filter((node) => node.group === targetGroup).map((node) => node.name));
    if (!groupNames.size) return [];
    const totals = new Map<string, number>();
    let total = 0;
    sankeyFlow.links.forEach((link) => {
      if (!groupNames.has(link.target)) return;
      totals.set(link.target, (totals.get(link.target) ?? 0) + link.value);
      total += link.value;
    });
    if (total === 0) {
      sankeyFlow.links.forEach((link) => {
        if (!groupNames.has(link.source)) return;
        totals.set(link.source, (totals.get(link.source) ?? 0) + link.value);
        total += link.value;
      });
    }
    return Array.from(totals.entries())
      .map(([name, value]) => ({
        name,
        value,
        share: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [sankeyFlow, showSubcategories]);

  const isSingleTeamScope = filters.scope.level === "team" && filters.scope.ids.length === 1;
  const summaryLimit = showSubcategories ? 3 : isSingleTeamScope ? 1 : 3;
  const topCategorySummary = useMemo(() => categoryShareSummary.slice(0, summaryLimit), [categoryShareSummary, summaryLimit]);
  const topSummaryLabel = showSubcategories ? "Top subcategories:" : isSingleTeamScope ? "Top theme:" : "Top themes:";

  const rawRepoTeamSankey = useMemo<(SankeyResponse & { hasTeamAssociations: boolean }) | null>(() => {
    if (repoTeamFlow) {
      const hasTeams = repoTeamFlow.nodes.some((node) => node.group === "team");
      return { ...repoTeamFlow, hasTeamAssociations: hasTeams };
    }
    if (!repoTeamFlowFailed) {
      return null;
    }
    if (!workUnits.length) {
      return null;
    }
    return buildRepoTeamSankey(workUnits, {}, categoryColorMap);
  }, [repoTeamFlow, repoTeamFlowFailed, workUnits, categoryColorMap]);

  const repoTeamSankey = useMemo(() => prepareSankeyFlow(rawRepoTeamSankey, TOP_N_REPOS), [prepareSankeyFlow, rawRepoTeamSankey]);
  const repoTeamLinks = repoTeamSankey?.links ?? [];
  const repoTeamNodes = repoTeamSankey?.nodes ?? [];
  const repoTeamHasTeams = rawRepoTeamSankey?.hasTeamAssociations ?? false;

  const handleTeamFocus = useCallback(
    (teamName: string) => {
      if (!teamName || teamName === UNASSIGNED_TEAM_LABEL) {
        return;
      }
      setSelectedCategory(null);
      setFocusSubcategory(null);
      setFocusedTeam(teamName);
    },
    [setFocusedTeam, setFocusSubcategory, setSelectedCategory]
  );

  const handleCategoryFocus = useCallback(
    (categoryName: string) => {
      if (!categoryName || isUnassignedLabel(categoryName)) {
        return;
      }
      setFocusSubcategory(null);
      setSelectedCategory((current) => (current === categoryName ? null : categoryName));
    },
    [setFocusSubcategory, setSelectedCategory]
  );

  const resolveSubcategoryIdFromLabel = useCallback(
    (label: string) => {
      const normalized = stripSankeyPrefix(label).trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      const includeTheme = !selectedThemeKey;
      return (
        allSubcategoryIds.find((id) => {
          const [themeKey] = id.split(".", 1);
          if (selectedThemeKey && themeKey !== selectedThemeKey) {
            return false;
          }
          const formatted = formatSubcategoryLabel(id, includeTheme).toLowerCase();
          const formattedWithTheme = formatSubcategoryLabel(id, true).toLowerCase();
          const formattedWithoutTheme = formatSubcategoryLabel(id, false).toLowerCase();
          return formatted === normalized || formattedWithTheme === normalized || formattedWithoutTheme === normalized;
        }) ?? null
      );
    },
    [allSubcategoryIds, selectedThemeKey]
  );

  const treemapLabelFormatter = useCallback((params: unknown, totalValue: number) => {
    if (!params || typeof params !== "object") return "";
    const entry = params as { data?: { name?: string; value?: number } };
    const nodeData = entry.data ?? {};
    const name = typeof nodeData.name === "string" ? nodeData.name : "";
    const value = typeof nodeData.value === "number" ? nodeData.value : 0;
    const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    if (!name || pct < 2) return "";
    return `${name}\n${pct.toFixed(0)}%`;
  }, []);

  const buildSankeyTooltipFormatter = useCallback(
    (context: {
      nodeMap: Map<string, SankeyNode>;
      metrics: ReturnType<typeof computeSankeyMetrics> | null;
      baselineFlow?: SankeyResponse | null;
      baselineMetrics?: ReturnType<typeof computeSankeyMetrics> | null;
      timeRange: MetricFilter["time"];
      showBaselineDelta?: boolean;
    }) => {
      return (params: unknown, unit: string) => {
        if (!params || typeof params !== "object" || !context.metrics) return "";
        const entry = params as {
          dataType?: string;
          data?: { name?: string; value?: number; source?: string; target?: string };
          name?: string;
        };
        const data = entry.data ?? {};
        const isEdge = entry.dataType === "edge";
        const nodeName = data.name ?? entry.name ?? "";
        const currentValue = typeof data.value === "number" ? data.value : 0;
        const nodeValue = context.metrics.nodeValueByName.get(nodeName) ?? currentValue;
        const resolvedValue = isEdge ? currentValue : nodeValue;
        const shareRatio = context.metrics.totalFlow > 0 ? resolvedValue / context.metrics.totalFlow : null;
        const clampedShare = shareRatio === null ? null : Math.min(1, Math.max(0, shareRatio));
        const timeLabel = buildOptionalTimeRangeLabel(context.timeRange.start_date, context.timeRange.end_date);

        const groupLabel = (name?: string) => {
          const group = name ? context.nodeMap.get(name)?.group : undefined;
          if (group === "team") return "Team";
          if (group === "category") return "Theme";
          if (group === "subcategory") return "Subcategory";
          if (group === "repo") return "Repo";
          return "";
        };

        const typeBadge = (name: string) => {
          const type = groupLabel(name);
          if (!type) return "";
          return `<span style=\"margin-left: 6px; padding: 2px 6px; border-radius: 999px; background: ${chartTheme.grid}; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: ${chartTheme.text};\">${type}</span>`;
        };

        const unassignedLine = (name: string) => {
          if (name === UNASSIGNED_TEAM_LABEL) {
            return "Missing team attribution in source data";
          }
          if (name === UNASSIGNED_REPO_LABEL) {
            return "Missing repo association in source data";
          }
          return "";
        };

        let deltaHtml = "";
        if (context.showBaselineDelta && context.baselineFlow && context.baselineMetrics && clampedShare !== null) {
          let baselineValue = 0;
          if (isEdge) {
            const baseLink = context.baselineFlow.links.find((l) => l.source === data.source && l.target === data.target);
            baselineValue = baseLink?.value ?? 0;
          } else {
            baselineValue = context.baselineMetrics.nodeValueByName.get(nodeName) ?? 0;
          }
          const baselineRatio = context.baselineMetrics.totalFlow > 0 ? baselineValue / context.baselineMetrics.totalFlow : null;
          const baselineShare = baselineRatio === null ? null : Math.min(1, Math.max(0, baselineRatio));
          if (baselineShare !== null) {
            const delta = clampedShare - baselineShare;
            const deltaSign = delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "";
            const deltaColor = delta > 0 ? chartTheme.accent2 : delta < 0 ? chartTheme.accent1 : chartTheme.muted;
            deltaHtml = `
              <div style=\"margin-top: 8px; padding-top: 8px; border-top: 1px solid ${chartTheme.grid}; font-size: 11px;\">
                <div><span style=\"color: ${chartTheme.muted}\">Current allocation share:</span> ${(clampedShare * 100).toFixed(1)}%</div>
                <div><span style=\"color: ${chartTheme.muted}\">Baseline allocation share:</span> ${(baselineShare * 100).toFixed(1)}%</div>
                <div style=\"font-weight: 600; color: ${deltaColor};\">Delta: ${deltaSign}${(delta * 100).toFixed(1)}%</div>
                <div style=\"margin-top: 6px; font-size: 10px; color: ${chartTheme.muted}; font-style: italic; line-height: 1.3;\">
                  Delta reflects change in allocation share vs the prior window. It does not indicate cause, impact, or priority.
                </div>
              </div>
            `;
          }
        }

        if (isEdge) {
          const lines = [
            `<strong>Allocated:</strong> ${formatNumber(currentValue)} ${unit}`,
            `<strong>From:</strong> ${data.source ?? ""}${groupLabel(data.source) ? ` (${groupLabel(data.source)})` : ""}`,
            `<strong>To:</strong> ${data.target ?? ""}${groupLabel(data.target) ? ` (${groupLabel(data.target)})` : ""}`,
          ];
          if (timeLabel) {
            lines.push(`<strong>Window:</strong> ${timeLabel}`);
          }
          const edgeUnassigned = unassignedLine(data.source ?? "") || unassignedLine(data.target ?? "");
          if (edgeUnassigned) {
            lines.push(`<span style=\"color: ${chartTheme.muted}; font-size: 10px;\">${edgeUnassigned}</span>`);
          }
          const meaning = `<div style=\"margin-top: 8px; font-size: 10px; color: ${chartTheme.muted};\">Attribution under current filters (not dependency or causation).</div>`;
          return `<div style=\"padding: 4px;\">${lines.join("<br/>")}${deltaHtml}${meaning}</div>`;
        }

        const lines = [`<strong>Total allocated:</strong> ${formatNumber(nodeValue)} ${unit}`];
        if (clampedShare !== null) {
          lines.push(`<strong>Share:</strong> ${(clampedShare * 100).toFixed(1)}%`);
        }
        if (timeLabel) {
          lines.push(`<strong>Window:</strong> ${timeLabel}`);
        }
        const nodeUnassigned = unassignedLine(nodeName);
        if (nodeUnassigned) {
          lines.push(`<span style=\"color: ${chartTheme.muted}; font-size: 10px;\">${nodeUnassigned}</span>`);
        }
        const meaning = `<div style=\"margin-top: 8px; font-size: 10px; color: ${chartTheme.muted};\">Attribution under current filters (not dependency or causation).</div>`;
        return `<div style=\"padding: 4px;\"><div style=\"font-weight: 600;\">${nodeName}${typeBadge(nodeName)}</div><div style=\"margin-top: 6px;\">${lines.join("<br/>")}</div>${deltaHtml}${meaning}</div>`;
      };
    },
    [chartTheme.accent1, chartTheme.accent2, chartTheme.grid, chartTheme.muted, chartTheme.text]
  );

  const repoTeamNodeMap = useMemo(() => {
    const map = new Map<string, SankeyNode>();
    (repoTeamSankey?.nodes ?? []).forEach((node) => {
      map.set(node.name, node);
    });
    return map;
  }, [repoTeamSankey]);

  const repoTeamMetrics = useMemo(() => (repoTeamSankey ? computeSankeyMetrics(repoTeamSankey.nodes, repoTeamSankey.links) : null), [repoTeamSankey]);

  const sankeyTooltipFormatter = useMemo(
    () =>
      buildSankeyTooltipFormatter({
        nodeMap: sankeyNodeMap,
        metrics: sankeyMetrics,
        baselineFlow,
        baselineMetrics,
        timeRange: filters.time,
        showBaselineDelta,
      }),
    [baselineFlow, baselineMetrics, buildSankeyTooltipFormatter, filters.time, sankeyMetrics, sankeyNodeMap, showBaselineDelta]
  );

  const repoTeamTooltipFormatter = useMemo(
    () =>
      buildSankeyTooltipFormatter({
        nodeMap: repoTeamNodeMap,
        metrics: repoTeamMetrics,
        timeRange: filters.time,
      }),
    [buildSankeyTooltipFormatter, filters.time, repoTeamMetrics, repoTeamNodeMap]
  );

  const formatTreemapTooltip = useCallback(
    (params: unknown, _totalValue: number, unitLabel: string) => {
      if (!params || typeof params !== "object") return "";
      const entry = params as { data?: Record<string, unknown>; treePathInfo?: Array<{ name: string }> };
      const data = entry.data ?? {};
      const treePath = entry.treePathInfo ?? [];
      const pathSegments = treePath.slice(1).map((p) => p.name);
      const title = pathSegments.join(" · ");
      if (!title) return "";
      const value = typeof data.value === "number" ? data.value : 0;
      const qualityValue = typeof data.qualityValue === "number" ? data.qualityValue : null;
      const qualityLabel = qualityValue !== null ? formatQuality(qualityValue) : "Unknown";
      const qualityExtra =
        qualityValue !== null
          ? `Avg evidence quality: ${qualityLabel}<br/><div style=\"margin-top: 6px; font-size: 11px; opacity: 0.8;\">Evidence quality reflects average across contributing units.</div>`
          : `<div style=\"opacity: 0.7;\">Evidence quality: Unknown<br/>Insufficient evidence to compute quality.</div>`;

      return buildTooltipHtml({
        title,
        value,
        unit: unitLabel,
        percent: calcPercent(value, mixTotalValue),
        mutedColor: chartTheme.muted,
        accentColor: chartTheme.accent2,
        extra: qualityExtra,
      });
    },
    [chartTheme.accent2, chartTheme.muted, mixTotalValue]
  );

  const effortUnit = useMemo(() => {
    const metrics = new Set(workUnits.map((unit) => unit.effort.metric));
    if (metrics.size === 1) {
      const metric = metrics.values().next().value ?? "churn_loc";
      return formatEffortUnit(metric);
    }
    return "effort";
  }, [workUnits]);

  const categoryScopeLabel = focusTheme ? "Subcategory" : "Theme";

  return (
    <>
      <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-(--font-display) text-lg">{mixChartType === "treemap" ? "Treemap" : "Investment mix"}</h3>
            <span className="text-xs text-(--ink-muted)">
              {mixChartType === "treemap" ? `Effort size - Evidence quality opacity - ${categoryScopeLabel} view` : "Theme to Subcategory (depth 2)"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {mixChartType === "sunburst" && focusTheme && (
              <button
                type="button"
                onClick={() => setFocusTheme(null)}
                className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
              >
                Clear theme
              </button>
            )}
            <ChartTypeToggle options={TREEMAP_SUNBURST_OPTIONS} value={mixChartType} onChange={setMixChartType} />
          </div>
        </div>
        <div className="mt-4">
          {mixChartType === "treemap" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={treemapSelection ? clearTreemapSelection : undefined}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${treemapSelection ? "text-(--accent-2) hover:underline" : "bg-(--card-stroke) text-foreground"}`}
                >
                  All themes
                </button>
                {treemapSelection && (
                  <>
                    <span className="text-(--ink-muted)">/</span>
                    {treemapSelection.type === "subcategory" ? (
                      <button
                        type="button"
                        onClick={focusTreemapTheme}
                        className="rounded-full px-2 py-0.5 text-[11px] text-(--accent-2) hover:underline"
                      >
                        {treemapSelection.themeLabel}
                      </button>
                    ) : (
                      <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-[11px] text-foreground">{treemapSelection.themeLabel}</span>
                    )}
                    {treemapSelection.type === "subcategory" && treemapSelection.subcategoryLabel && (
                      <>
                        <span className="text-(--ink-muted)">/</span>
                        <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-[11px] text-foreground">{treemapSelection.subcategoryLabel}</span>
                      </>
                    )}
                  </>
                )}
              </div>
              {isLoading ? (
                <p className="text-sm text-(--ink-muted)">Loading work units...</p>
              ) : workUnits.length === 0 ? (
                <p className="text-sm text-(--ink-muted)">No work unit investments available.</p>
              ) : (
                <TreemapChart
                  data={treemapData}
                  unit={effortUnit}
                  height={360}
                  useInputColors
                  showBreadcrumb={false}
                  tooltipFormatter={formatTreemapTooltip}
                  labelFormatter={treemapLabelFormatter}
                  onNodeClick={handleTreemapSelection}
                />
              )}
            </>
          ) : isMixLoading ? (
            <p className="text-sm text-(--ink-muted)">Loading investment mix...</p>
          ) : !investmentMix || mixThemes.length === 0 ? (
            <p className="text-sm text-(--ink-muted)">No investment mix available.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-start">
              <InvestmentMixSunburst
                themeDistribution={investmentMix.theme_distribution}
                subcategoryDistribution={investmentMix.subcategory_distribution}
                evidenceQualityDistribution={investmentMix.evidence_quality_distribution}
                unit={investmentMix.unit ?? effortUnit}
                height={360}
                focusedTheme={focusTheme}
                onThemeClick={handleThemeClick}
                onSubcategoryClick={handleSubcategoryClick}
              />
              <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">{focusTheme ? "Subcategory breakdown" : "Themes"}</p>
                  {focusTheme && <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">{titleCase(focusTheme)}</span>}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {focusTheme ? (
                    focusedThemeSubcategories.length ? (
                      focusedThemeSubcategories.map((entry) => {
                        const pctOfTheme = focusedThemeTotalValue ? (entry.value / focusedThemeTotalValue) * 100 : 0;
                        return (
                          <button
                            key={entry.key}
                            type="button"
                            onClick={() => handleSubcategoryClick(entry.key)}
                            className="flex w-full items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-3 py-2 text-left transition hover:border-(--accent-2)"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-foreground">{formatSubcategoryLabel(entry.key, false)}</div>
                              <div className="mt-1 text-xs text-(--ink-muted)">{formatNumber(entry.value)} {investmentMix.unit ?? effortUnit}</div>
                              <div className="text-xs text-(--accent-2)">{formatNumber(pctOfTheme, { maximumFractionDigits: 1 })}% of theme</div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-sm text-(--ink-muted)">No subcategories observed for this theme.</p>
                    )
                  ) : (
                    mixThemes.slice(0, 8).map((entry) => {
                      const pct = mixTotalValue ? (entry.value / mixTotalValue) * 100 : 0;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => handleThemeClick(entry.key)}
                          className="flex w-full items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-3 py-2 text-left transition hover:border-(--accent-2)"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm text-foreground">{titleCase(entry.key)}</div>
                            <div className="mt-1 text-xs text-(--ink-muted)">{formatNumber(entry.value)} {investmentMix.unit ?? effortUnit}</div>
                            <div className="text-xs text-(--accent-2)">{formatNumber(pct, { maximumFractionDigits: 1 })}% of total</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-(--font-display) text-lg">Team burden flow</h3>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-(--ink-muted)">
                <span>Team coverage: <strong className="text-(--ink)">{formatNumber(sankeyCoverage.team * 100)}%</strong></span>
                <span>Repo coverage: <strong className="text-(--ink)">{formatNumber(sankeyCoverage.repo * 100)}%</strong></span>
              </div>
            </div>
            <p className="mt-1 text-xs text-(--ink-muted)">{showSubcategories ? "Team to Theme to Subcategory to Repo" : "Team to Theme to Repo"}</p>
            {(focusedTeam || selectedCategory) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {focusedTeam && (
                  <button
                    type="button"
                    onClick={() => setFocusedTeam(null)}
                    className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                  >
                    Drilldown: Team = {focusedTeam}
                    <span className="text-xs">x</span>
                  </button>
                )}
                {selectedCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory(null);
                      setFocusSubcategory(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                  >
                    Drilldown: Theme = {selectedCategory}
                    <span className="text-xs">x</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-(--ink-muted)">
            {selectedCategory && <span>Theme focus: <strong className="text-(--ink)">{selectedCategory}</strong></span>}
            {topCategorySummary.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span>{topSummaryLabel}</span>
                {topCategorySummary.map((entry) => (
                  <span key={entry.name} className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[10px]">
                    {entry.name} {entry.share.toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 mb-4 border-l-2 border-(--card-stroke) py-1 pl-3 text-[11px] leading-relaxed text-(--ink-muted)">
          This view shows where effort appears to land across teams, themes, and repos for the selected window.
          Allocation reflects attribution, not dependency or impact.
        </div>
        <div className="mt-0">
          {isSankeyLoading ? (
            <p className="text-sm text-(--ink-muted)">Loading flow data...</p>
          ) : !sankeyFlow || !sankeyFlow.links.length ? (
            <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
              No team burden flow available for this scope and window.
            </div>
          ) : (
            <SankeyChart
              nodes={sankeyFlow.nodes}
              links={sankeyFlow.links}
              unit={effortUnit}
              height={320}
              tooltipFormatter={sankeyTooltipFormatter}
              onItemClick={(item) => {
                if (!sankeyFlow) return;
                if (item.type === "node") {
                  const node = sankeyFlow.nodes.find((n) => n.name === item.name);
                  if (node?.group === "team") {
                    handleTeamFocus(stripSankeyPrefix(node.name));
                    return;
                  }
                  if (node?.group === "category") {
                    handleCategoryFocus(node.name);
                    return;
                  }
                  if (node?.group === "subcategory") {
                    const subId = resolveSubcategoryIdFromLabel(node.name);
                    if (subId) {
                      setFocusSubcategory(subId);
                    }
                  }
                } else if (item.type === "link" && selectedCategory) {
                  const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                  if (subId) {
                    setFocusSubcategory(subId);
                  }
                }
              }}
            />
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-(--font-display) text-lg">Where effort lands</h3>
            <p className="mt-1 text-xs text-(--ink-muted)">Subcategory to Repo to Team</p>
          </div>
          <span className="text-xs text-(--ink-muted)">Two-hop allocation to highlight team ownership behind repos.</span>
        </div>
        <div className="mt-2 mb-4 border-l-2 border-(--card-stroke) py-1 pl-3 text-[11px] leading-relaxed text-(--ink-muted)">
          This view uses repo-to-team mapping when available. Missing repo associations flow through an unassigned repo node.
        </div>
        <div className="mt-0">
          {isRepoTeamLoading ? (
            <p className="text-sm text-(--ink-muted)">Loading destination view...</p>
          ) : repoTeamHasTeams && repoTeamLinks.length ? (
            <SankeyChart
              nodes={repoTeamNodes}
              links={repoTeamLinks}
              unit={effortUnit}
              height={320}
              tooltipFormatter={repoTeamTooltipFormatter}
              onItemClick={(item) => {
                if (item.type === "node") {
                  const normalized = stripSankeyPrefix(item.name ?? "");
                  const node = repoTeamNodes.find((entry) => stripSankeyPrefix(entry.name) === normalized);
                  if (node?.group === "subcategory") {
                    const subId = resolveSubcategoryIdFromLabel(node.name);
                    if (subId) setFocusSubcategory(subId);
                  }
                } else if (item.type === "link") {
                  const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                  if (subId) setFocusSubcategory(subId);
                }
              }}
            />
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
              <div>
                <p>We currently have no teams associated with work items.</p>
                <p className="mt-2 text-[11px] text-(--ink-muted)">Investment categories still compute from evidence.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useCallback, useMemo } from "react";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { formatNumber } from "@/lib/formatters";
import {
  adjustHex,
  buildOptionalTimeRangeLabel,
  formatSubcategoryLabel,
  normalizeThemeKey,
  normalizeUnassignedLabel,
  stripSankeyPrefix,
  UNASSIGNED_REPO_LABEL,
  UNASSIGNED_TEAM_LABEL,
} from "@/lib/investment";
import { getSortedSubcategories, getSortedThemes } from "@/lib/investmentMix";
import { computeSankeyMetrics, limitRepoNodes } from "@/lib/sankey";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyNode, SankeyResponse, WorkUnitInvestment } from "@/lib/types";

type InvestmentMix = ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix>;

type UseInvestmentColorMapsArgs = {
  investmentMix: InvestmentMix | null;
  workUnits: WorkUnitInvestment[];
  selectedThemeKey: string | null;
};

// Color maps + sankey preparation utilities are shared across the mix treemap and
// both sankey sections, so they live in a single hook consumed by the parent and
// threaded down via props. Keeping the hook centralised preserves memo identity
// across sections (both sankey tooltip formatters share one buildSankeyTooltipFormatter).
export function useInvestmentColorMaps({
  investmentMix,
  workUnits,
  selectedThemeKey,
}: UseInvestmentColorMapsArgs) {
  const chartTheme = useChartTheme();
  const chartColors = useChartColors();

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
    [allSubcategoryIds, selectedThemeKey],
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
    [categoryColorMap, resolveSubcategoryIdForColor, themeColorMap],
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
      const normalizeName = (name: string, group?: string) =>
        normalizeUnassignedLabel(name, group ?? groupByOriginalName.get(name));

      const nodeMap = new Map<string, SankeyNode>();
      flow.nodes.forEach((node) => {
        const normalizedName = normalizeName(node.name, node.group);
        const coloredNode = applySankeyNodeColor({
          ...node,
          name: normalizedName,
        });
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
          nodeMap.set(source, {
            name: source,
            group: groupByOriginalName.get(link.source),
          });
        }
        if (!nodeMap.has(target)) {
          nodeMap.set(target, {
            name: target,
            group: groupByOriginalName.get(link.target),
          });
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
    [applySankeyNodeColor],
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
          return (
            formatted === normalized ||
            formattedWithTheme === normalized ||
            formattedWithoutTheme === normalized
          );
        }) ?? null
      );
    },
    [allSubcategoryIds, selectedThemeKey],
  );

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
          data?: {
            name?: string;
            value?: number;
            source?: string;
            target?: string;
          };
          name?: string;
        };
        const data = entry.data ?? {};
        const isEdge = entry.dataType === "edge";
        const nodeName = data.name ?? entry.name ?? "";
        const currentValue = typeof data.value === "number" ? data.value : 0;
        const nodeValue = context.metrics.nodeValueByName.get(nodeName) ?? currentValue;
        const resolvedValue = isEdge ? currentValue : nodeValue;
        const shareRatio =
          context.metrics.totalFlow > 0 ? resolvedValue / context.metrics.totalFlow : null;
        const clampedShare = shareRatio === null ? null : Math.min(1, Math.max(0, shareRatio));
        const timeLabel = buildOptionalTimeRangeLabel(
          context.timeRange.start_date,
          context.timeRange.end_date,
        );

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
        if (
          context.showBaselineDelta &&
          context.baselineFlow &&
          context.baselineMetrics &&
          clampedShare !== null
        ) {
          let baselineValue = 0;
          if (isEdge) {
            const baseLink = context.baselineFlow.links.find(
              (l) => l.source === data.source && l.target === data.target,
            );
            baselineValue = baseLink?.value ?? 0;
          } else {
            baselineValue = context.baselineMetrics.nodeValueByName.get(nodeName) ?? 0;
          }
          const baselineRatio =
            context.baselineMetrics.totalFlow > 0
              ? baselineValue / context.baselineMetrics.totalFlow
              : null;
          const baselineShare =
            baselineRatio === null ? null : Math.min(1, Math.max(0, baselineRatio));
          if (baselineShare !== null) {
            const delta = clampedShare - baselineShare;
            const deltaSign = delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "";
            const deltaColor =
              delta > 0 ? chartTheme.accent2 : delta < 0 ? chartTheme.accent1 : chartTheme.muted;
            deltaHtml = `
              <div style=\"margin-top: 8px; padding-top: 8px; border-top: 1px solid ${chartTheme.grid}; font-size: 11px;\">
                <div><span style=\"color: ${chartTheme.muted}\">Current allocation share:</span> ${formatNumber(clampedShare * 100)}%</div>
                <div><span style=\"color: ${chartTheme.muted}\">Baseline allocation share:</span> ${formatNumber(baselineShare * 100)}%</div>
                <div style=\"font-weight: 600; color: ${deltaColor};\">Delta: ${deltaSign}${formatNumber(delta * 100)}%</div>
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
          const edgeUnassigned =
            unassignedLine(data.source ?? "") || unassignedLine(data.target ?? "");
          if (edgeUnassigned) {
            lines.push(
              `<span style=\"color: ${chartTheme.muted}; font-size: 10px;\">${edgeUnassigned}</span>`,
            );
          }
          const meaning = `<div style=\"margin-top: 8px; font-size: 10px; color: ${chartTheme.muted};\">Attribution under current filters (not dependency or causation).</div>`;
          return `<div style=\"padding: 4px;\">${lines.join("<br/>")}${deltaHtml}${meaning}</div>`;
        }

        const lines = [`<strong>Total allocated:</strong> ${formatNumber(nodeValue)} ${unit}`];
        if (clampedShare !== null) {
          lines.push(`<strong>Share:</strong> ${formatNumber(clampedShare * 100)}%`);
        }
        if (timeLabel) {
          lines.push(`<strong>Window:</strong> ${timeLabel}`);
        }
        const nodeUnassigned = unassignedLine(nodeName);
        if (nodeUnassigned) {
          lines.push(
            `<span style=\"color: ${chartTheme.muted}; font-size: 10px;\">${nodeUnassigned}</span>`,
          );
        }
        const meaning = `<div style=\"margin-top: 8px; font-size: 10px; color: ${chartTheme.muted};\">Attribution under current filters (not dependency or causation).</div>`;
        return `<div style=\"padding: 4px;\"><div style=\"font-weight: 600;\">${nodeName}${typeBadge(nodeName)}</div><div style=\"margin-top: 6px;\">${lines.join("<br/>")}</div>${deltaHtml}${meaning}</div>`;
      };
    },
    [chartTheme.accent1, chartTheme.accent2, chartTheme.grid, chartTheme.muted, chartTheme.text],
  );

  return {
    themeColorMap,
    categoryColorMap,
    prepareSankeyFlow,
    resolveSubcategoryIdFromLabel,
    buildSankeyTooltipFormatter,
  };
}

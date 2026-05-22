import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  titleCase,
  formatSubcategoryLabel,
  type InvestmentMixAggregate,
} from "@/lib/investmentMix";
import type { SankeyDataset } from "@/lib/sankey";
import type { FlowSubTab } from "./Tabs";
import type { FlowSelection } from "./InspectPanel";

type UseFlowHandlersProps = {
  investmentMix: InvestmentMixAggregate | null;
  dataset: SankeyDataset | null;
  setSelection: (sel: FlowSelection | null) => void;
  setInvestmentMixFocusTheme: Dispatch<SetStateAction<string | null>>;
};

export function useFlowHandlers({
  investmentMix,
  dataset,
  setSelection,
  setInvestmentMixFocusTheme,
}: UseFlowHandlersProps) {
  const handleTreemapClick = useCallback(
    (
      node: {
        name: string;
        value: number;
        path: string[];
        percent: number;
        data?: { children?: unknown[] };
      },
      view: FlowSubTab,
      unit: string,
    ) => {
      const hotspotPath = node.path[0] === "All" ? node.path.slice(1) : node.path;
      const hasChildren = Array.isArray(node.data?.children) && node.data.children.length > 0;
      let hotspot: FlowSelection["hotspot"];
      if (view === "code_hotspots") {
        const repoId = hotspotPath[0];
        const filePath =
          hotspotPath.length > 1 && !hasChildren ? hotspotPath.slice(1).join("/") : undefined;
        hotspot = {
          ...(repoId ? { repoId } : {}),
          ...(filePath ? { filePath } : {}),
        };
      }

      const outcomesMap: Record<string, string[]> = {
        code_hotspots: [
          "Change frequency verified",
          "Complexity hotspot risk: Moderate",
          "High structural coverage",
        ],
      };

      setSelection({
        view,
        path: node.path,
        key: node.path[node.path.length - 1],
        metricValue: node.value,
        percentTotal: node.percent,
        unit,
        hotspot,
        outcomes: outcomesMap[view],
      });
    },
    [setSelection],
  );

  const handleInvestmentMixClick = useCallback(
    (key: string, type: "theme" | "subcategory") => {
      if (!investmentMix) return;

      let path: string[] = [];
      let value = 0;
      const total = Object.values(investmentMix.theme_distribution).reduce((a, b) => a + b, 0);

      let investment: FlowSelection["investment"];

      if (type === "theme") {
        path = [titleCase(key)];
        value = investmentMix.theme_distribution[key] ?? 0;
        investment = { themeKey: key };
        setInvestmentMixFocusTheme((current) => (current === key ? null : key));
      } else {
        const [themeKey] = key.split(".", 1);
        path = [titleCase(themeKey || ""), formatSubcategoryLabel(key, true)];
        value = investmentMix.subcategory_distribution[key] ?? 0;
        investment = { themeKey: themeKey || key, subcategoryKey: key };
        setInvestmentMixFocusTheme(themeKey || null);
      }

      const outcomes =
        type === "theme"
          ? [
              "Baseline allocation established",
              "Investment guardrails active",
              "High attribution confidence",
            ]
          : [
              "Sub-categorical focus enabled",
              "Categorization evidence: Strong",
              "Metric stability verified",
            ];

      setSelection({
        view: "investment_mix",
        path,
        key,
        metricValue: value,
        percentTotal: total > 0 ? (value / total) * 100 : 0,
        unit: investmentMix.unit ?? "units",
        investment,
        outcomes,
      });
    },
    [investmentMix, setSelection, setInvestmentMixFocusTheme],
  );

  const handleSankeyClick = useCallback(
    (item: {
      type: "node" | "link";
      name?: string;
      source?: string;
      target?: string;
      value?: number;
    }) => {
      const path =
        item.type === "link" ? [item.source ?? "", item.target ?? ""] : [item.name ?? ""];
      const total = dataset?.links.reduce((sum, l) => sum + l.value, 0) ?? 0;
      setSelection({
        view: "state_flow",
        path,
        metricValue: item.value ?? 0,
        percentTotal: total > 0 ? ((item.value ?? 0) / total) * 100 : 0,
        unit: dataset?.unit ?? "items",
        transition:
          item.type === "link" ? { from: item.source ?? "", to: item.target ?? "" } : undefined,
        outcomes: [
          "Transition efficiency: Optimal",
          "Loop detected: No",
          "Flow bottleneck risk: Low",
        ],
      });
    },
    [dataset, setSelection],
  );

  const handleAreaClick = useCallback(
    (params: { seriesName: string; date: string; value: number; percent: number }) => {
      const outcomesMap: Record<string, string[]> = {
        Planned: ["Delivery pace on track", "Scope alignment verified"],
        Unplanned: ["Incidental work spike detected", "Resource diversion noted"],
        Rework: ["Quality loop identified", "Fix verification in progress"],
        Abandonment: ["Sunken effort marked", "Strategic pivot confirmed"],
      };

      setSelection({
        view: "investment_expense",
        path: [params.seriesName, params.date],
        metricValue: params.value,
        percentTotal: params.percent,
        unit: "items",
        outcomes: outcomesMap[params.seriesName] ?? ["Metric observation recorded"],
      });
    },
    [setSelection],
  );

  return { handleTreemapClick, handleInvestmentMixClick, handleSankeyClick, handleAreaClick };
}

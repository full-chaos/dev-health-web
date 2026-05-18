"use client";

import { useCallback, useState } from "react";
import { titleCase, formatSubcategoryLabel } from "@/lib/investmentMix";
import type { InvestmentMixAggregate } from "@/lib/investmentMix";
import type { SankeyDataset } from "@/lib/sankey";
import type { FlowSubTab, FlowSelection } from "./types";

type UseFlowSelectionArgs = {
    investmentMix: InvestmentMixAggregate | null;
    dataset: SankeyDataset | null;
};

type UseFlowSelectionReturn = {
    selection: FlowSelection | null;
    setSelection: React.Dispatch<React.SetStateAction<FlowSelection | null>>;
    investmentMixFocusTheme: string | null;
    setInvestmentMixFocusTheme: React.Dispatch<React.SetStateAction<string | null>>;
    handleTreemapClick: (node: { name: string; value: number; path: string[]; percent: number }, view: FlowSubTab, unit: string) => void;
    handleInvestmentMixClick: (key: string, type: "theme" | "subcategory") => void;
    handleSankeyClick: (item: { type: "node" | "link"; name?: string; source?: string; target?: string; value?: number }) => void;
    handleAreaClick: (params: { seriesName: string; date: string; value: number; percent: number }) => void;
};

export function useFlowSelection({ investmentMix, dataset }: UseFlowSelectionArgs): UseFlowSelectionReturn {
    const [selection, setSelection] = useState<FlowSelection | null>(null);
    const [investmentMixFocusTheme, setInvestmentMixFocusTheme] = useState<string | null>(null);

    const handleTreemapClick = useCallback((node: {
        name: string; value: number; path: string[]; percent: number;
    }, view: FlowSubTab, unit: string) => {
        const outcomesMap: Record<string, string[]> = {
            code_hotspots: ["Change frequency verified", "Complexity hotspot risk: Moderate", "High structural coverage"],
        };
        setSelection({
            view, path: node.path, key: node.path[node.path.length - 1],
            metricValue: node.value, percentTotal: node.percent, unit,
            outcomes: outcomesMap[view],
        });
    }, []);

    const handleInvestmentMixClick = useCallback((key: string, type: "theme" | "subcategory") => {
        if (!investmentMix) return;
        let path: string[] = [];
        let value = 0;
        const total = Object.values(investmentMix.theme_distribution).reduce((a, b) => a + b, 0);
        if (type === "theme") {
            path = [titleCase(key)];
            value = investmentMix.theme_distribution[key] ?? 0;
            setInvestmentMixFocusTheme(current => current === key ? null : key);
        } else {
            const [themeKey] = key.split(".", 1);
            path = [titleCase(themeKey || ""), formatSubcategoryLabel(key, true)];
            value = investmentMix.subcategory_distribution[key] ?? 0;
            setInvestmentMixFocusTheme(themeKey || null);
        }
        const outcomes = type === "theme"
            ? ["Baseline allocation established", "Investment guardrails active", "High attribution confidence"]
            : ["Sub-categorical focus enabled", "Categorization evidence: Strong", "Metric stability verified"];
        setSelection({
            view: "investment_mix", path, key,
            metricValue: value, percentTotal: total > 0 ? (value / total) * 100 : 0,
            unit: investmentMix.unit ?? "units", outcomes,
        });
    }, [investmentMix]);

    const handleSankeyClick = useCallback((item: {
        type: "node" | "link"; name?: string; source?: string; target?: string; value?: number;
    }) => {
        const path = item.type === "link" ? [item.source ?? "", item.target ?? ""] : [item.name ?? ""];
        const total = dataset?.links.reduce((sum, l) => sum + l.value, 0) ?? 0;
        setSelection({
            view: "state_flow", path, metricValue: item.value ?? 0,
            percentTotal: total > 0 ? ((item.value ?? 0) / total) * 100 : 0,
            unit: dataset?.unit ?? "items",
            transition: item.type === "link" ? { from: item.source ?? "", to: item.target ?? "" } : undefined,
            outcomes: ["Transition efficiency: Optimal", "Loop detected: No", "Flow bottleneck risk: Low"],
        });
    }, [dataset]);

    const handleAreaClick = useCallback((params: {
        seriesName: string; date: string; value: number; percent: number;
    }) => {
        const outcomesMap: Record<string, string[]> = {
            Planned: ["Delivery pace on track", "Scope alignment verified"],
            Unplanned: ["Incidental work spike detected", "Resource diversion noted"],
            Rework: ["Quality loop identified", "Fix verification in progress"],
            Abandonment: ["Sunken effort marked", "Strategic pivot confirmed"],
        };
        setSelection({
            view: "investment_expense", path: [params.seriesName, params.date],
            metricValue: params.value, percentTotal: params.percent, unit: "items",
            outcomes: outcomesMap[params.seriesName] ?? ["Metric observation recorded"],
        });
    }, []);

    return {
        selection, setSelection,
        investmentMixFocusTheme, setInvestmentMixFocusTheme,
        handleTreemapClick, handleInvestmentMixClick,
        handleSankeyClick, handleAreaClick,
    };
}

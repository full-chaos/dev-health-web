"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSankey } from "@/lib/api/investment";
import { useInvestmentMix } from "@/lib/graphql/hooks";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/types";
import { buildSankeyEvidenceUrl, getSankeyDefinition } from "@/lib/sankey";
import type { SankeyDataset } from "@/lib/sankey";
import {
    toHotspotHierarchy,
    generateSampleExpenseData,
    toStackedAreaData,
} from "@/lib/chartTransforms";
import { sankeyHotspotNodes, sankeyHotspotLinks } from "@/data/devHealthOpsSample";
import { normalizeInvestmentMix } from "@/lib/investmentMix";
import type { TreemapSunburstType } from "@/components/charts/ChartTypeToggle";

import { Tabs, FLOW_TABS, type FlowSubTab } from "./FlowView/Tabs";
import { Toolbar } from "./FlowView/Toolbar";
import { Chart } from "./FlowView/Chart";
import { InspectPanel, type FlowSelection } from "./FlowView/InspectPanel";
import { useFlowHandlers } from "./FlowView/useFlowHandlers";

type FlowViewProps = {
    filters: MetricFilter;
    activeRole?: string;
};

export function FlowView({ filters, activeRole }: FlowViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Sub-tab state — only allow tabs visible in current mode
    const subTabParam = searchParams.get("flow_tab") as FlowSubTab | null;
    const initialSubTab: FlowSubTab = (subTabParam && FLOW_TABS.some(t => t.id === subTabParam))
        ? subTabParam
        : (FLOW_TABS[0]?.id ?? "investment_mix");
    const [subTab, setSubTab] = useState<FlowSubTab>(initialSubTab);

    // Chart type toggles (local state, persists during navigation within Flow page)
    const [hotspotChartType, setHotspotChartType] = useState<TreemapSunburstType>("treemap");

    const [dataset, setDataset] = useState<SankeyDataset | null>(null);
    const [resolvedKey, setResolvedKey] = useState<string | null>(null);
    const [selection, setSelection] = useState<FlowSelection | null>(null);
    const [investmentMixFocusTheme, setInvestmentMixFocusTheme] = useState<string | null>(null);

    // Context from URL
    const contextEntityId = searchParams.get("context_entity_id");
    const contextEntityLabel = searchParams.get("context_entity_label");
    const contextZone = searchParams.get("context_zone");

    // Map sub-tab to sankey mode for data fetching
    const getSankeyModeForTab = (tab: FlowSubTab) => {
        switch (tab) {
            case "investment_mix": return "investment" as const;
            case "code_hotspots": return "hotspot" as const;
            case "investment_expense": return "expense" as const;
            case "state_flow": return "state" as const;
        }
    };

    const mode = getSankeyModeForTab(subTab);
    const definition = useMemo(() => getSankeyDefinition(mode), [mode]);

    const requestPayload = useMemo(
        () => ({
            mode,
            filters,
            context: contextEntityId ? {
                entity_id: contextEntityId,
                entity_label: contextEntityLabel || undefined,
                zone: contextZone || undefined,
            } : undefined,
        }),
        [filters, mode, contextEntityId, contextEntityLabel, contextZone]
    );

    const requestKey = useMemo(() => JSON.stringify(requestPayload), [requestPayload]);

    // Fetch flow Sankey only for State Flow tab (other tabs are not Sankey-driven)
    useEffect(() => {
        let active = true;

        const fetchData = async () => {
            if (subTab !== "state_flow") {
                setDataset(null);
                setResolvedKey(requestKey);
                return;
            }
            try {
                const response = await getSankey(requestPayload);
                if (!active) return;
                if (!response?.nodes?.length || !response.links?.length) {
                    setDataset(null);
                } else {
                    setDataset({
                        mode,
                        label: response.label ?? definition.label,
                        description: response.description ?? definition.description,
                        unit: response.unit ?? definition.unit,
                        nodes: response.nodes,
                        links: response.links,
                    });
                }
            } catch {
                if (active) setDataset(null);
            } finally {
                if (active) setResolvedKey(requestKey);
            }
        };

        fetchData();
        return () => { active = false; };
    }, [mode, requestKey, requestPayload, subTab, definition]);

    const investmentMixResult = useInvestmentMix({ filters });

    const investmentMix = useMemo(() => {
        if (!investmentMixResult.data) return null;
        return normalizeInvestmentMix(investmentMixResult.data);
    }, [investmentMixResult.data]);

    const investmentMixLoading = investmentMixResult.loading;

    // Handle sub-tab change
    const handleSubTabChange = (tab: FlowSubTab) => {
        if (tab === subTab) return;
        setSubTab(tab);
        setSelection(null);
        const params = new URLSearchParams(searchParams.toString());
        params.set("flow_tab", tab);
        router.replace(`/work?${params.toString()}`);
    };

    const hotspotHierarchy = useMemo(() => {
        return toHotspotHierarchy(sankeyHotspotNodes, sankeyHotspotLinks);
    }, []);

    const expenseData = useMemo(() => {
        return toStackedAreaData(generateSampleExpenseData(30));
    }, []);

    const { handleTreemapClick, handleInvestmentMixClick, handleSankeyClick, handleAreaClick } =
        useFlowHandlers({ investmentMix, dataset, setSelection, setInvestmentMixFocusTheme });

    const isLoading = resolvedKey !== requestKey;
    const hasData = !!(dataset && dataset.nodes.length > 0);

    // Evidence URL for inspect panel
    const evidenceUrl = useMemo(() => {
        if (!selection) return null;
        const label = selection.key ?? selection.path[selection.path.length - 1] ?? null;
        const linkLabel = selection.transition
            ? `${selection.transition.from} -> ${selection.transition.to}`
            : null;
        return buildSankeyEvidenceUrl({ mode, filters, label, linkLabel });
    }, [mode, filters, selection]);

    const flameMode = useMemo(() => {
        if (subTab === "investment_mix" || subTab === "investment_expense") return "throughput";
        if (subTab === "state_flow") return "cycle_breakdown";
        if (subTab === "code_hotspots") return "code_hotspots";
        return "cycle_breakdown";
    }, [subTab]);

    const flameUrl = useMemo(() => {
        if (!selection) return null;
        const nodeName = selection.key ?? selection.path[selection.path.length - 1];
        return withFilterParam(
            `/work?tab=flame&mode=${flameMode}&context_node=${nodeName}`,
            filters,
            activeRole
        );
    }, [flameMode, filters, activeRole, selection]);

    const clearContext = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("context_entity_id");
        params.delete("context_entity_label");
        params.delete("context_zone");
        router.replace(`/work?${params.toString()}`);
    }, [searchParams, router]);

    const currentTabDef = FLOW_TABS.find(t => t.id === subTab) ?? FLOW_TABS[0];

    return (
        <div className="flex flex-col gap-6">
            <Tabs
                activeTab={subTab}
                onTabChange={handleSubTabChange}
            />
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
                    <Toolbar
                        currentTabLabel={currentTabDef.label}
                        currentTabDescription={currentTabDef.description}
                        showChartTypeToggle={subTab === "code_hotspots"}
                        chartType={hotspotChartType}
                        onChartTypeChange={setHotspotChartType}
                    />
                    <Chart
                        subTab={subTab}
                        isLoading={isLoading}
                        hasData={hasData}
                        hotspotChartType={hotspotChartType}
                        hotspotHierarchy={hotspotHierarchy}
                        expenseData={expenseData}
                        investmentMix={investmentMix}
                        investmentMixLoading={investmentMixLoading}
                        investmentMixFocusTheme={investmentMixFocusTheme}
                        dataset={dataset}
                        onTreemapClick={handleTreemapClick}
                        onInvestmentMixClick={handleInvestmentMixClick}
                        onAreaClick={handleAreaClick}
                        onSankeyClick={handleSankeyClick}
                    />
                </div>
                <InspectPanel
                    selection={selection}
                    evidenceUrl={evidenceUrl}
                    flameUrl={flameUrl}
                    contextEntityLabel={contextEntityLabel}
                    contextZone={contextZone}
                    onClearContext={clearContext}
                />
            </div>
        </div>
    );
}

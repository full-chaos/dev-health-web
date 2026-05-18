"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSankey } from "@/lib/api/investment";
import { useInvestmentMix } from "@/lib/graphql/hooks";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter, SankeyMode } from "@/lib/types";
import { buildSankeyEvidenceUrl, getSankeyDefinition, type SankeyDataset } from "@/lib/sankey";
import { toHotspotHierarchy, generateSampleExpenseData, toStackedAreaData } from "@/lib/chartTransforms";
import { sankeyHotspotNodes, sankeyHotspotLinks } from "@/data/devHealthOpsSample";
import { normalizeInvestmentMix } from "@/lib/investmentMix";
import type { TreemapSunburstType } from "@/components/charts/ChartTypeToggle";
import { publicEnv } from "@/lib/config";

import { FlowTabs } from "./FlowView/Tabs";
import { FlowToolbar } from "./FlowView/Toolbar";
import { FlowChart } from "./FlowView/Chart";
import { FlowInspectPanel } from "./FlowView/InspectPanel";
import { useFlowSelection } from "./FlowView/useFlowSelection";
import { ALL_FLOW_TABS, type FlowSubTab } from "./FlowView/types";

const DEMO_MODE = publicEnv.NEXT_PUBLIC_DEMO_MODE === "true";
const FLOW_TABS = ALL_FLOW_TABS.filter((t) => !t.demoOnly || DEMO_MODE);

const SANKEY_MODE_MAP: Record<FlowSubTab, SankeyMode> = {
    investment_mix: "investment",
    code_hotspots: "hotspot",
    investment_expense: "expense",
    state_flow: "state",
};

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
    const [hotspotChartType, setHotspotChartType] = useState<TreemapSunburstType>("treemap");
    const [dataset, setDataset] = useState<SankeyDataset | null>(null);
    const [resolvedKey, setResolvedKey] = useState<string | null>(null);

    // Context from URL
    const contextEntityId = searchParams.get("context_entity_id");
    const contextEntityLabel = searchParams.get("context_entity_label");
    const contextZone = searchParams.get("context_zone");

    const mode = SANKEY_MODE_MAP[subTab];
    const definition = useMemo(() => getSankeyDefinition(mode), [mode]);

    const requestPayload = useMemo(
        () => ({
            mode, filters,
            context: contextEntityId ? {
                entity_id: contextEntityId,
                entity_label: contextEntityLabel || undefined,
                zone: contextZone || undefined,
            } : undefined,
        }),
        [filters, mode, contextEntityId, contextEntityLabel, contextZone]
    );
    const requestKey = useMemo(() => JSON.stringify(requestPayload), [requestPayload]);

    // Fetch flow Sankey only for State Flow tab
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

    const {
        selection, setSelection,
        investmentMixFocusTheme,
        handleTreemapClick, handleInvestmentMixClick,
        handleSankeyClick, handleAreaClick,
    } = useFlowSelection({ investmentMix, dataset });

    // Handle sub-tab change (also resets selection)
    const handleSubTabChange = (tab: FlowSubTab) => {
        if (tab === subTab) return;
        setSubTab(tab);
        setSelection(null);
        const params = new URLSearchParams(searchParams.toString());
        params.set("flow_tab", tab);
        router.replace(`/work?${params.toString()}`);
    };

    const handleClearContext = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("context_entity_id");
        params.delete("context_entity_label");
        params.delete("context_zone");
        router.replace(`/work?${params.toString()}`);
    }, [router, searchParams]);

    const hotspotHierarchy = useMemo(() =>
        toHotspotHierarchy(sankeyHotspotNodes, sankeyHotspotLinks), []);
    const expenseData = useMemo(() =>
        toStackedAreaData(generateSampleExpenseData(30)), []);

    const isLoading = resolvedKey !== requestKey;
    const hasData = Boolean(dataset && dataset.nodes.length > 0);

    const evidenceUrl = useMemo(() => {
        if (!selection) return null;
        const label = selection.key ?? selection.path[selection.path.length - 1] ?? null;
        const linkLabel = selection.transition ? `${selection.transition.from} -> ${selection.transition.to}` : null;
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
        return withFilterParam(`/work?tab=flame&mode=${flameMode}&context_node=${nodeName}`, filters, activeRole);
    }, [flameMode, filters, activeRole, selection]);

    const currentTabDef = FLOW_TABS.find(t => t.id === subTab) ?? FLOW_TABS[0];

    return (
        <div className="flex flex-col gap-6">
            <FlowTabs tabs={FLOW_TABS} activeTab={subTab} onTabChange={handleSubTabChange} />
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
                    <FlowToolbar
                        currentTabLabel={currentTabDef.label}
                        currentTabDescription={currentTabDef.description}
                        showChartTypeToggle={subTab === "code_hotspots"}
                        chartType={hotspotChartType}
                        onChartTypeChange={setHotspotChartType}
                    />
                    <FlowChart
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
                <FlowInspectPanel
                    selection={selection}
                    evidenceUrl={evidenceUrl}
                    flameUrl={flameUrl}
                    contextEntityLabel={contextEntityLabel}
                    contextZone={contextZone}
                    onClearContext={handleClearContext}
                />
            </div>
        </div>
    );
}

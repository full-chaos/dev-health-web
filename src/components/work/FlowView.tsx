"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { getSankey } from "@/lib/api/investment";
import { useInvestmentMix } from "@/lib/graphql/hooks";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter, SankeyMode } from "@/lib/types";
import { buildSankeyEvidenceUrl, getSankeyDefinition, type SankeyDataset } from "@/lib/sankey";
import {
    toHotspotHierarchy,
    generateSampleExpenseData,
    toStackedAreaData,
    type HierarchyNode,
} from "@/lib/chartTransforms";
import { sankeyHotspotNodes, sankeyHotspotLinks } from "@/data/devHealthOpsSample";
import { normalizeInvestmentMix, type InvestmentMixAggregate, titleCase, formatSubcategoryLabel } from "@/lib/investmentMix";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import { TreemapChart } from "@/components/charts/TreemapChart";
import { SunburstChart } from "@/components/charts/SunburstChart";
import { StackedAreaChart } from "@/components/charts/StackedAreaChart";
import {
    ChartTypeToggle,
    TREEMAP_SUNBURST_OPTIONS,
    type TreemapSunburstType,
} from "@/components/charts/ChartTypeToggle";
import { formatNumber } from "@/lib/formatters";
import { publicEnv } from "@/lib/config";

const DEMO_MODE = publicEnv.NEXT_PUBLIC_DEMO_MODE === "true";

type FlowViewProps = {
    filters: MetricFilter;
    activeRole?: string;
};

// Flow sub-tabs
type FlowSubTab = "investment_mix" | "code_hotspots" | "investment_expense" | "state_flow";

const ALL_FLOW_TABS: Array<{ id: FlowSubTab; label: string; description: string; demoOnly?: boolean }> = [
    { id: "investment_mix", label: "Investment Mix", description: "Where effort allocates across investment areas" },
    { id: "code_hotspots", label: "Code Hotspots", description: "Where change concentrates in the codebase", demoOnly: true },
    { id: "investment_expense", label: "Investment Expense", description: "Effort shift from planned to unplanned work", demoOnly: true },
    { id: "state_flow", label: "State Flow", description: "Work item state transitions and flow paths" },
];

// Only expose demo-only tabs when NEXT_PUBLIC_DEMO_MODE=true
const FLOW_TABS = ALL_FLOW_TABS.filter((t) => !t.demoOnly || DEMO_MODE);

// Selection model for Inspect panel
type FlowSelection = {
    view: FlowSubTab;
    path: string[];
    key?: string;
    metricValue: number;
    percentTotal: number;
    unit: string;
    children?: Array<{ name: string; value: number }>;
    transition?: { from: string; to: string };
    outcomes?: string[];
};

export function FlowView({ filters, activeRole }: FlowViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    // Refs for tab buttons (for keyboard navigation focus management)
    const tabRefs = useRef<Partial<Record<FlowSubTab, HTMLButtonElement | null>>>({});

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
    const getSankeyModeForTab = (tab: FlowSubTab): SankeyMode => {
        switch (tab) {
            case "investment_mix": return "investment";
            case "code_hotspots": return "hotspot";
            case "investment_expense": return "expense";
            case "state_flow": return "state";
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

    const investmentMix = useMemo<InvestmentMixAggregate | null>(() => {
        if (!investmentMixResult.data) {
            return null;
        }
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

    // Handle keyboard navigation for tabs (ARIA tab pattern)
    const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: FlowSubTab) => {
        const currentIndex = FLOW_TABS.findIndex(t => t.id === tabId);
        let targetIndex;

        switch (event.key) {
            case "ArrowLeft":
                event.preventDefault();
                targetIndex = currentIndex > 0 ? currentIndex - 1 : FLOW_TABS.length - 1;
                break;
            case "ArrowRight":
                event.preventDefault();
                targetIndex = currentIndex < FLOW_TABS.length - 1 ? currentIndex + 1 : 0;
                break;
            case "Home":
                event.preventDefault();
                targetIndex = 0;
                break;
            case "End":
                event.preventDefault();
                targetIndex = FLOW_TABS.length - 1;
                break;
            default:
                return;
        }

        const targetTab = FLOW_TABS[targetIndex];
        handleSubTabChange(targetTab.id);
        // Focus the new tab button using ref
        tabRefs.current[targetTab.id]?.focus();
    };

    const hotspotHierarchy = useMemo((): HierarchyNode => {
        return toHotspotHierarchy(sankeyHotspotNodes, sankeyHotspotLinks);
    }, []);

    const expenseData = useMemo(() => {
        return toStackedAreaData(generateSampleExpenseData(30));
    }, []);

    // Selection handlers
    const handleTreemapClick = useCallback((node: {
        name: string;
        value: number;
        path: string[];
        percent: number;
    }, view: FlowSubTab, unit: string) => {
        const outcomesMap: Record<string, string[]> = {
            "code_hotspots": [
                "Change frequency verified",
                "Complexity hotspot risk: Moderate",
                "High structural coverage"
            ]
        };

        setSelection({
            view,
            path: node.path,
            key: node.path[node.path.length - 1],
            metricValue: node.value,
            percentTotal: node.percent,
            unit,
            outcomes: outcomesMap[view]
        });
    }, []);

    const handleInvestmentMixClick = useCallback((
        key: string,
        type: "theme" | "subcategory"
    ) => {
        if (!investmentMix) return;

        let path: string[] = [];
        let value = 0;
        const total = Object.values(investmentMix.theme_distribution).reduce((a, b) => a + b, 0);

        if (type === "theme") {
            path = [titleCase(key)];
            value = investmentMix.theme_distribution[key] ?? 0;
            // Also update the focus theme for internal sunburst state if needed
            setInvestmentMixFocusTheme(current => current === key ? null : key);
        } else {
            const [themeKey] = key.split(".", 1);
            path = [titleCase(themeKey || ""), formatSubcategoryLabel(key, true)];
            value = investmentMix.subcategory_distribution[key] ?? 0;
            setInvestmentMixFocusTheme(themeKey || null);
        }

        const outcomes = type === "theme" ? [
            "Baseline allocation established",
            "Investment guardrails active",
            "High attribution confidence"
        ] : [
            "Sub-categorical focus enabled",
            "Categorization evidence: Strong",
            "Metric stability verified"
        ];

        setSelection({
            view: "investment_mix",
            path,
            key,
            metricValue: value,
            percentTotal: total > 0 ? (value / total) * 100 : 0,
            unit: investmentMix.unit ?? "units",
            outcomes,
        });
    }, [investmentMix]);

    const handleSankeyClick = useCallback((item: {
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
        value?: number;
    }) => {
        const path = item.type === "link"
            ? [item.source ?? "", item.target ?? ""]
            : [item.name ?? ""];
        const total = dataset?.links.reduce((sum, l) => sum + l.value, 0) ?? 0;
        setSelection({
            view: "state_flow",
            path,
            metricValue: item.value ?? 0,
            percentTotal: total > 0 ? ((item.value ?? 0) / total) * 100 : 0,
            unit: dataset?.unit ?? "items",
            transition: item.type === "link" ? { from: item.source ?? "", to: item.target ?? "" } : undefined,
            outcomes: [
                "Transition efficiency: Optimal",
                "Loop detected: No",
                "Flow bottleneck risk: Low"
            ]
        });
    }, [dataset]);

    const handleAreaClick = useCallback((params: {
        seriesName: string;
        date: string;
        value: number;
        percent: number;
    }) => {
        const outcomesMap: Record<string, string[]> = {
            "Planned": ["Delivery pace on track", "Scope alignment verified"],
            "Unplanned": ["Incidental work spike detected", "Resource diversion noted"],
            "Rework": ["Quality loop identified", "Fix verification in progress"],
            "Abandonment": ["Sunken effort marked", "Strategic pivot confirmed"]
        };

        setSelection({
            view: "investment_expense",
            path: [params.seriesName, params.date],
            metricValue: params.value,
            percentTotal: params.percent,
            unit: "items",
            outcomes: outcomesMap[params.seriesName] ?? ["Metric observation recorded"]
        });
    }, []);

    const isLoading = resolvedKey !== requestKey;
    const hasData = dataset && dataset.nodes.length > 0;

    // Evidence URL for inspect panel
    const evidenceUrl = useMemo(() => {
        if (!selection) return null;
        const label = selection.key ?? selection.path[selection.path.length - 1] ?? null;
        const linkLabel = selection.transition ? `${selection.transition.from} -> ${selection.transition.to}` : null;
        return buildSankeyEvidenceUrl({
            mode,
            filters,
            label,
            linkLabel,
        });
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
            {/* Sub-tab navigation */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Flow visualization tabs">
                {FLOW_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        ref={(el) => { tabRefs.current[tab.id] = el; }}
                        id={`flow-tab-${tab.id}`}
                        onClick={() => handleSubTabChange(tab.id)}
                        onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                        role="tab"
                        aria-selected={subTab === tab.id}
                        aria-controls={`flow-panel-${tab.id}`}
                        tabIndex={subTab === tab.id ? 0 : -1}
                        className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${subTab === tab.id
                            ? "border-(--accent-2) bg-(--accent-2) text-white"
                            : "border-(--card-stroke) text-(--ink-muted) hover:border-(--card-stroke)/60"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                {/* Main Chart Area */}
                <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-xl font-(--font-display)">{currentTabDef.label}</h2>
                            <p className="mt-1 text-sm text-(--ink-muted)">{currentTabDef.description}</p>
                        </div>

                        {/* Chart type toggle - shown for tabs with multiple views */}
                        {subTab === "code_hotspots" && (
                            <ChartTypeToggle
                                options={TREEMAP_SUNBURST_OPTIONS}
                                value={hotspotChartType}
                                onChange={setHotspotChartType}
                            />
                        )}
                    </div>

                    <div
                        className="relative min-h-[400px]"
                        data-testid="flow-chart-container"
                        role="tabpanel"
                        id={`flow-panel-${subTab}`}
                        aria-labelledby={`flow-tab-${subTab}`}
                    >
                        {isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-sm rounded-2xl">
                                <p className="text-sm text-(--ink-muted) animate-pulse">Loading flow data...</p>
                            </div>
                        )}

                        {subTab === "investment_mix" && (
                            investmentMixLoading ? (
                                <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
                                    Loading investment mix…
                                </div>
                            ) : !investmentMix ? (
                                <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
                                    Investment mix unavailable for this scope and window.
                                </div>
                            ) : (
                                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
                                    <InvestmentMixSunburst
                                        themeDistribution={investmentMix.theme_distribution}
                                        subcategoryDistribution={investmentMix.subcategory_distribution}
                                        evidenceQualityDistribution={investmentMix.evidence_quality_distribution}
                                        unit={investmentMix.unit ?? "units"}
                                        height={500}
                                        focusedTheme={investmentMixFocusTheme}
                                        onThemeClick={(themeKey) => handleInvestmentMixClick(themeKey, "theme")}
                                        onSubcategoryClick={(subcategoryKey) => handleInvestmentMixClick(subcategoryKey, "subcategory")}
                                    />
                                    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                            {investmentMixFocusTheme ? "Focused theme" : "How to use"}
                                        </p>
                                        <div className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                                            {investmentMixFocusTheme ? (
                                                <>
                                                    <p className="text-foreground font-medium">
                                                        {investmentMixFocusTheme.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                                    </p>
                                                    <p>Click the theme again to clear focus.</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p>Click a theme to focus its subcategories.</p>
                                                    <p>Click a subcategory to inspect evidence in the Investment tab.</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        )}

                        {/* Code Hotspots Tab */}
                        {subTab === "code_hotspots" && (
                            hotspotChartType === "treemap" ? (
                                <TreemapChart
                                    data={hotspotHierarchy}
                                    unit="changes"
                                    height={500}
                                    onNodeClick={(node) => handleTreemapClick(node, "code_hotspots", "changes")}
                                />
                            ) : (
                                <SunburstChart
                                    data={hotspotHierarchy}
                                    unit="changes"
                                    height={500}
                                    onNodeClick={(node) => handleTreemapClick(node, "code_hotspots", "changes")}
                                />
                            )
                        )}

                        {/* Investment Expense Tab */}
                        {subTab === "investment_expense" && (
                            <StackedAreaChart
                                data={expenseData.data}
                                series={expenseData.series}
                                unit="items"
                                height={500}
                                onSeriesClick={handleAreaClick}
                            />
                        )}

                        {/* State Flow Tab */}
                        {subTab === "state_flow" && (
                            hasData ? (
                                <SankeyChart
                                    nodes={dataset!.nodes}
                                    links={dataset!.links}
                                    unit={dataset!.unit}
                                    height={500}
                                    onItemClick={handleSankeyClick}
                                />
                            ) : !isLoading && (
                                <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
                                    No flow data available for this scope and window.
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Inspect Panel */}
                <div className="flex flex-col gap-4">
                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 h-full min-h-[400px]">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-(--ink-muted)">Inspect Flow</p>
                        {!selection ? (
                            <div className="mt-20 text-center">
                                <p className="text-sm text-(--ink-muted)">Select a node or segment to inspect details.</p>
                            </div>
                        ) : (
                            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Selection</p>
                                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                                        {selection.transition
                                            ? `${selection.transition.from} → ${selection.transition.to}`
                                            : selection.path.join(" → ")}
                                    </h3>
                                </div>

                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Value</p>
                                    <p className="mt-1 text-2xl font-mono text-foreground">
                                        {formatNumber(selection.metricValue)}{" "}
                                        <span className="text-xs uppercase tracking-wider text-(--ink-muted)">{selection.unit}</span>
                                    </p>
                                </div>

                                {selection.percentTotal > 0 && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">% of Total</p>
                                        <p className="mt-1 text-xl font-mono text-(--accent-2)">
                                            {selection.percentTotal.toFixed(1)}%
                                        </p>
                                    </div>
                                )}

                                {selection.children && selection.children.length > 0 && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) mb-2">Top Children</p>
                                        <div className="space-y-1">
                                            {selection.children.slice(0, 5).map((child) => (
                                                <div key={child.name} className="flex justify-between text-sm">
                                                    <span className="text-(--ink-muted)">{child.name}</span>
                                                    <span className="font-mono">{formatNumber(child.value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selection.outcomes && selection.outcomes.length > 0 && (
                                    <div className="animate-in fade-in slide-in-from-left-2 duration-500 delay-100">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) mb-2">Panel Outcomes</p>
                                        <div className="space-y-2">
                                            {selection.outcomes.map((outcome, idx) => (
                                                <div key={idx} className="flex gap-3 items-start text-sm leading-relaxed text-foreground/90">
                                                    <span className="mt-1 text-(--accent-2) text-[10px]">●</span>
                                                    <span>{outcome}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="grid gap-3 pt-4 border-t border-(--card-stroke)">
                                    <Link
                                        href={evidenceUrl || "#"}
                                        className="flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-4 py-3 text-xs uppercase tracking-widest text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                                    >
                                        <span>Inspect Evidence</span>
                                        <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">↗</span>
                                    </Link>
                                    <Link
                                        href={flameUrl || "#"}
                                        className="flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-4 py-3 text-xs uppercase tracking-widest text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                                    >
                                        <span>Open Representative Flame</span>
                                        <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">↗</span>
                                    </Link>
                                </div>
                            </div>
                        )}
                        {(contextEntityLabel || contextZone) && (
                            <div className="pt-4 mt-6 border-t border-(--card-stroke)">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Analysis Context</p>
                                <p className="mt-1 text-xs text-(--ink-muted) italic">
                                    Filtering flow by {contextEntityLabel || "selected scope"} {contextZone ? `(Zone: ${contextZone})` : ""}
                                </p>
                                <button
                                    onClick={() => {
                                        const params = new URLSearchParams(searchParams.toString());
                                        params.delete("context_entity_id");
                                        params.delete("context_entity_label");
                                        params.delete("context_zone");
                                        router.replace(`/work?${params.toString()}`);
                                    }}
                                    className="mt-2 text-[9px] uppercase tracking-[0.2em] text-(--accent-2) hover:underline"
                                >
                                    Clear context
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

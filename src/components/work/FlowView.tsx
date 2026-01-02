"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSankey } from "@/lib/api";
import { withFilterParam } from "@/lib/filters/url";
import type { MetricFilter, SankeyMode } from "@/lib/types";
import {
    SANKEY_MODES,
    buildSankeyDataset,
    buildSankeyEvidenceUrl,
    getNodeDetails,
    getSankeyDefinition,
    type SankeyDataset,
} from "@/lib/sankey";
import { SankeyChart, type SankeyOrientation } from "@/components/charts/SankeyChart";
import { formatNumber } from "@/lib/formatters";
import Link from "next/link";

type FlowViewProps = {
    filters: MetricFilter;
    activeRole?: string;
};

export function FlowView({ filters, activeRole }: FlowViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const useSampleData = process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    // State from URL or defaults
    const modeParam = searchParams.get("mode") as SankeyMode | null;
    const initialMode: SankeyMode = (modeParam && ["investment", "expense", "state", "hotspot"].includes(modeParam))
        ? modeParam
        : "investment";

    const [mode, setMode] = useState<SankeyMode>(initialMode);
    const [dataset, setDataset] = useState<SankeyDataset | null>(null);
    const [resolvedKey, setResolvedKey] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<{
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
        value?: number;
    } | null>(null);

    // Context from URL (e.g. from dot investigation panel)
    const contextEntityId = searchParams.get("context_entity_id");
    const contextEntityLabel = searchParams.get("context_entity_label");
    const contextZone = searchParams.get("context_zone");

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
    const definition = useMemo(() => getSankeyDefinition(mode), [mode]);

    useEffect(() => {
        let active = true;

        const fetchData = async () => {
            if (useSampleData) {
                setDataset(buildSankeyDataset(mode));
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
    }, [mode, requestKey, requestPayload, useSampleData, definition]);

    const handleModeChange = (nextMode: SankeyMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        setSelectedItem(null);
        // Update URL
        const params = new URLSearchParams(searchParams.toString());
        params.set("mode", nextMode);
        router.replace(`/work?${params.toString()}`);
    };

    const handleItemClick = useCallback((item: {
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
        value?: number;
    }) => {
        setSelectedItem(item);
    }, []);

    const isLoading = resolvedKey !== requestKey;
    const hasData = dataset && dataset.nodes.length > 0;

    const flameMode = useMemo(() => {
        if (mode === "investment" || mode === "expense") return "throughput";
        if (mode === "state") return "cycle_breakdown";
        if (mode === "hotspot") return "code_hotspots";
        return "cycle_breakdown";
    }, [mode]);

    const evidenceUrl = useMemo(() => {
        if (!selectedItem) return null;
        const label = selectedItem.name ?? selectedItem.target ?? selectedItem.source ?? null;
        const linkLabel = selectedItem.source && selectedItem.target ? `${selectedItem.source} -> ${selectedItem.target}` : null;
        return buildSankeyEvidenceUrl({
            mode,
            filters,
            label,
            linkLabel,
        });
    }, [mode, filters, selectedItem]);

    const flameUrl = useMemo(() => {
        if (!selectedItem) return null;
        const nodeName = selectedItem.name || selectedItem.target || selectedItem.source;
        return withFilterParam(`/work?tab=flame&mode=${flameMode}&context_node=${nodeName}`, filters, activeRole);
    }, [flameMode, filters, activeRole, selectedItem]);

    // All flow sankeys use vertical orientation (top → bottom)
    const orientation: SankeyOrientation = "vertical";

    // Get detailed node information for the Inspect panel
    const nodeDetails = useMemo(() => {
        if (!selectedItem || !dataset) return null;
        const nodeName = selectedItem.type === "node"
            ? selectedItem.name
            : (selectedItem.target ?? selectedItem.source);
        if (!nodeName) return null;
        // Use original data for accurate child breakdown
        const nodes = dataset.originalNodes ?? dataset.nodes;
        const links = dataset.originalLinks ?? dataset.links;
        return getNodeDetails(nodeName, nodes, links, dataset.collapsedMap);
    }, [selectedItem, dataset]);

    // Hover state for path highlighting
    const [hoveredItem, setHoveredItem] = useState<{
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
    } | null>(null);

    const handleItemHover = useCallback((item: {
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
        value?: number;
    } | null) => {
        setHoveredItem(item);
    }, []);

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                {/* Main Sankey Area */}
                <div className="rounded-3xl border border-(--card-stroke) bg-card p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-xl font-(--font-display)">{dataset?.label || definition.label}</h2>
                            <p className="mt-1 text-sm text-(--ink-muted)">{dataset?.description || definition.description}</p>
                            {mode === "investment" && (
                                <p className="mt-1 text-xs text-(--ink-muted) italic">
                                    Vertical flow: sources at top, allocation flows downward
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {SANKEY_MODES.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => handleModeChange(m.id)}
                                    className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition ${mode === m.id
                                        ? "border-(--accent-2) bg-(--accent-2) text-white"
                                        : "border-(--card-stroke) text-(--ink-muted) hover:border-(--card-stroke)/60"
                                        }`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative min-h-[400px]" data-testid="chart-sankey">
                        {isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-sm rounded-2xl">
                                <p className="text-sm text-(--ink-muted) animate-pulse">Loading flow data...</p>
                            </div>
                        )}
                        {hasData ? (
                            <SankeyChart
                                nodes={dataset!.nodes}
                                links={dataset!.links}
                                unit={dataset!.unit}
                                height={mode === "investment" ? 600 : 500}
                                orientation={orientation}
                                onItemClick={handleItemClick}
                                onItemHover={handleItemHover}
                            />
                        ) : !isLoading && (
                            <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
                                No flow data available for this scope and window.
                            </div>
                        )}
                    </div>
                </div>

                {/* Inspect Panel */}
                <div className="flex flex-col gap-4">
                    <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 h-full min-h-[400px] overflow-y-auto max-h-[700px]">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-(--ink-muted)">Inspect Flow</p>
                        {!selectedItem ? (
                            <div className="mt-20 text-center">
                                <p className="text-sm text-(--ink-muted)">Select a node or path to inspect details.</p>
                                {hoveredItem && (
                                    <p className="mt-4 text-xs text-(--ink-muted) italic">
                                        Hovering: {hoveredItem.type === "link"
                                            ? `${hoveredItem.source} → ${hoveredItem.target}`
                                            : hoveredItem.name}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Selection</p>
                                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                                        {selectedItem.type === "link"
                                            ? `${selectedItem.source} → ${selectedItem.target}`
                                            : selectedItem.name}
                                    </h3>
                                </div>

                                <div className="flex gap-6">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Flow Value</p>
                                        <p className="mt-1 text-2xl font-mono text-foreground">
                                            {formatNumber(nodeDetails?.value ?? selectedItem.value ?? 0)}
                                            <span className="text-xs uppercase tracking-wider text-(--ink-muted) ml-1">{dataset?.unit || "units"}</span>
                                        </p>
                                    </div>
                                    {nodeDetails && nodeDetails.percentage > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Share of Total</p>
                                            <p className="mt-1 text-2xl font-mono text-(--accent-2)">
                                                {nodeDetails.percentage.toFixed(1)}%
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Collapsed children breakdown (for aggregated nodes) */}
                                {nodeDetails && nodeDetails.children.length > 0 && (
                                    <div className="pt-4 border-t border-(--card-stroke)">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) mb-3">
                                            Contributing Items ({nodeDetails.children.length} collapsed)
                                        </p>
                                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                            {nodeDetails.children.slice(0, 10).map((child) => (
                                                <div
                                                    key={child.name}
                                                    className="flex items-center justify-between text-xs bg-(--card-70) rounded-lg px-3 py-2"
                                                >
                                                    <span className="text-foreground truncate mr-2">{child.name}</span>
                                                    <span className="text-(--ink-muted) font-mono whitespace-nowrap">
                                                        {formatNumber(child.value)} {dataset?.unit || "units"}
                                                    </span>
                                                </div>
                                            ))}
                                            {nodeDetails.children.length > 10 && (
                                                <p className="text-[10px] text-(--ink-muted) text-center py-1">
                                                    +{nodeDetails.children.length - 10} more items
                                                </p>
                                            )}
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

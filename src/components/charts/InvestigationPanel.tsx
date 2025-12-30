"use client";

import Link from "next/link";
import { useActiveRole } from "@/components/RoleSelector";
import { getRoleConfig } from "@/lib/roleContext";
import { findZoneMatches, getZoneOverlay } from "@/lib/quadrantZones";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { QuadrantPoint, QuadrantResponse, MetricFilter } from "@/lib/types";
import { useMemo, useState } from "react";
import { SankeyInvestigationPanel } from "./SankeyInvestigationPanel";

type InvestigationPanelProps = {
    point: QuadrantPoint;
    data: QuadrantResponse;
    filters: MetricFilter;
    onClose: () => void;
};

export function InvestigationPanel({
    point,
    data,
    filters,
    onClose,
}: InvestigationPanelProps) {
    const [showSankey, setShowSankey] = useState(false);
    const { activeRole } = useActiveRole();
    const roleConfig = getRoleConfig(activeRole);

    const zoneOverlay = useMemo(() => getZoneOverlay(data), [data]);
    const zoneMatches = useMemo(() =>
        zoneOverlay ? findZoneMatches(zoneOverlay, point) : [],
        [zoneOverlay, point]
    );

    // Link construction logic moved from QuadrantPanel
    const metricExplainHref = point.evidence_link
        ? buildExploreUrl({ api: point.evidence_link, filters })
        : buildExploreUrl({ metric: data.axes.y.metric, filters });

    const cycleBreakdownFlameHref = withFilterParam("/flame?mode=cycle_breakdown", filters);
    const throughputFlameHref = withFilterParam("/flame?mode=throughput", filters);
    const hotspotsFlameHref = withFilterParam("/flame?mode=code_hotspots", filters);

    const heatmapPath = useMemo(() => {
        const metrics = new Set([data.axes.x.metric, data.axes.y.metric]);
        if (metrics.has("churn")) return "/code";
        return "/work";
    }, [data.axes]);
    const heatmapHref = withFilterParam(heatmapPath, filters);

    const investmentHref = withFilterParam("/investment", filters);

    const investigationPaths = useMemo(() => {
        const paths = [
            { id: "explain", label: "Open metric explain", href: metricExplainHref, type: "review" },
            { id: "heatmaps", label: "View related heatmaps", href: heatmapHref, type: "wip" },
            { id: "cycle", label: "Cycle Breakdown Flame", href: cycleBreakdownFlameHref, type: "cycle" },
            { id: "throughput", label: "Throughput Flame", href: throughputFlameHref, type: "delivery" },
            { id: "hotspots", label: "Code Hotspots Flame", href: hotspotsFlameHref, type: "churn" },
            { id: "investment", label: "View investment flow", href: investmentHref, type: "investment" },
        ];

        // Reorder based on roleConfig.investigationOrder
        const sorted = [...paths].sort((a, b) => {
            const indexA = roleConfig.investigationOrder.indexOf(a.type);
            const indexB = roleConfig.investigationOrder.indexOf(b.type);

            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        return sorted;
    }, [roleConfig, metricExplainHref, heatmapHref, cycleBreakdownFlameHref, throughputFlameHref, hotspotsFlameHref, investmentHref]);

    const primaryType = roleConfig.investigationOrder[0];

    return (
        <div className="flex h-full flex-col bg-[var(--card-80)] text-xs shadow-xl animate-in fade-in slide-in-from-right-4 duration-300">
            <header className="flex items-center justify-between border-b border-[var(--card-stroke)] p-4">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                        Investigation
                    </p>
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">
                        {point.entity_label}
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-full border border-[var(--card-stroke)] p-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)] hover:bg-[var(--card-70)]"
                    title="Close panel"
                >
                    ✕
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {showSankey ? (
                    <section className="space-y-4">
                        <button
                            onClick={() => setShowSankey(false)}
                            className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--accent-2)] hover:text-[var(--foreground)]"
                        >
                            ← Back to summary
                        </button>
                        <SankeyInvestigationPanel
                            point={point}
                            filters={filters}
                        />
                    </section>
                ) : (
                    <>
                        {/* Summary Section */}
                        <section>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-muted)] mb-2">
                                Summary
                            </p>
                            <p className="text-[13px] leading-relaxed text-[var(--foreground)]">
                                <span className="font-semibold text-[var(--accent-2)]">{roleConfig.framing}.</span> Observed operating mode for <span className="font-semibold">{point.entity_label}</span> during
                                the window of {point.window_start} to {point.window_end}.
                            </p>
                        </section>

                        {/* ... (Pattern Identification Section) */}

                        {/* Investigation Paths Section */}
                        <section>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-muted)] mb-3">
                                Investigation Paths
                            </p>
                            <div className="grid gap-2">
                                {investigationPaths.map((path) => {
                                    const isSuggested = path.type === primaryType;
                                    const isSankeyToggle = path.id === "investment";

                                    const content = (
                                        <div className="flex flex-col gap-0.5 text-left">
                                            {isSuggested && (
                                                <span className="text-[9px] uppercase tracking-wider text-[var(--accent-2)] font-bold">
                                                    Suggested for {roleConfig.shortLabel}
                                                </span>
                                            )}
                                            <span className="text-[12px] font-medium text-[var(--foreground)] group-hover:text-[var(--accent-2)]">
                                                {path.label}
                                            </span>
                                        </div>
                                    );

                                    const className = `group flex items-center justify-between rounded-xl border px-4 py-3 transition ${isSuggested
                                        ? "border-[var(--accent-2)] bg-[var(--accent-2)]/5"
                                        : "border-[var(--card-stroke)] bg-[var(--card)] hover:border-[var(--accent-2)]/40 hover:bg-[var(--accent-2)]/5"
                                        }`;

                                    if (isSankeyToggle) {
                                        return (
                                            <button
                                                key={path.id}
                                                onClick={() => setShowSankey(true)}
                                                className={className}
                                            >
                                                {content}
                                                <span className="text-[10px] text-[var(--accent-2)] opacity-0 transition-opacity group-hover:opacity-100 uppercase tracking-widest">
                                                    View Flow ↘
                                                </span>
                                            </button>
                                        );
                                    }

                                    return (
                                        <Link
                                            key={path.id}
                                            href={path.href}
                                            className={className}
                                        >
                                            {content}
                                            <span className="text-[10px] text-[var(--accent-2)] opacity-0 transition-opacity group-hover:opacity-100 uppercase tracking-widest">
                                                Open ↗
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </section>
                    </>
                )}
            </div>

            <footer className="border-t border-[var(--card-stroke)] p-4 bg-[var(--card-90)]">
                <p className="text-[10px] text-[var(--ink-muted)] text-center font-medium">
                    Role context: {roleConfig.label}
                </p>
            </footer>
        </div>
    );
}

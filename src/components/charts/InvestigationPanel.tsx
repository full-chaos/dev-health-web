"use client";

import Link from "next/link";
import { useActiveRole } from "@/components/RoleSelector";
import { getRoleConfig } from "@/lib/roleContext";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { useMemo } from "react";

type InvestigationPanelProps = {
    point: QuadrantPoint;
    data: QuadrantResponse;
    filters: MetricFilter;
    onClose: () => void;
    title?: string;
};

export function InvestigationPanel({
    point,
    data,
    filters,
    onClose,
    title,
}: InvestigationPanelProps) {
    const activeRole = useActiveRole();
    const roleConfig = getRoleConfig(activeRole);


    const metricExplainHref = point.evidence_link
        ? buildExploreUrl({ api: point.evidence_link, filters })
        : buildExploreUrl({ metric: data.axes.y.metric, filters });

    const origin = title ? `From: ${title}` : `From: ${data.axes.x.label} × ${data.axes.y.label}`;

    const cycleBreakdownFlameHref = withFilterParam("/work?tab=flame&mode=cycle_breakdown", filters, undefined, origin);
    const throughputFlameHref = withFilterParam("/work?tab=flame&mode=throughput", filters, undefined, origin);
    const hotspotsFlameHref = withFilterParam("/work?tab=flame&mode=code_hotspots", filters, undefined, origin);

    const heatmapPath = "/work?tab=heatmap";
    const heatmapHref = withFilterParam(heatmapPath, filters, undefined, origin);

    const investmentHref = withFilterParam(`/work?tab=flow&mode=investment&context_entity_id=${point.entity_id}&context_entity_label=${point.entity_label}`, filters, undefined, origin);

    const investigationPaths = useMemo(() => {
        const paths = [
            { id: "explain", label: "Explain this state", href: metricExplainHref, type: "review" },
            { id: "heatmaps", label: "View related patterns", href: heatmapHref, type: "wip" },
            { id: "cycle", label: "View time breakdown", href: cycleBreakdownFlameHref, type: "cycle" },
            { id: "throughput", label: "Inspect associations", href: throughputFlameHref, type: "delivery" },
            { id: "hotspots", label: "Inspect associations", href: hotspotsFlameHref, type: "churn" },
            { id: "investment", label: "View flow", href: investmentHref, type: "investment" },
        ];

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
        <div className="flex h-full flex-col bg-(--card-80) text-xs shadow-xl animate-in fade-in slide-in-from-right-4 duration-300">
            <header className="flex items-center justify-between border-b border-(--card-stroke) p-4">
                <div>
                    <p className="text-[10px] uppercase tracking-widest text-(--ink-muted)">
                        Investigation
                    </p>
                    <h3 className="text-sm font-semibold text-foreground">
                        {point.entity_label}
                    </h3>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-full border border-(--card-stroke) p-1.5 text-[10px] uppercase tracking-widest text-(--ink-muted) hover:bg-(--card-70)"
                    title="Close panel"
                >
                    ✕
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                            Summary
                        </p>
                        <div className="flex gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-(--accent-2)/10 text-[9px] text-(--accent-2) border border-(--accent-2)/20 uppercase tracking-tighter">
                                WIP concentration
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-(--accent-2)/10 text-[9px] text-(--accent-2) border border-(--accent-2)/20 uppercase tracking-tighter">
                                Flow constraint
                            </span>
                        </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-foreground">
                        <span className="font-semibold text-(--accent-2)">{roleConfig.framing}</span> Observed state for <span className="font-semibold">{point.entity_label}</span> during
                        the window of {point.window_start} to {point.window_end}.
                    </p>
                </section>

                <section>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) mb-3">
                        Investigation Paths
                    </p>
                    <div className="grid gap-2">
                        {investigationPaths.map((path) => {
                            const isSuggested = path.type === primaryType;
                            const isFlowLink = path.id === "investment";

                            return (
                                <Link
                                    key={path.id}
                                    href={path.href}
                                    className={`group flex items-center justify-between rounded-xl border px-4 py-3 transition ${isSuggested
                                        ? "border-(--accent-2) bg-(--accent-2)/5"
                                        : "border-(--card-stroke) bg-card hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5"
                                        }`}
                                >
                                    <div className="flex flex-col gap-0.5 text-left">
                                        {isSuggested && (
                                            <span className="text-[9px] uppercase tracking-wider text-(--accent-2) font-bold">
                                                Role lens: {roleConfig.shortLabel}
                                            </span>
                                        )}
                                        <span className="text-[12px] font-medium text-foreground group-hover:text-(--accent-2)">
                                            {path.label}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-(--accent-2) opacity-0 transition-opacity group-hover:opacity-100 uppercase tracking-widest">
                                        {isFlowLink ? "Open Flow Tab ↘" : "Open ↗"}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            </div>

            <footer className="border-t border-(--card-stroke) p-4 bg-(--card-90)">
                <p className="text-[10px] text-(--ink-muted) text-center font-medium">
                    Role context: {roleConfig.label}
                </p>
            </footer>
        </div>
    );
}

"use client";

import Link from "next/link";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { CTA_LABELS } from "@/lib/design/cta";
import { useActiveRole } from "@/lib/lensContext.client";
import { getRoleConfig } from "@/lib/roleContext";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { useMemo } from "react";

type InvestigationPanelProps = {
    point: QuadrantPoint;
    data: QuadrantResponse;
    filters: MetricFilter;
    title?: string;
};

/**
 * The body of the shared evidence drawer for one quadrant point: the summary and the
 * investigation paths. The drawer supplies the title, the subject heading (the point's label)
 * and the close control.
 */
export function InvestigationPanel({ point, data, filters, title }: InvestigationPanelProps) {
    // A path can lead to the page the drawer is open on (same path, other tab): close it.
    const { close } = useEvidenceDrawer();
    const activeRole = useActiveRole();
    const roleConfig = getRoleConfig(activeRole);

    const metricExplainHref = point.evidence_link
        ? buildExploreUrl({ api: point.evidence_link, filters })
        : buildExploreUrl({ metric: data.axes.y.metric, filters });

    const origin = title ? `From: ${title}` : `From: ${data.axes.x.label} × ${data.axes.y.label}`;

    const cycleBreakdownFlameHref = withFilterParam(
        "/work?view=work&tab=flame&mode=cycle_breakdown",
        filters,
        undefined,
        origin,
    );
    const throughputFlameHref = withFilterParam(
        "/work?view=work&tab=flame&mode=throughput",
        filters,
        undefined,
        origin,
    );
    const hotspotsFlameHref = withFilterParam(
        "/work?view=work&tab=flame&mode=code_hotspots",
        filters,
        undefined,
        origin,
    );

    const heatmapPath = "/work?view=work&tab=heatmap";
    const heatmapHref = withFilterParam(heatmapPath, filters, undefined, origin);

    const investmentHref = withFilterParam(
        `/metrics?tab=flow&context_entity_id=${point.entity_id}&context_entity_label=${point.entity_label}`,
        filters,
        undefined,
        origin,
    );

    const investigationPaths = useMemo(() => {
        const paths = [
            {
                id: "explain",
                label: "Explain this state",
                href: metricExplainHref,
                type: "review",
            },
            {
                id: "heatmaps",
                label: "View related patterns",
                href: heatmapHref,
                type: "wip",
            },
            {
                id: "cycle",
                label: "View time breakdown",
                href: cycleBreakdownFlameHref,
                type: "cycle",
            },
            {
                id: "throughput",
                label: CTA_LABELS.inspectThroughputBreakdown,
                href: throughputFlameHref,
                type: "delivery",
            },
            {
                id: "hotspots",
                label: CTA_LABELS.inspectCodeHotspots,
                href: hotspotsFlameHref,
                type: "churn",
            },
            {
                id: "investment",
                label: "View flow",
                href: investmentHref,
                type: "investment",
            },
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
    }, [
        roleConfig,
        metricExplainHref,
        heatmapHref,
        cycleBreakdownFlameHref,
        throughputFlameHref,
        hotspotsFlameHref,
        investmentHref,
    ]);

    const primaryType = roleConfig.investigationOrder[0];

    return (
        <div data-testid="investigation-panel" className="text-xs">
            <div className="space-y-6">
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-label-caps uppercase tracking-[0.2em] text-(--ink-muted)">
                            Summary
                        </p>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                        <span className="font-semibold text-(--accent-2)">
                            {roleConfig.framing}
                        </span>{" "}
                        Observed state for{" "}
                        <span className="font-semibold">{point.entity_label}</span> during the
                        window of {point.window_start} to {point.window_end}.
                    </p>
                </section>

                <section>
                    <p className="text-label-caps uppercase tracking-[0.2em] text-(--ink-muted) mb-3">
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
                                    onClick={close}
                                    className={`group flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                                        isSuggested
                                            ? "border-(--accent-2) bg-(--accent-2)/5"
                                            : "border-(--card-stroke) bg-card hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5"
                                    }`}
                                >
                                    <div className="flex flex-col gap-0.5 text-left">
                                        {isSuggested && (
                                            <span className="text-label-caps uppercase tracking-wider text-(--accent-2) font-bold">
                                                Lens: {roleConfig.shortLabel}
                                            </span>
                                        )}
                                        <span className="text-xs font-medium text-foreground group-hover:text-(--accent-2)">
                                            {path.label}
                                        </span>
                                    </div>
                                    <span className="text-label-caps text-(--accent-2) opacity-0 transition-opacity group-hover:opacity-100 uppercase tracking-widest">
                                        {isFlowLink ? "Open Flow Tab ↘" : "Open ↗"}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            </div>

            <p className="mt-6 text-label-caps font-medium text-(--ink-muted)">
                Lens: {roleConfig.label}
            </p>
        </div>
    );
}

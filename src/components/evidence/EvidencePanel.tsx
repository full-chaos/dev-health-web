"use client";

import { useEffect, useState } from "react";
import { getExplainData } from "@/lib/api/home";
import { ValidationErrors } from "@/lib/constants/errors";
import { logger } from "@/lib/logger";
import { MetricFilter } from "@/lib/filters/types";
import { Contributor } from "@/lib/types";
import { EvidenceContext } from "./EvidenceContext";
import { EvidenceItems } from "./EvidenceItems";
import { SuggestedActions } from "./SuggestedActions";
import { buildExploreUrl } from "@/lib/filters/url";
import { getMetricDefinition } from "@/lib/metrics/definitions";
import Link from "next/link";

type EvidenceItem = {
    id: string;
    title: string;
    url: string;
    type: "pr" | "issue" | "commit" | "other";
    meta?: string;
};

type Action = {
    id: string;
    label: string;
    type: "experiment" | "process" | "tooling";
};

type EvidencePanelData = {
    metric?: string;
    label?: string;
    value?: number;
    delta_pct?: number;
    summary: string;
    trend: "up" | "down" | "flat";
    magnitude: string;
    why_it_matters?: string;
    evidence: EvidenceItem[];
    actions: Action[];
};

export type EvidencePanelProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    apiUrl?: string;
    metric?: string;
    filters: MetricFilter;
};

export function EvidencePanel({
    isOpen,
    onClose,
    title,
    apiUrl,
    metric,
    filters,
}: EvidencePanelProps) {
    const [data, setData] = useState<EvidencePanelData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    useEffect(() => {
        if (isOpen && (apiUrl || metric)) {
            setLoading(true);
            setError(null);
            
            const fetchData = async () => {
                try {
                    let result;
                    if (apiUrl) {
                        const res = await fetch(apiUrl);
                        if (!res.ok) throw new Error(ValidationErrors.FailedToFetchEvidence);
                        result = await res.json();
                    } else if (metric) {
                        result = await getExplainData({ 
                            metric, 
                            filters 
                        });
                    }

                    if (result) {
                        const metricKey = result.metric || metric;
                        const definition = metricKey ? getMetricDefinition(metricKey) : undefined;
                        
                        const deltaPct = result.delta_pct || 0;
                        const trend = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
                        const magnitude = Math.abs(deltaPct) > 10 ? "Significant" : "Moderate";
                        
                        const rawEvidence: EvidenceItem[] = result.evidence || [
                            ...(result.drivers || []),
                            ...(result.contributors || [])
                        ].map((d: Contributor) => ({
                            id: d.id,
                            title: d.label,
                            url: d.evidence_link || "#",
                            type: "other" as const,
                            meta: `${d.value} (${d.delta_pct}%)`
                        }));

                        // Deduplicate by id — drivers and contributors overlap
                        const seen = new Set<string>();
                        const evidence = rawEvidence.filter((item) => {
                            if (seen.has(item.id)) return false;
                            seen.add(item.id);
                            return true;
                        });

                        const actions = result.actions || definition?.suggestedActions || [];

                        setData({
                            ...result,
                            summary: result.summary || `${result.label || title} is ${trend} by ${Math.abs(deltaPct)}%`,
                            trend,
                            magnitude,
                            why_it_matters: result.why_it_matters || definition?.whyItMatters,
                            evidence,
                            actions
                        });
                    }
                } catch (err) {
                    logger.error({ err }, "Failed to load evidence data");
                    setError("Failed to load evidence data");
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }
    }, [isOpen, apiUrl, metric, filters, title]);

    if (!isOpen) return null;

    const exploreUrl = apiUrl 
        ? buildExploreUrl({ api: apiUrl, filters })
        : metric 
            ? buildExploreUrl({ metric, filters })
            : "#";

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div 
                className="absolute inset-0 bg-black/50 transition-opacity"
                onClick={onClose}
            />

            <div className="relative z-10 flex h-full w-full flex-col bg-(--card-80) shadow-2xl md:w-[480px] animate-in fade-in slide-in-from-right-4 duration-300 rounded-l-3xl border-l border-(--card-stroke)">
                <header className="flex items-center justify-between border-b border-(--card-stroke) p-6">
                    <div>
                        <p className="text-[10px] uppercase tracking-widest text-(--ink-muted)">
                            Evidence & Context
                        </p>
                        <h2 className="text-lg font-semibold text-foreground mt-1">
                            {title}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full border border-(--card-stroke) p-2 text-xs uppercase tracking-widest text-(--ink-muted) hover:bg-(--card-70) transition-colors"
                        title="Close panel"
                    >
                        ✕
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {loading ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-24 bg-(--card-70) rounded-2xl" />
                            <div className="h-40 bg-(--card-70) rounded-2xl" />
                            <div className="h-32 bg-(--card-70) rounded-2xl" />
                        </div>
                    ) : error ? (
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    ) : data ? (
                        <>
                            <EvidenceContext data={data} />
                            <EvidenceItems items={data.evidence || []} />
                            <SuggestedActions actions={data.actions || []} />
                        </>
                    ) : null}
                </div>

                <footer className="border-t border-(--card-stroke) p-6 bg-(--card-90)">
                    <Link 
                        href={exploreUrl}
                        className="flex items-center justify-center w-full py-3 px-4 rounded-xl bg-(--accent-2)/10 text-(--accent-2) border border-(--accent-2)/20 hover:bg-(--accent-2)/20 transition-colors text-sm font-medium"
                    >
                        Open in Explore View ↗
                    </Link>
                </footer>
            </div>
        </div>
    );
}

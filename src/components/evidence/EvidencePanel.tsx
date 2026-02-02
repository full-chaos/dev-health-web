"use client";

import { useEffect, useState } from "react";
import { getExplainData } from "@/lib/api";
import { MetricFilter } from "@/lib/filters/types";
import { EvidenceContext } from "./EvidenceContext";
import { EvidenceItems } from "./EvidenceItems";
import { SuggestedActions } from "./SuggestedActions";
import { buildExploreUrl } from "@/lib/filters/url";
import Link from "next/link";

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
    const [data, setData] = useState<any>(null);
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
                        if (!res.ok) throw new Error("Failed to fetch evidence");
                        result = await res.json();
                    } else if (metric) {
                        result = await getExplainData({ 
                            metric, 
                            filters 
                        });
                    }
                    setData(result);
                } catch (err) {
                    console.error(err);
                    setError("Failed to load evidence data");
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }
    }, [isOpen, apiUrl, metric, filters]);

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
                            <EvidenceContext data={data} filters={filters} />
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

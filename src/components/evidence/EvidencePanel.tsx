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
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { buildExploreUrl } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import { getMetricDefinition } from "@/lib/metrics/definitions";
import Link from "next/link";

type EvidenceItem = {
    id: string;
    title: string;
    url: string;
    type: "pr" | "issue" | "commit" | "other";
    meta?: string;
};

type EvidenceProvenance = {
    last_sync?: string | null;
    source?: string | null;
    identity_confidence?: number | null;
    quality?: string | null;
    partial?: boolean;
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
    provenance?: EvidenceProvenance;
};

type EvidencePanelResult = Partial<EvidencePanelData> & {
    unit?: string;
    drivers?: Contributor[];
    contributors?: Contributor[];
    last_sync?: string | null;
    source?: string | null;
    identity_confidence?: number | null;
};

const isEvidenceDebugEnabled = () =>
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_HEALTH_EVIDENCE_DEBUG === "true";

const explainMetricFromApiUrl = (apiUrl?: string) => {
    if (!apiUrl) return undefined;
    try {
        const url = new URL(
            apiUrl,
            typeof window === "undefined" ? "http://localhost" : window.location.origin,
        );
        if (url.pathname !== "/api/v1/explain") return undefined;
        return url.searchParams.get("metric") ?? undefined;
    } catch {
        return undefined;
    }
};

const readJsonOrEmpty = async <T,>(response: Response): Promise<T | null> => {
    // Real fetch Responses always expose text(); some test doubles only provide
    // json(). Fall back to json() so both real Responses and realistic mocks work.
    if (typeof response.text !== "function") {
        return (await response.json()) as T;
    }
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed ? (JSON.parse(trimmed) as T) : null;
};

export type EvidencePanelProps = {
    isOpen: boolean;
    onCloseAction: () => void;
    title: string;
    apiUrl?: string;
    metric?: string;
    filters: MetricFilter;
};

export function EvidencePanel({
    isOpen,
    onCloseAction,
    title,
    apiUrl,
    metric,
    filters,
}: EvidencePanelProps) {
    const [data, setData] = useState<EvidencePanelData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorDetail, setErrorDetail] = useState<string | null>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCloseAction();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [onCloseAction]);

    useEffect(() => {
        if (isOpen && (apiUrl || metric)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the panel intentionally starts async evidence loading.
            setLoading(true);
            setError(null);
            setErrorDetail(null);

            const fetchData = async () => {
                let requestPath = apiUrl ?? "/api/v1/explain";
                try {
                    let result: EvidencePanelResult | null | undefined;
                    if (apiUrl) {
                        // apiUrl wins: a populated evidence_ref must drive the panel.
                        // Route /api/v1/explain URLs through the typed, cached client;
                        // fetch all other evidence_ref endpoints directly.
                        const apiExplainMetric = explainMetricFromApiUrl(apiUrl);
                        if (apiExplainMetric) {
                            requestPath = "/api/v1/explain";
                            result = await getExplainData({
                                metric: apiExplainMetric,
                                filters,
                            });
                        } else {
                            const res = await fetch(apiUrl);
                            if (!res.ok) throw new Error(ValidationErrors.FailedToFetchEvidence);
                            result = await readJsonOrEmpty<EvidencePanelResult>(res);
                        }
                    } else if (metric) {
                        requestPath = "/api/v1/explain";
                        result = await getExplainData({
                            metric,
                            filters,
                        });
                    }

                    if (result) {
                        const metricKey = result.metric || metric;
                        const definition = metricKey ? getMetricDefinition(metricKey) : undefined;

                        const deltaPct = result.delta_pct || 0;
                        const trend = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
                        const magnitude = Math.abs(deltaPct) > 10 ? "Significant" : "Moderate";

                        const rawEvidence: EvidenceItem[] =
                            result.evidence ||
                            [...(result.drivers || []), ...(result.contributors || [])].map(
                                (d: Contributor) => ({
                                    id: d.id,
                                    title: d.label,
                                    url: d.evidence_link || "#",
                                    type: "other" as const,
                                    meta: `${d.value} (${d.delta_pct}%)`,
                                }),
                            );

                        // Deduplicate by id — drivers and contributors overlap
                        const seen = new Set<string>();
                        const evidence = rawEvidence.filter((item) => {
                            if (seen.has(item.id)) return false;
                            seen.add(item.id);
                            return true;
                        });

                        const actions = result.actions || definition?.suggestedActions || [];

                        const provenance: EvidenceProvenance = result.provenance || {
                            last_sync: result.last_sync ?? null,
                            source: result.source ?? "metrics API",
                            identity_confidence: result.identity_confidence ?? null,
                            quality: evidence.length > 0 ? "moderate" : "partial",
                            partial: evidence.length === 0,
                        };

                        setData({
                            ...result,
                            summary:
                                result.summary ||
                                `${result.label || title} is ${trend} by ${Math.abs(deltaPct)}%`,
                            trend,
                            magnitude,
                            why_it_matters: result.why_it_matters || definition?.whyItMatters,
                            evidence,
                            actions,
                            provenance,
                        });
                    }
                } catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    if (isEvidenceDebugEnabled()) {
                        logger.error(
                            { err, detail, metric, apiUrl, requestPath, title },
                            "Evidence panel failed to load evidence data",
                        );
                    }
                    setError(
                        "We couldn't load the supporting detail for this selection. This is usually temporary — try again in a moment.",
                    );
                    setErrorDetail(detail);
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }
    }, [isOpen, apiUrl, metric, filters, title]);

    if (!isOpen) return null;

    const showDevDiagnostics = isEvidenceDebugEnabled();

    const exploreUrl = metric
        ? buildExploreUrl({ metric, filters })
        : apiUrl
          ? buildExploreUrl({ api: apiUrl, filters })
          : "#";

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <button
                type="button"
                aria-label={CTA_LABELS.closeEvidencePanel}
                className="absolute inset-0 bg-black/50 transition-opacity"
                onClick={onCloseAction}
            />

            <div className="relative z-10 flex h-full w-full flex-col rounded-l-3xl border-l border-(--card-stroke) bg-card shadow-2xl animate-in fade-in slide-in-from-right-4 duration-300 md:max-w-lg">
                <header className="flex items-center justify-between border-b border-(--card-stroke) bg-(--card-90) p-6">
                    <div>
                        <p className="text-xs uppercase tracking-widest text-(--ink-muted)">
                            Evidence & Context
                        </p>
                        <h2 className="text-lg font-semibold text-foreground mt-1">{title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="rounded-full border border-(--card-stroke) p-2 text-xs uppercase tracking-widest text-(--ink-muted) transition-colors hover:bg-(--card-70) hover:text-foreground"
                        title={CTA_LABELS.closePanel}
                    >
                        ✕
                    </button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-6">
                    {loading ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-24 bg-(--card-70) rounded-2xl" />
                            <div className="h-40 bg-(--card-70) rounded-2xl" />
                            <div className="h-32 bg-(--card-70) rounded-2xl" />
                        </div>
                    ) : error ? (
                        <div className="space-y-3" data-testid="evidence-error-state">
                            <ErrorCard title="Unable to load this view" message={error} />
                            {showDevDiagnostics && errorDetail ? (
                                <pre
                                    data-testid="evidence-error-diagnostics"
                                    className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4 text-xs leading-5 text-(--ink-muted)"
                                >
                                    {errorDetail}
                                </pre>
                            ) : null}
                        </div>
                    ) : data ? (
                        <>
                            <EvidenceProvenanceStrip provenance={data.provenance} />
                            <EvidenceContext data={data} />
                            {data.evidence?.length ? (
                                <EvidenceItems items={data.evidence} />
                            ) : (
                                <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-90) p-4 text-sm leading-6 text-(--ink-muted)">
                                    No contributing artifacts were returned for this metric and
                                    filter window. This is a partial-data state, not a zero signal.
                                </div>
                            )}
                            <SuggestedActions actions={data.actions || []} />
                        </>
                    ) : (
                        <EmptyState
                            title="Nothing to show yet"
                            description="There's no supporting detail to display for this selection right now. Try a different metric or widen the time window."
                        />
                    )}
                </div>

                <footer className="border-t border-(--card-stroke) bg-(--card-90) p-6">
                    <Link
                        href={exploreUrl}
                        className="flex w-full items-center justify-center rounded-xl border border-(--accent)/20 bg-(--accent)/10 px-4 py-3 text-sm font-medium text-(--accent) transition-colors hover:bg-(--accent)/20"
                    >
                        Open in Explore View ↗
                    </Link>
                </footer>
            </div>
        </div>
    );
}

function EvidenceProvenanceStrip({ provenance }: { provenance?: EvidenceProvenance }) {
    const confidence = provenance?.identity_confidence;

    return (
        <section className="grid gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4 text-xs text-(--ink-muted)">
            <p className="text-xs uppercase tracking-[0.2em]">Quality + provenance</p>
            <div className="grid gap-2 sm:grid-cols-2">
                <EvidenceProvenanceItem
                    label="Source"
                    value={provenance?.source || "metrics API"}
                />
                <EvidenceProvenanceItem label="Quality" value={provenance?.quality || "partial"} />
                <EvidenceProvenanceItem
                    label="Last sync"
                    value={provenance?.last_sync || "not reported"}
                />
                <EvidenceProvenanceItem
                    label="Identity confidence"
                    value={
                        typeof confidence === "number"
                            ? `${Math.round(confidence * 100)}%`
                            : "not reported"
                    }
                />
            </div>
            {provenance?.partial && (
                <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-amber-300">
                    Partial evidence: the backend did not return a complete artifact list for this
                    selection.
                </p>
            )}
        </section>
    );
}

function EvidenceProvenanceItem({ label, value }: { label: string; value: string }) {
    return (
        <span className="rounded-xl border border-(--card-stroke) bg-background/35 px-3 py-2 leading-5">
            {label}: {value}
        </span>
    );
}

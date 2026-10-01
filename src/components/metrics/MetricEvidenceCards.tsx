"use client";

import { useState } from "react";

import { EvidencePanel } from "@/components/evidence";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";

type MetricEvidenceCardsProps = {
    metrics: string[];
    deltas: MetricDelta[];
    filters: MetricFilter;
    activeRole?: string;
    placeholderDeltas: boolean;
};

const deltaTone = (value?: number) => {
    if (value === undefined || value === null) return "text-(--ink-muted)";
    return value > 0
        ? "text-(--accent-3)"
        : value < 0
          ? "text-(--accent-negative)"
          : "text-(--ink-muted)";
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
    deltas.find((item) => item.metric === metric);

export function MetricEvidenceCards({
    metrics,
    deltas,
    filters,
    activeRole,
    placeholderDeltas,
}: MetricEvidenceCardsProps) {
    const [activeMetric, setActiveMetric] = useState<MetricDelta | null>(null);

    return (
        <>
            <EvidencePanel
                isOpen={Boolean(activeMetric)}
                onCloseAction={() => setActiveMetric(null)}
                title={activeMetric?.label ?? "Metric evidence"}
                metric={activeMetric?.metric}
                filters={filters}
            />

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {metrics.map((metric) => {
                    const data = getMetric(deltas, metric);
                    const label = data?.label ?? metric;
                    const sparkValues = data?.spark?.map((point) => point.value) ?? [];
                    const sparkLabels = data?.spark?.map((point) => point.ts) ?? [];

                    const hasSpark = sparkValues.length > 1;
                    const missing = placeholderDeltas || data?.value === undefined;

                    return (
                        // Same tile as MetricCard (CHAOS-7597): concept `.metric` shell,
                        // `.metric-title`, `.metric-value`, `.metric-meta`, `.metric .spark`.
                        <article
                            key={metric}
                            className="group relative min-h-[124px] min-w-0 rounded-[10px] border border-(--card-stroke) bg-card px-5 py-[18px] transition hover:-translate-y-1 hover:shadow-lg"
                        >
                            <div className="text-label-caps uppercase text-(--ink-muted)">
                                <span>{label}</span>
                            </div>
                            <p
                                className={`mt-2.5 text-[28px] font-semibold leading-tight tabular-nums ${
                                    missing ? "text-(--ink-muted)" : "text-foreground"
                                }`}
                            >
                                {placeholderDeltas || data?.value === undefined
                                    ? "--"
                                    : formatMetricValue(data.value, data.unit ?? "")}
                            </p>
                            <div
                                className={`mt-2 text-xs text-(--ink-muted) ${
                                    hasSpark ? "max-w-[55%]" : ""
                                }`}
                            >
                                <span className={deltaTone(data?.delta_pct)}>
                                    {placeholderDeltas || data?.delta_pct === undefined
                                        ? "--"
                                        : formatDelta(data.delta_pct)}
                                </span>
                                <span> · </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveMetric(
                                            data ?? {
                                                metric,
                                                label,
                                                value: 0,
                                                unit: "",
                                                delta_pct: 0,
                                                spark: [],
                                            },
                                        )
                                    }
                                    className="text-left text-(--accent-2) underline-offset-4 hover:underline"
                                >
                                    {CTA_LABELS.openEvidence}
                                </button>
                            </div>
                            <div className="absolute right-4 top-[60px] h-[31px] w-[87px]">
                                {hasSpark ? (
                                    <SparklineChart
                                        data={sparkValues}
                                        categories={sparkLabels}
                                        height={31}
                                    />
                                ) : (
                                    <span className="flex h-full items-center justify-end text-label-caps uppercase text-(--ink-muted)">
                                        Trend
                                    </span>
                                )}
                            </div>
                            <a
                                href={buildExploreUrl({ metric, filters, role: activeRole })}
                                className="mt-3 block text-label-caps uppercase text-(--ink-muted) hover:text-foreground"
                            >
                                {CTA_LABELS.openEvidence}
                            </a>
                        </article>
                    );
                })}
            </section>
        </>
    );
}

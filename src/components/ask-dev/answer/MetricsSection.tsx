"use client";

import type { DevAnswer } from "@/lib/dev/generated";
import { formatMetricValue, formatPercent, formatTimestamp } from "@/lib/formatters";

import { InlineCitations, type CitationTargets } from "./InlineCitations";

/**
 * Registered metrics with their definition provenance.
 *
 * Every value is rendered through the shared formatters — a raw number here
 * would be a design-lint failure as well as a units-free claim. `openMetricIds`
 * comes from the container so a citation click can force the matching
 * definition panel open and focus it (CHAOS-3215 M6).
 */
export function MetricsSection({
    headingId,
    metricAnchorId,
    metricPositionById,
    metrics,
    openMetricIds,
    targets,
}: {
    headingId: string;
    metricAnchorId: (position: number) => string;
    metricPositionById: ReadonlyMap<string, number>;
    metrics: NonNullable<DevAnswer["metrics"]>;
    openMetricIds: ReadonlySet<string>;
    targets: CitationTargets;
}) {
    return (
        <section className="border-t border-(--border) pt-4" aria-labelledby={headingId}>
            <h3 id={headingId} className="text-label-caps text-(--text-muted)">
                Metrics
            </h3>
            <dl className="mt-2 divide-y divide-(--border)">
                {metrics.map((metric) => (
                    <div
                        key={metric.metric_ref_id}
                        id={metricAnchorId(metricPositionById.get(metric.metric_ref_id) ?? 0)}
                        tabIndex={-1}
                        className="scroll-mt-6 grid gap-1 py-3 outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
                    >
                        <dt className="text-sm text-(--text-secondary)">
                            {metric.label}
                            <InlineCitations
                                evidenceRefIds={metric.evidence_ref_ids}
                                ownerLabel={`metric ${metric.label}`}
                                targets={targets}
                            />
                            <span className="mt-0.5 block text-xs text-(--text-muted)">
                                {metric.aggregation} · {metric.freshness} ·{" "}
                                {formatPercent(metric.coverage * 100)} coverage
                            </span>
                        </dt>
                        <dd className="text-left sm:text-right">
                            <span className="font-(--font-display) text-h3 text-(--text-primary)">
                                {metric.value == null
                                    ? "Unavailable"
                                    : formatMetricValue(metric.value, metric.unit)}
                            </span>
                            {metric.comparison_value != null ? (
                                <span className="ml-2 text-xs text-(--text-muted)">
                                    vs {formatMetricValue(metric.comparison_value, metric.unit)}
                                </span>
                            ) : null}
                            <details
                                open={openMetricIds.has(metric.metric_ref_id) || undefined}
                                className="mt-1 text-xs text-(--text-muted)"
                            >
                                <summary className="cursor-pointer font-medium text-(--text-secondary)">
                                    Metric definition
                                </summary>
                                <dl className="mt-2 grid gap-x-3 gap-y-1 text-left sm:grid-cols-[auto_minmax(0,1fr)]">
                                    <dt>Unit</dt>
                                    <dd>{metric.unit}</dd>
                                    <dt>Definition version</dt>
                                    <dd>{metric.definition_version}</dd>
                                    <dt>Query version</dt>
                                    <dd>{metric.query_version}</dd>
                                    <dt>Source version</dt>
                                    <dd>{metric.source_version}</dd>
                                    <dt>Current window</dt>
                                    <dd>
                                        {formatTimestamp(metric.current_window.start)} –{" "}
                                        {formatTimestamp(metric.current_window.end)}
                                    </dd>
                                    {metric.comparison_window ? (
                                        <>
                                            <dt>Comparison window</dt>
                                            <dd>
                                                {formatTimestamp(metric.comparison_window.start)} –{" "}
                                                {formatTimestamp(metric.comparison_window.end)}
                                            </dd>
                                        </>
                                    ) : null}
                                </dl>
                            </details>
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

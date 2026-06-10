"use client";

import { useQuery } from "urql";
import {
    MetricLineageDocument,
    type MetricLineageQuery,
} from "@/lib/graphql/__generated__/graphql";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";

export function LineagePopover({ metricId }: { metricId: string }) {
    const [result] = useQuery({
        query: MetricLineageDocument as unknown as TypedDocumentNode<
            MetricLineageQuery,
            { metricId: string }
        >,
        variables: { metricId },
    });

    const { data, fetching, error } = result;

    // Render a simple info icon that triggers a group-hover tooltip
    return (
        <div
            className="relative group inline-block ml-2 cursor-help"
            onClick={(e) => e.preventDefault()}
        >
            <svg
                className="w-4 h-4 text-(--ink-muted) hover:text-(--accent)"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>

            <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-card border border-(--border) rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none">
                <div className="text-xs font-semibold uppercase tracking-wider text-(--ink-muted) mb-2">
                    Metric Lineage
                </div>

                {fetching && <div className="text-sm text-(--ink-muted)">Loading lineage...</div>}
                {error && (
                    <div className="text-sm text-(--accent-negative)">Error loading lineage</div>
                )}

                {data?.dataHealth?.metricLineage && (
                    <div className="space-y-3">
                        <div>
                            <div className="text-[10px] uppercase text-(--ink-muted)/70 mb-1">
                                Source Tables
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {data.dataHealth.metricLineage.sourceTables.map((t) => (
                                    <span
                                        key={t}
                                        className="px-1.5 py-0.5 rounded-sm bg-(--card-70) border border-(--border) text-xs font-mono"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <div>
                                <div className="text-[10px] uppercase text-(--ink-muted)/70 mb-1">
                                    Compute Window
                                </div>
                                <div className="text-xs">
                                    {data.dataHealth.metricLineage.computeWindow.kind}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] uppercase text-(--ink-muted)/70 mb-1">
                                    Rows Processed
                                </div>
                                <div className="text-xs">
                                    {data.dataHealth.metricLineage.rowCount?.toLocaleString() ??
                                        "N/A"}
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] uppercase text-(--ink-muted)/70 mb-1">
                                Last Computed
                            </div>
                            <div className="text-xs">
                                {new Date(
                                    data.dataHealth.metricLineage.computedAt,
                                ).toLocaleString()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

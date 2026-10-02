"use client";

import { useState } from "react";

import { STATUS_PILL } from "@/lib/statusPill";
import { EntityLabel } from "@/components/labels/EntityLabel";
import type { AiOpportunity, AiWorkGraphDrilldownRef } from "@/lib/graphql/__generated__/types";
import { useAIWorkflowDrilldown } from "@/lib/graphql/hooks/useAIReviewRisk";

function OpportunityEvidence({ selected }: { selected: AiWorkGraphDrilldownRef | null }) {
    const { data, fetching, error } = useAIWorkflowDrilldown(
        selected?.rootType ?? null,
        selected?.rootId ?? null,
        { limit: 25 },
    );

    if (!selected) return null;

    if (fetching) {
        return (
            <p className="mt-3 rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-xs text-(--ink-muted)">
                Loading Work Graph evidence for {selected.label}…
            </p>
        );
    }

    if (error) {
        return (
            <p
                className={`mt-3 rounded-(--radius-sm) border px-3 py-2 text-xs ${STATUS_PILL.negative}`}
            >
                Evidence unavailable: {error.message}
            </p>
        );
    }

    if (!data || !data.dataAvailable) {
        return (
            <p className="mt-3 rounded-(--radius-sm) border border-(--card-stroke) bg-background px-3 py-2 text-xs text-(--ink-muted)">
                No Work Graph edges recorded for {selected.label} yet.
            </p>
        );
    }

    return (
        <div
            className="mt-3 rounded-(--radius-sm) border border-(--card-stroke) bg-background p-3"
            data-testid="ai-opportunity-workgraph-evidence"
        >
            <p className="text-label-caps uppercase text-(--ink-muted)">
                {data.nodes.length} nodes · {data.edges.length} edges
            </p>
            <ul className="mt-2 space-y-2">
                {data.edges.slice(0, 3).map((edge) => (
                    <li key={edge.edgeId} className="text-xs text-(--ink-muted)">
                        <span className="font-semibold text-foreground">{edge.edgeType}</span> ·{" "}
                        {edge.evidence}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function AIOpportunityList({
    detectorReady,
    recommendations,
}: {
    detectorReady?: boolean;
    recommendations?: AiOpportunity[];
}) {
    const [selectedRef, setSelectedRef] = useState<AiWorkGraphDrilldownRef | null>(null);

    if (!detectorReady) {
        return (
            <div className="rounded-(--radius-md) border border-dashed border-(--card-stroke) bg-(--card-80) p-5 text-sm text-(--ink-muted)">
                <p className="font-medium text-foreground">
                    No automation candidates in this scope yet
                </p>
                <p className="mt-2">
                    As more repeatable work patterns accumulate for the selected scope, best-fit
                    automation candidates will appear here.
                </p>
            </div>
        );
    }

    if (!recommendations?.length) {
        return (
            <p className="text-sm text-(--ink-muted)">
                No automation candidates in this scope yet.
            </p>
        );
    }

    return (
        <ol className="list-none space-y-3">
            {recommendations.slice(0, 5).map((item, index) => (
                <li
                    key={item.opportunityId}
                    className="flex gap-4 rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4"
                >
                    <span
                        aria-hidden="true"
                        className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full border border-(--card-stroke) bg-background text-sm font-semibold tabular-nums text-(--ink-muted)"
                    >
                        {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-medium">{item.title}</p>
                                <p className="mt-1 text-sm text-(--ink-muted)">{item.rationale}</p>
                            </div>
                            <span className="shrink-0 whitespace-nowrap rounded-full border border-(--card-stroke) bg-background px-2 py-1 text-xs font-medium tabular-nums text-foreground">
                                Fit {Math.round(item.score * 100)}%
                            </span>
                        </div>
                        <p className="mt-2 text-label-caps uppercase text-(--ink-muted)">
                            {item.kind.replace(/_/g, " ")}{" "}
                            {item.repoId ? (
                                <>
                                    {"· "}
                                    <EntityLabel id={item.repoId} />
                                </>
                            ) : null}{" "}
                            {item.teamId ? (
                                <>
                                    {"· "}
                                    <EntityLabel id={item.teamId} />
                                </>
                            ) : null}
                        </p>
                        {item.workGraphDrilldowns.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {item.workGraphDrilldowns.map((ref) => {
                                    const selected =
                                        selectedRef?.rootType === ref.rootType &&
                                        selectedRef.rootId === ref.rootId;
                                    return (
                                        <button
                                            key={`${ref.rootType}:${ref.rootId}`}
                                            type="button"
                                            onClick={() => setSelectedRef(selected ? null : ref)}
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${selected ? "border-(--accent) bg-(--accent)/10 text-foreground" : "border-(--card-stroke) bg-background/60 text-(--ink-muted) hover:text-foreground"}`}
                                        >
                                            Work Graph: {ref.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <OpportunityEvidence
                            selected={
                                selectedRef &&
                                item.workGraphDrilldowns.some(
                                    (ref) =>
                                        ref.rootType === selectedRef.rootType &&
                                        ref.rootId === selectedRef.rootId,
                                )
                                    ? selectedRef
                                    : null
                            }
                        />
                    </div>
                </li>
            ))}
        </ol>
    );
}

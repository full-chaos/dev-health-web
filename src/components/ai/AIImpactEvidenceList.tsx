"use client";

import { useMemo, useState } from "react";

import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import type { AiAttributedPr } from "@/lib/graphql/__generated__/types";
import { useAIAttributedPrs } from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIAttributionBadge, attributionBucketForKind } from "./AIAttributionBadge";
import { EvidencePanel, prRowKey } from "./AIDrilldownModal";

const PAGE_SIZE = 25;

type AIImpactEvidenceListProps = {
    filter: AIFilter;
};

function formatMergedAt(value: string | null | undefined): string {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return value;
    }
}

/**
 * PR-evidence drilldown list (CHAOS-2196): every AI-attributed PR in the
 * selected window with its provenance badge; selecting a row loads its Work
 * Graph evidence. Pagination is offset-based against `aiAttributedPrs`.
 */
export function AIImpactEvidenceList({ filter }: AIImpactEvidenceListProps) {
    const [offset, setOffset] = useState(0);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const { data, fetching, error } = useAIAttributedPrs(filter, PAGE_SIZE, offset);

    const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
    const selected = useMemo(
        () => (selectedKey ? (rows.find((row) => prRowKey(row) === selectedKey) ?? null) : null),
        [rows, selectedKey],
    );

    if (error) {
        return <ErrorCard title="Failed to load AI-attributed PRs" message={error.message} />;
    }

    if (!fetching && data && !data.dataAvailable) {
        return (
            <DataState
                variant="no-data-connected"
                title="AI attribution data has not populated yet"
                description="PR-level attribution evidence appears once a provider is connected and AI attribution coverage exists for the selected scope."
            />
        );
    }

    if (!fetching && data && data.dataAvailable && data.total === 0) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                title="No AI-attributed PRs in this range"
                description="Attribution is connected, but no pull requests in the selected window resolve to an AI bucket. Widen the date range or clear scope filters."
            />
        );
    }

    return (
        <div className="flex flex-col gap-5" data-testid="ai-impact-evidence-list">
            <div className="overflow-hidden rounded-3xl border border-(--card-stroke)">
                <table className="w-full text-left text-sm">
                    <thead className="bg-card text-xs uppercase tracking-[0.14em] text-(--ink-muted)">
                        <tr>
                            <th className="px-4 py-3 font-semibold">PR</th>
                            <th className="px-4 py-3 font-semibold">Title</th>
                            <th className="px-4 py-3 font-semibold">Attribution</th>
                            <th className="px-4 py-3 font-semibold">Type</th>
                            <th className="px-4 py-3 font-semibold">Repo</th>
                            <th className="px-4 py-3 font-semibold">Merged</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-stroke)">
                        {fetching && rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="px-4 py-8 text-center text-(--ink-muted)"
                                    data-testid="ai-impact-evidence-loading"
                                >
                                    Loading AI-attributed pull requests…
                                </td>
                            </tr>
                        ) : (
                            rows.map((pr: AiAttributedPr) => {
                                const key = prRowKey(pr);
                                const isSelected = key === selectedKey;
                                return (
                                    <tr
                                        key={key}
                                        onClick={() => setSelectedKey(key)}
                                        className={`cursor-pointer transition-colors ${isSelected ? "bg-(--accent-positive)/10" : "hover:bg-background/50"}`}
                                        data-testid="ai-impact-evidence-row"
                                        data-pr-key={key}
                                    >
                                        <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                            #{pr.number}
                                        </td>
                                        <td className="px-4 py-3">{pr.title ?? "(untitled)"}</td>
                                        <td className="px-4 py-3">
                                            <AIAttributionBadge
                                                bucket={attributionBucketForKind(pr.kind)}
                                                tool={pr.kind}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-(--ink-muted)">
                                            {pr.workType ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                            {pr.repoId}
                                        </td>
                                        <td className="px-4 py-3 text-(--ink-muted)">
                                            {formatMergedAt(pr.mergedAt)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between text-sm text-(--ink-muted)">
                <span data-testid="ai-impact-evidence-count">
                    {data ? `${data.total} AI-attributed PRs` : ""}
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={offset === 0 || fetching}
                        onClick={() => {
                            setOffset(Math.max(0, offset - PAGE_SIZE));
                            setSelectedKey(null);
                        }}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs font-semibold disabled:opacity-40"
                    >
                        {CTA_LABELS.previousPage}
                    </button>
                    <button
                        type="button"
                        disabled={!data?.hasMore || fetching}
                        onClick={() => {
                            setOffset(offset + PAGE_SIZE);
                            setSelectedKey(null);
                        }}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs font-semibold disabled:opacity-40"
                    >
                        {CTA_LABELS.nextPage}
                    </button>
                </div>
            </div>

            <section className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <h3 className="font-(--font-display) text-lg">Work Graph evidence</h3>
                <div className="mt-3">
                    <EvidencePanel selected={selected} />
                </div>
            </section>
        </div>
    );
}

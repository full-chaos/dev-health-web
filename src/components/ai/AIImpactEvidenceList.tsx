"use client";

import { useMemo, useState } from "react";

import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { encodeAIFilter, type AIFilter } from "@/lib/filters/ai";
import type { AiAttributedPr } from "@/lib/graphql/__generated__/types";
import { useAIAttributedPrs } from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIAttributionBadge, attributionBucketForKind } from "./AIAttributionBadge";
import { EvidencePanel, prRowKey } from "./AIEvidenceExplorer";

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

    // React-recommended pattern for resetting local state when a prop changes,
    // in lieu of useEffect (which would violate `react-hooks/set-state-in-effect`;
    // same idiom as EditCredentialModal). A scope change must restart pagination
    // at page 1 — a stale offset against a smaller scope would render the
    // sparse-page failure state even though page 1 has valid evidence — and a
    // selection from the old scope must not survive into the new one.
    // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
    const filterKey = encodeAIFilter(filter);
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
    if (filterKey !== prevFilterKey) {
        setPrevFilterKey(filterKey);
        setOffset(0);
        setSelectedKey(null);
    }

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

    const sparsePage =
        !fetching && data?.dataAvailable === true && data.total > 0 && rows.length === 0;

    return (
        <div
            className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start"
            data-testid="ai-impact-evidence-list"
        >
            <div className="flex min-w-0 flex-col gap-4">
                {sparsePage ? (
                    <DataState
                        variant="detector-unavailable"
                        title="This page of results could not be loaded"
                        description={`The selected window reports ${data?.total ?? 0} AI-attributed PRs, but this page returned none. Use Previous to return to a populated page, or narrow the scope.`}
                        data-testid="ai-impact-evidence-sparse-page"
                    />
                ) : (
                    <div className="overflow-x-auto rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80)">
                        <table className="w-full text-left text-sm">
                            <thead className="whitespace-nowrap border-b border-(--card-stroke) bg-background text-label-caps uppercase text-(--ink-muted)">
                                <tr>
                                    <th className="px-3 py-2.75 font-medium">PR</th>
                                    <th className="px-3 py-2.75 font-medium">Title</th>
                                    <th className="px-3 py-2.75 font-medium">Attribution</th>
                                    <th className="px-3 py-2.75 font-medium">Type</th>
                                    <th className="px-3 py-2.75 font-medium">Repo</th>
                                    <th className="px-3 py-2.75 font-medium">Merged</th>
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
                                                className={`cursor-pointer transition-colors ${isSelected ? "bg-(--accent-positive)/10 shadow-[inset_0.1875rem_0_0_var(--accent)]" : "hover:bg-background"}`}
                                                data-testid="ai-impact-evidence-row"
                                                data-pr-key={key}
                                            >
                                                <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                                    #{pr.number}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {pr.title ?? "(untitled)"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <AIAttributionBadge
                                                        bucket={attributionBucketForKind(pr.kind)}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-(--ink-muted)">
                                                    {pr.workType ?? "—"}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-xs text-(--ink-muted)">
                                                    <EntityLabel
                                                        id={pr.repoId}
                                                        displayName={pr.repoName}
                                                    />
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-(--ink-muted)">
                                                    {formatMergedAt(pr.mergedAt)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

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
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-label-caps uppercase font-medium hover:bg-background disabled:opacity-40"
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
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-label-caps uppercase font-medium hover:bg-background disabled:opacity-40"
                        >
                            {CTA_LABELS.nextPage}
                        </button>
                    </div>
                </div>
            </div>

            <section className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-5 xl:sticky xl:top-4">
                <h3 className="font-(--font-display) text-lg">Work Graph evidence</h3>
                <div className="mt-3">
                    <EvidencePanel selected={selected} />
                </div>
            </section>
        </div>
    );
}

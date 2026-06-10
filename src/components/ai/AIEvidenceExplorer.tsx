"use client";

import { useMemo, useState } from "react";

import type { AIFilter } from "@/lib/filters/ai";
import type { AiAttributedPr } from "@/lib/graphql/__generated__/types";
import { prWorkflowRootId } from "@/lib/ai/workflowRootId";
import {
    useAIAttributedPrs,
    useAIWorkflowDrilldownForPr,
} from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIMissingDataPanel } from "./AIMissingDataPanel";

const PAGE_SIZE = 25;

/**
 * Row key doubles as the Work Graph root id — always built via the shared
 * encoder so it matches the backend edge-id format exactly.
 */
export function prRowKey(pr: AiAttributedPr): string {
    return prWorkflowRootId(pr.repoId, pr.number);
}

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

function useFilteredPrs(rows: AiAttributedPr[] | undefined, search: string): AiAttributedPr[] {
    return useMemo(() => {
        if (!rows) return [];
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((pr) => {
            const hay = [pr.title ?? "", pr.kind ?? "", pr.workType ?? "", String(pr.number)]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [rows, search]);
}

function PrTable({
    rows,
    fetching,
    selectedKey,
    onSelect,
}: {
    rows: AiAttributedPr[];
    fetching: boolean;
    selectedKey: string | null;
    onSelect: (pr: AiAttributedPr) => void;
}) {
    if (fetching && rows.length === 0) {
        return (
            <p
                className="rounded-2xl bg-background/60 px-4 py-6 text-center text-sm text-(--ink-muted)"
                data-testid="ai-drilldown-loading"
            >
                Loading AI-attributed pull requests…
            </p>
        );
    }
    if (rows.length === 0) {
        return (
            <p
                className="rounded-2xl bg-background/60 px-4 py-6 text-center text-sm text-(--ink-muted)"
                data-testid="ai-drilldown-empty"
            >
                No AI-attributed pull requests in this range. Adjust the date range, repo, or work
                type filter to find evidence.
            </p>
        );
    }
    return (
        <div
            className="max-h-72 overflow-y-auto rounded-2xl border border-(--border)"
            data-testid="ai-drilldown-table"
        >
            <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card text-xs uppercase tracking-[0.14em] text-(--ink-muted)">
                    <tr>
                        <th className="px-3 py-2 font-semibold">PR</th>
                        <th className="px-3 py-2 font-semibold">Title</th>
                        <th className="px-3 py-2 font-semibold">Kind</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Merged</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--border)">
                    {rows.map((pr) => {
                        const key = prRowKey(pr);
                        const isSelected = key === selectedKey;
                        return (
                            <tr
                                key={key}
                                onClick={() => onSelect(pr)}
                                className={`cursor-pointer transition-colors ${isSelected ? "bg-(--accent-positive)/10" : "hover:bg-background/50"}`}
                                data-testid="ai-drilldown-pr-row"
                                data-pr-key={key}
                            >
                                <td className="px-3 py-2 font-mono text-xs text-(--ink-muted)">
                                    #{pr.number}
                                </td>
                                <td className="px-3 py-2">{pr.title ?? "(untitled)"}</td>
                                <td className="px-3 py-2">{pr.kind ?? "—"}</td>
                                <td className="px-3 py-2 text-(--ink-muted)">
                                    {pr.workType ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-(--ink-muted)">
                                    {formatMergedAt(pr.mergedAt)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function EvidencePanel({ selected }: { selected: AiAttributedPr | null }) {
    const rootId = selected ? prRowKey(selected) : null;
    const { data: drilldown, fetching, error } = useAIWorkflowDrilldownForPr(rootId);

    if (!selected) {
        return (
            <p
                className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)"
                data-testid="ai-drilldown-evidence-prompt"
            >
                Select a pull request above to load Work Graph evidence (nodes + edges with
                provenance).
            </p>
        );
    }
    if (fetching) {
        return (
            <p className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)">
                Loading evidence for PR #{selected.number}…
            </p>
        );
    }
    if (error) {
        return (
            <p
                className="rounded-2xl border border-(--accent-negative)/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
                data-testid="ai-drilldown-evidence-error"
            >
                Evidence unavailable: {error.message}
            </p>
        );
    }
    if (!drilldown || !drilldown.dataAvailable) {
        return (
            <p
                className="rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)"
                data-testid="ai-drilldown-evidence-empty"
            >
                No Work Graph edges recorded for this pull request yet.
            </p>
        );
    }
    return (
        <div className="space-y-3" data-testid="ai-drilldown-evidence">
            <div className="flex items-center justify-between text-xs text-(--ink-muted)">
                <span>
                    {drilldown.nodes.length} nodes · {drilldown.edges.length} edges
                </span>
                {drilldown.partial && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600">
                        partial
                    </span>
                )}
            </div>
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {drilldown.edges.slice(0, 25).map((edge) => (
                    <li
                        key={edge.edgeId}
                        className="rounded-2xl border border-(--border) bg-background/40 px-3 py-2 text-sm"
                    >
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
                            <span className="font-semibold text-foreground">{edge.edgeType}</span>
                            <span>
                                {edge.sourceType}:{edge.sourceId} → {edge.targetType}:
                                {edge.targetId}
                            </span>
                            {edge.provider && (
                                <span className="rounded-full bg-background px-2 py-0.5">
                                    {edge.provider}
                                </span>
                            )}
                            <span>conf {edge.confidence.toFixed(2)}</span>
                        </div>
                        <p className="mt-1 text-(--ink-muted)">{edge.evidence}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

type AIEvidenceExplorerProps = {
    filter: AIFilter;
};

/**
 * PR-evidence explorer: a searchable AI-attributed PR table paired with the
 * Work Graph evidence (nodes + edges with provenance) for the selected PR.
 *
 * Shared body between {@link AIDrilldownModal} (metric drilldowns) and the
 * Governance Risk → Evidence tab, so both surfaces stay behaviourally
 * identical, including their honest loading / empty / error states.
 */
export function AIEvidenceExplorer({ filter }: AIEvidenceExplorerProps) {
    const [search, setSearch] = useState("");
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const { data, fetching, error } = useAIAttributedPrs(filter, PAGE_SIZE);
    const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
    const filteredRows = useFilteredPrs(rows, search);

    // Derive selection from rows so stale selections are dropped automatically
    // when the dashboard filter or fetch result changes — avoids the
    // setState-in-effect cascade flagged by react-hooks/set-state-in-effect.
    const selected = useMemo(
        () => (selectedKey ? (rows.find((row) => prRowKey(row) === selectedKey) ?? null) : null),
        [rows, selectedKey],
    );

    // Unavailable ≠ empty: data_available=false means the PR population could
    // not be computed for this scope, which must not render as the honest-zero
    // "no AI-attributed PRs" state (nor offer a search over nothing).
    if (!fetching && !error && data && !data.dataAvailable) {
        return (
            <div className="mt-4" data-testid="ai-evidence-unavailable">
                <AIMissingDataPanel
                    title="AI-attributed PR evidence is not available"
                    reason="The backend returned data_available=false for the selected scope. Missing evidence is shown explicitly rather than as an empty list."
                    needed="AI attribution joined to pull requests for this scope."
                />
            </div>
        );
    }

    return (
        <>
            <label
                className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-(--ink-muted)"
                htmlFor="ai-drilldown-search"
            >
                Filter PRs
            </label>
            <input
                id="ai-drilldown-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, kind, or PR number"
                className="mt-1 w-full rounded-full border border-(--border) bg-background/60 px-4 py-2 text-sm focus:border-(--accent-positive) focus:outline-none"
                data-testid="ai-drilldown-search"
            />

            <div className="mt-4">
                {error ? (
                    <p
                        className="rounded-2xl border border-(--accent-negative)/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
                        data-testid="ai-drilldown-error"
                    >
                        Failed to load AI-attributed PRs: {error.message}
                    </p>
                ) : (
                    <PrTable
                        rows={filteredRows}
                        fetching={fetching}
                        selectedKey={selected ? prRowKey(selected) : null}
                        onSelect={(pr) => setSelectedKey(prRowKey(pr))}
                    />
                )}
                {data?.hasMore && (
                    <p
                        className="mt-2 text-xs text-(--ink-muted)"
                        data-testid="ai-drilldown-has-more"
                    >
                        Showing the most recent {rows.length} pull requests — narrow the dashboard
                        filters (date range, repo, work type) to refine.
                    </p>
                )}
            </div>

            <div className="mt-5">
                <EvidencePanel selected={selected} />
            </div>
        </>
    );
}

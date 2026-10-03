"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

import { encodeAIFilter, type AIFilter } from "@/lib/filters/ai";
import type { AiAttributedPr } from "@/lib/graphql/__generated__/types";
import { STATUS_PILL } from "@/lib/statusPill";
import { edgeTypeWords, nodeTypeWords, pullRequestNumber } from "@/lib/ai/edgeLabels";
import { prWorkflowRootId } from "@/lib/ai/workflowRootId";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
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

/** Enter or Space on a focused row does what a click does. */
export function activateOnKey(action: () => void) {
    return (event: KeyboardEvent) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            action();
        }
    };
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
            className="max-h-72 overflow-y-auto rounded-2xl border border-(--card-stroke)"
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
                <tbody className="divide-y divide-(--card-stroke)">
                    {rows.map((pr) => {
                        const key = prRowKey(pr);
                        const isSelected = key === selectedKey;
                        return (
                            <tr
                                key={key}
                                onClick={() => onSelect(pr)}
                                onKeyDown={activateOnKey(() => onSelect(pr))}
                                tabIndex={0}
                                className={`cursor-pointer transition-colors ${isSelected ? "bg-(--accent-positive)/10 shadow-[inset_0.1875rem_0_0_var(--accent)]" : "hover:bg-background/50"}`}
                                data-testid="ai-drilldown-pr-row"
                                data-pr-key={key}
                                aria-selected={isSelected}
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

/** One end of an edge in words: node type, then a number or a safe label for the id. */
function EdgeEnd({ type, id }: { type: string; id: string }) {
    const number = pullRequestNumber(type, id);
    return (
        <>
            {nodeTypeWords(type)}{" "}
            {number ? `#${number}` : <EntityLabel id={id} showUnresolvedBadge={false} />}
        </>
    );
}

const PANEL_SHELL = "min-w-0 lg:pt-1";
const PANEL_NOTE = "rounded-2xl bg-background/60 px-4 py-4 text-sm text-(--ink-muted)";

/**
 * The Work Graph evidence of one PR: the count line and the Partial pill, then one card per edge, with
 * honest loading, error and empty states. It loads on mount, so it is the body of the shared evidence
 * drawer (`scrollList` false: the drawer scrolls) and of the inline side panel (`scrollList` true).
 */
export function WorkGraphEvidenceBody({
    selected,
    scrollList = false,
}: {
    selected: AiAttributedPr | null;
    scrollList?: boolean;
}) {
    const rootId = selected ? prRowKey(selected) : null;
    const { data: drilldown, fetching, error } = useAIWorkflowDrilldownForPr(rootId);

    let body: ReactNode;
    if (!selected) {
        body = (
            <p className={PANEL_NOTE} data-testid="ai-drilldown-evidence-prompt">
                Select a PR in the table to load Work Graph evidence (nodes + edges with
                provenance).
            </p>
        );
    } else if (fetching) {
        body = <p className={PANEL_NOTE}>Loading Work Graph evidence…</p>;
    } else if (error) {
        body = (
            <p
                className={`rounded-2xl border px-4 py-3 text-sm ${STATUS_PILL.negative}`}
                data-testid="ai-drilldown-evidence-error"
            >
                Evidence unavailable: {error.message}
            </p>
        );
    } else if (!drilldown || !drilldown.dataAvailable) {
        body = (
            <p className={PANEL_NOTE} data-testid="ai-drilldown-evidence-empty">
                No Work Graph edges recorded for this pull request yet.
            </p>
        );
    } else {
        body = (
            <div className="space-y-3" data-testid="ai-drilldown-evidence">
                <div className="flex items-center justify-between gap-3 text-xs text-(--ink-muted)">
                    <span>
                        {drilldown.nodes.length} nodes · {drilldown.edges.length} edges
                    </span>
                    {drilldown.partial && (
                        <span
                            data-testid="ai-evidence-partial"
                            className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_PILL.caution}`}
                        >
                            Partial
                        </span>
                    )}
                </div>
                <ul
                    className={
                        scrollList ? "max-h-[32rem] space-y-2 overflow-y-auto pr-1" : "space-y-2"
                    }
                >
                    {drilldown.edges.slice(0, 25).map((edge) => (
                        <li
                            key={edge.edgeId}
                            className="rounded-2xl border border-(--card-stroke) bg-background/40 px-3 py-2.5 text-sm"
                        >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--ink-muted)">
                                <span className="font-semibold text-foreground">
                                    {edgeTypeWords(edge.edgeType)}
                                </span>
                                <span data-testid="ai-edge-ends">
                                    <EdgeEnd type={edge.sourceType} id={edge.sourceId} />
                                    {" → "}
                                    <EdgeEnd type={edge.targetType} id={edge.targetId} />
                                </span>
                                {edge.provider && (
                                    <span className="rounded-full bg-background px-2 py-0.5">
                                        {edge.provider}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1.5 text-xs text-(--ink-muted)">
                                confidence {edge.confidence.toFixed(2)}
                            </p>
                            <p className="mt-1 text-(--ink-muted)">{edge.evidence}</p>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-(--ink-muted)">
                    An edge shows that two records are connected. It does not show cause.
                </p>
            </div>
        );
    }
    return body;
}

export function EvidencePanel({
    selected,
    showTitle = true,
}: {
    selected: AiAttributedPr | null;
    /** False where the caller's own card already carries the "Work Graph evidence" title. */
    showTitle?: boolean;
}) {
    // The side panel beside the PR table (MAPPING-CHAOS-7629 E5): titled with the PR, then the body.
    const title = selected ? `Work Graph evidence · PR #${selected.number}` : "Work Graph evidence";
    return (
        <aside
            className={PANEL_SHELL}
            aria-label="Work Graph evidence"
            data-testid="ai-work-graph-evidence"
        >
            {showTitle ? <h3 className="text-h3 font-semibold">{title}</h3> : null}
            <div className={showTitle ? "mt-2" : undefined}>
                <WorkGraphEvidenceBody selected={selected} scrollList />
            </div>
        </aside>
    );
}

/**
 * Opens the shared evidence drawer for one PR (CHAOS-8151). The selection is cleared when the drawer
 * closes or another PR replaces it. `open` goes first: it calls the previous subject's `onClose`,
 * which would otherwise clear the key just set.
 */
export function usePrEvidenceDrawer(
    setSelectedKey: (key: string | null) => void,
    /** The scope the PR list is for: a drawer of the old scope must not outlive a scope change. */
    scopeKey: string,
) {
    const drawer = useEvidenceDrawer();
    const { close } = drawer;
    useEffect(() => close, [scopeKey, close]);
    return (pr: AiAttributedPr) => {
        drawer.open({
            title: `Work Graph evidence · PR #${pr.number}`,
            content: <WorkGraphEvidenceBody selected={pr} />,
            onClose: () => setSelectedKey(null),
        });
        setSelectedKey(prRowKey(pr));
    };
}

type AIEvidenceExplorerProps = {
    filter: AIFilter;
};

type ExplorerViewProps = {
    filter: AIFilter;
    selectedKey: string | null;
    onSelect: (pr: AiAttributedPr) => void;
    /** The inline side panel; absent when the evidence opens in the shared drawer. */
    renderAside?: (selected: AiAttributedPr | null) => ReactNode;
};

function ExplorerView({ filter, selectedKey, onSelect, renderAside }: ExplorerViewProps) {
    const [search, setSearch] = useState("");

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
        <div
            className={
                renderAside
                    ? "mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,26rem)]"
                    : "mt-4"
            }
        >
            <div className="min-w-0">
                <label
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-(--ink-muted)"
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
                    className="mt-1 w-full rounded-full border border-(--card-stroke) bg-background/60 px-4 py-2 text-sm focus:border-(--accent-positive) focus:outline-none"
                    data-testid="ai-drilldown-search"
                />

                <div className="mt-4">
                    {error ? (
                        <p
                            className={`rounded-2xl border px-4 py-3 text-sm ${STATUS_PILL.negative}`}
                            data-testid="ai-drilldown-error"
                        >
                            Failed to load AI-attributed PRs: {error.message}
                        </p>
                    ) : (
                        <PrTable
                            rows={filteredRows}
                            fetching={fetching}
                            selectedKey={selected ? prRowKey(selected) : null}
                            onSelect={onSelect}
                        />
                    )}
                    {data?.hasMore && (
                        <p
                            className="mt-2 text-xs text-(--ink-muted)"
                            data-testid="ai-drilldown-has-more"
                        >
                            Showing the most recent {rows.length} pull requests — narrow the
                            dashboard filters (date range, repo, work type) to refine.
                        </p>
                    )}
                </div>
            </div>
            {renderAside ? renderAside(selected) : null}
        </div>
    );
}

/**
 * PR-evidence explorer with the Work Graph evidence in an inline side panel. It is the body of the
 * wide Drawer on Review Load and Governance Risk: a second drawer must not open on top of that one,
 * so the evidence stays beside the table there (CHAOS-8151).
 */
export function AIEvidenceExplorer({ filter }: AIEvidenceExplorerProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    return (
        <ExplorerView
            filter={filter}
            selectedKey={selectedKey}
            onSelect={(pr) => setSelectedKey(prRowKey(pr))}
            renderAside={(selected) => <EvidencePanel selected={selected} />}
        />
    );
}

/**
 * PR-evidence explorer on a page: a searchable AI-attributed PR table; selecting a PR opens its Work
 * Graph evidence (nodes + edges with provenance) in the shared evidence drawer (CHAOS-8151). It needs
 * `EvidenceDrawerProvider`, which the `(app)` layout mounts.
 */
export function AIEvidenceExplorerWithDrawer({ filter }: AIEvidenceExplorerProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const openEvidence = usePrEvidenceDrawer(setSelectedKey, encodeAIFilter(filter));
    return <ExplorerView filter={filter} selectedKey={selectedKey} onSelect={openEvidence} />;
}

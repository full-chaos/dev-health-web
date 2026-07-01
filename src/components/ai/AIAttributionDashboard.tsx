"use client";

import { useState } from "react";

import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { encodeAIFilter, type AIFilter } from "@/lib/filters/ai";
import type { AiAttributionEvidenceRow } from "@/lib/graphql/__generated__/types";
import { useAIAttributionOverview } from "@/lib/graphql/hooks/useAIReviewRisk";
import { AIAttributionBadge, attributionBucketForKind } from "./AIAttributionBadge";
import { bucketLabel, formatPercent } from "./utils";

const PAGE_SIZE = 25;

type AIAttributionDashboardProps = {
    filter: AIFilter;
};

function formatObservedAt(value: string | null | undefined): string {
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

function evidenceRowKey(row: AiAttributionEvidenceRow): string {
    return `${row.subjectType}:${row.subjectId}:${row.source}`;
}

/**
 * Dedicated AI Attribution home (CHAOS-2744). Wires the mix + evidence
 * projections from `aiAttributionOverview` -- persisted resolver output only;
 * this component never derives attribution or evidence client-side. Copy
 * uses tentative "appears/suggests/leans" language per the platform AI-output
 * labeling contract; it never asserts a signal "is" or "determined".
 */
export function AIAttributionDashboard({ filter }: AIAttributionDashboardProps) {
    const [offset, setOffset] = useState(0);

    // Reset pagination when the scope changes, mirroring AIImpactEvidenceList
    // (React-recommended "adjust state during render" pattern, not useEffect --
    // see https://react.dev/reference/react/useState#storing-information-from-previous-renders).
    const filterKey = encodeAIFilter(filter);
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
    if (filterKey !== prevFilterKey) {
        setPrevFilterKey(filterKey);
        setOffset(0);
    }

    const { data, fetching, error } = useAIAttributionOverview(filter, PAGE_SIZE, offset);

    if (error) {
        return (
            <DataState
                variant="error"
                title="AI attribution data could not load"
                message={error.message}
            />
        );
    }

    if (fetching && !data) {
        return <DashboardSkeleton />;
    }

    if (data && !data.dataAvailable) {
        return (
            <DataState
                variant="no-data-connected"
                title="No AI attribution data yet"
                description="Attribution evidence appears once a provider is connected and at least one PR, commit, issue, or review resolves to an AI-involvement signal for the selected scope."
            />
        );
    }

    const mix = data?.mix ?? [];
    const rows = data?.rows ?? [];
    const totalAttributed = data?.totalAttributed ?? 0;

    return (
        <div className="flex flex-col gap-6" data-testid="ai-attribution-dashboard">
            <section
                className="rounded-3xl border border-(--card-stroke) bg-card p-5 shadow-sm"
                data-testid="ai-attribution-mix"
            >
                <h2 className="font-(--font-display) text-lg font-semibold">Attribution mix</h2>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Of {totalAttributed} resolved signal{totalAttributed === 1 ? "" : "s"} in this
                    window, work appears to split across the following kinds. There is no human
                    bucket here — this view only reflects subjects with a detected AI signal.
                </p>
                {mix.length === 0 ? (
                    <div className="mt-4">
                        <DataState variant="detector-enabled-no-findings" />
                    </div>
                ) : (
                    <ul className="mt-4 flex flex-col gap-3" data-testid="ai-attribution-mix-rows">
                        {mix.map((row) => (
                            <li
                                key={row.kind}
                                className="flex items-center gap-3"
                                data-testid="ai-attribution-mix-row"
                            >
                                <AIAttributionBadge bucket={attributionBucketForKind(row.kind)} />
                                <span className="text-sm text-(--ink-muted)">
                                    {bucketLabel(row.kind)}
                                </span>
                                <div className="ml-auto flex items-center gap-3">
                                    <div className="h-2 w-32 overflow-hidden rounded-full bg-background/60">
                                        <div
                                            className="h-full rounded-full bg-accent"
                                            style={{ width: `${Math.min(100, row.share * 100)}%` }}
                                        />
                                    </div>
                                    <span className="w-20 text-right text-sm tabular-nums text-(--ink-muted)">
                                        {row.count} · {formatPercent(row.share)}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section
                className="rounded-3xl border border-(--card-stroke) bg-card p-5 shadow-sm"
                data-testid="ai-attribution-evidence"
            >
                <h2 className="font-(--font-display) text-lg font-semibold">
                    Attribution evidence
                </h2>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Every persisted signal behind the mix above, with the source, confidence, and
                    raw evidence that produced it -- never recomputed here.
                </p>

                {rows.length === 0 ? (
                    <div className="mt-4">
                        <DataState
                            variant="detector-enabled-no-findings"
                            title="No evidence rows on this page"
                            description="Attribution is connected, but this page of the selected window returned no evidence."
                        />
                    </div>
                ) : (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-(--card-stroke)">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-background/60 text-xs uppercase tracking-[0.14em] text-(--ink-muted)">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Subject</th>
                                    <th className="px-4 py-3 font-semibold">Attribution</th>
                                    <th className="px-4 py-3 font-semibold">Source</th>
                                    <th className="px-4 py-3 font-semibold">Provider</th>
                                    <th className="px-4 py-3 font-semibold">Team</th>
                                    <th className="px-4 py-3 font-semibold">Observed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-(--card-stroke)">
                                {fetching ? (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-4 py-8 text-center text-(--ink-muted)"
                                            data-testid="ai-attribution-evidence-loading"
                                        >
                                            Loading attribution evidence…
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row) => (
                                        <tr
                                            key={evidenceRowKey(row)}
                                            data-testid="ai-attribution-evidence-row"
                                        >
                                            <td className="px-4 py-3 font-mono text-xs text-(--ink-muted)">
                                                {row.subjectType} #{row.subjectId}
                                            </td>
                                            <td className="px-4 py-3">
                                                <AIAttributionBadge
                                                    bucket={attributionBucketForKind(row.kind)}
                                                    confidence={row.confidence}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-(--ink-muted)">
                                                {bucketLabel(row.source)}
                                            </td>
                                            <td className="px-4 py-3 text-(--ink-muted)">
                                                {row.provider}
                                            </td>
                                            <td className="px-4 py-3 text-(--ink-muted)">
                                                {row.teamId ?? "—"}
                                            </td>
                                            <td className="px-4 py-3 text-(--ink-muted)">
                                                {formatObservedAt(row.observedAt)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-4 flex items-center justify-between text-sm text-(--ink-muted)">
                    <span data-testid="ai-attribution-evidence-count">
                        {data ? `${totalAttributed} resolved signals` : ""}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={offset === 0 || fetching}
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs font-semibold disabled:opacity-40"
                        >
                            {CTA_LABELS.previousPage}
                        </button>
                        <button
                            type="button"
                            disabled={!data?.hasMore || fetching}
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs font-semibold disabled:opacity-40"
                        >
                            {CTA_LABELS.nextPage}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2" data-testid="ai-attribution-loading">
            {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-3xl bg-(--card-80)" />
            ))}
        </div>
    );
}

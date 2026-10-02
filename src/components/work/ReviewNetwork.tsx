"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { MetricCard } from "@/components/metrics/MetricCard";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import type { ReviewEdgeRow } from "@/lib/graphql/reviewEdgesFetchers";

// Review Network tab: reviewer to author collaboration pairs from code review activity
// (CHAOS-2077). Data comes from review_edges_daily (the reviewEdges resolver), one row per
// reviewer, author, repo and day; the tab sums them per (reviewer, author) over the window and
// orders them by reviews, high to low. Identities are the stored identity (an e-mail address);
// the client has no org-scoped display-name lookup, so a person shows as the part before "@"
// with the full identity in the tooltip and for screen readers (a resolved display name needs an
// identity read: CHAOS-7732).

type ReviewPair = { reviewer: string; author: string; totalReviews: number };

/** Aggregate raw per-day rows into (reviewer, author, totalReviews), most reviews first. */
export function aggregateReviewEdges(rawEdges: ReviewEdgeRow[]): ReviewPair[] {
    const map = new Map<string, number>();
    for (const row of rawEdges) {
        const key = `${row.reviewer}\t${row.author}`;
        map.set(key, (map.get(key) ?? 0) + row.reviewsCount);
    }
    return Array.from(map.entries())
        .map(([key, totalReviews]) => {
            const [reviewer, author] = key.split("\t") as [string, string];
            return { reviewer, author, totalReviews };
        })
        .sort((a, b) => b.totalReviews - a.totalReviews);
}

/** The part of an identity before "@"; an identity without "@" is shown whole, once. */
export function identityLocalPart(identity: string): string {
    const atIndex = identity.indexOf("@");
    return atIndex > 0 ? identity.slice(0, atIndex) : identity;
}

function Person({ identity }: { identity: string }) {
    const local = identityLocalPart(identity);
    return (
        <>
            <span className="font-medium" title={identity}>
                {local}
            </span>
            {/* The full identity for a screen reader; shown only when the cell text is shorter. */}
            {local !== identity && <span className="sr-only"> ({identity})</span>}
        </>
    );
}

type ReviewNetworkViewProps = {
    edges: ReviewEdgeRow[] | null;
    loading: boolean;
    error: string | null;
};

export function ReviewNetworkView({ edges, loading, error }: ReviewNetworkViewProps) {
    const router = useRouter();
    const rows = useMemo(() => (edges ? aggregateReviewEdges(edges) : []), [edges]);

    // Distinct reviewers and authors, and total reviews, for the three tiles.
    const reviewerCount = useMemo(() => new Set(rows.map((r) => r.reviewer)).size, [rows]);
    const authorCount = useMemo(() => new Set(rows.map((r) => r.author)).size, [rows]);
    const totalReviews = useMemo(() => rows.reduce((sum, r) => sum + r.totalReviews, 0), [rows]);
    const maxReviews = rows.reduce((m, r) => Math.max(m, r.totalReviews), 1);

    const columns: DataTableColumn<ReviewPair>[] = [
        {
            key: "reviewer",
            header: "Reviewer",
            render: (row) => <Person identity={row.reviewer} />,
            className: "px-4 py-3 align-middle",
            headerClassName: "px-4 py-3 font-medium",
        },
        {
            key: "author",
            header: "Author",
            render: (row) => <Person identity={row.author} />,
            className: "px-4 py-3 align-middle",
            headerClassName: "px-4 py-3 font-medium",
        },
        {
            key: "reviews",
            header: "Reviews",
            render: (row) => formatNumber(row.totalReviews),
            numeric: true,
            className: "px-4 py-3",
            headerClassName: "px-4 py-3 font-medium",
        },
        {
            key: "share",
            header: "Share",
            // Width = the pair's reviews / the top pair's reviews (the Reviews column carries the
            // number, so the bar is decoration).
            render: (row) => (
                <div
                    aria-hidden
                    className="h-2 w-40 max-w-full rounded-r-(--radius-sm) bg-(--card-stroke)"
                >
                    <div
                        data-share-fill
                        className="h-full rounded-r-(--radius-sm) bg-(--chart-color-1)"
                        style={{
                            width: `${Math.round((row.totalReviews / maxReviews) * 100)}%`,
                            minWidth: 2,
                        }}
                    />
                </div>
            ),
            className: "px-4 py-3 align-middle",
            headerClassName: "px-4 py-3 font-medium",
        },
    ];

    return (
        <section
            className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm"
            data-testid="review-network-panel"
        >
            <div className="mb-4">
                <h3 className="text-lg font-semibold tracking-tight">Review Network</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Reviewer→author collaboration pairs from code review activity, ranked by review
                    count.
                </p>
            </div>

            {loading ? (
                <DataState variant="loading" title="Loading…" />
            ) : error ? (
                <DataState
                    variant="error"
                    title="Failed to load review network"
                    message={error}
                    action={
                        <button
                            type="button"
                            onClick={() => router.refresh()}
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground hover:bg-(--card-70)"
                        >
                            {CTA_LABELS.retry}
                        </button>
                    }
                />
            ) : rows.length === 0 ? (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No review relationships to show"
                    description="No reviewer→author activity was recorded in this scope and window. Widen the date range or remove repo filters to see data."
                />
            ) : (
                <>
                    <div
                        className="mb-4 grid gap-4 sm:grid-cols-3"
                        data-testid="review-network-tiles"
                    >
                        {[
                            ["Reviewer", reviewerCount],
                            ["Author", authorCount],
                            ["Total review", totalReviews],
                        ].map(([label, count]) => {
                            const n = count as number;
                            return (
                                <MetricCard
                                    key={label}
                                    label={`${label}${n === 1 ? "" : "s"}`}
                                    value={n}
                                    deltaSlot={<></>}
                                    noTrendLabel=""
                                />
                            );
                        })}
                    </div>
                    <div data-testid="review-network-table">
                        <DataTable
                            accessibleLabel="Reviewer to author review pairs"
                            columns={columns}
                            data={rows}
                            rowKeyAction={(row) => `${row.reviewer}|${row.author}`}
                            emptyMessage="No review relationships to show"
                            renderRowAction={(row) => (
                                <tr
                                    data-testid="review-network-row"
                                    className="transition-colors hover:bg-background"
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={column.key}
                                            className={`${column.className ?? ""}${column.numeric ? " text-right tabular-nums" : ""}`}
                                        >
                                            {column.render(row)}
                                        </td>
                                    ))}
                                </tr>
                            )}
                        />
                    </div>
                </>
            )}
        </section>
    );
}

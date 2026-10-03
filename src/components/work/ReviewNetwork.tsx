"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { Section } from "@/components/ui/Section";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { hasEmailAddress } from "@/lib/graphql/reviewEdgeIdentities";
import type { ReviewEdgeRow } from "@/lib/graphql/reviewEdgesFetchers";

// Review Network tab: reviewer to author collaboration pairs from code review activity
// (CHAOS-2077). Data comes from review_edges_daily (the reviewEdges resolver), one row per
// reviewer, author, repo and day; the tab sums them per (reviewer, author) over the window and
// orders them by reviews, high to low.
//
// People (CHAOS-7973, ruling 51; CHAOS-8485): a cell shows the served display name, and NEVER an
// e-mail address or a part of one. The API serves a display name (null when none is known) and an
// opaque key for each person; the request does not ask for the stored identities, which can be
// e-mail addresses. A row here has a key per person (never shown; it joins rows and counts
// people) and a name. A person with no name reads "Not reported".

type ReviewPair = {
    reviewer: string;
    author: string;
    reviewerName: string | null;
    authorName: string | null;
    totalReviews: number;
};

/** Aggregate raw per-day rows into one pair per (reviewer key, author key), most reviews first. */
export function aggregateReviewEdges(rawEdges: ReviewEdgeRow[]): ReviewPair[] {
    const map = new Map<string, ReviewPair>();
    for (const row of rawEdges) {
        const key = `${row.reviewer}\t${row.author}`;
        const pair = map.get(key);
        if (pair) {
            pair.totalReviews += row.reviewsCount;
        } else {
            map.set(key, {
                reviewer: row.reviewer,
                author: row.author,
                reviewerName: row.reviewerName ?? null,
                authorName: row.authorName ?? null,
                totalReviews: row.reviewsCount,
            });
        }
    }
    return Array.from(map.values()).sort((a, b) => b.totalReviews - a.totalReviews);
}

/**
 * A person's cell: the served name, or "Not reported" when no name is served. The key of the
 * person is never shown. The address check is the second guard (the server is the first): a name
 * that holds an e-mail address is not shown.
 */
function Person({ name }: { name: string | null }) {
    if (name === null || hasEmailAddress(name)) {
        return <span className="text-(--ink-muted)">{NOT_REPORTED}</span>;
    }
    return <span className="font-medium">{name}</span>;
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
            render: (row) => <Person name={row.reviewerName} />,
            className: "px-4 py-3 align-middle",
            headerClassName: "px-4 py-3 font-medium",
        },
        {
            key: "author",
            header: "Author",
            render: (row) => <Person name={row.authorName} />,
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
        <Section
            data-testid="review-network-panel"
            as="h3"
            title="Review Network"
            description="Reviewer-to-author collaboration—not a performance ranking."
        >
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
                    <MetricStrip className="mb-4" data-testid="review-network-tiles">
                        {[
                            ["Reviewer", reviewerCount, "distinct reviewers in the pairs below"],
                            ["Author", authorCount, "distinct authors in the pairs below"],
                            [
                                "Total review",
                                totalReviews,
                                "sum of the reviews counted in the pairs",
                            ],
                        ].map(([label, count, note]) => {
                            const n = count as number;
                            return (
                                <MetricCard
                                    key={label as string}
                                    label={`${label}${n === 1 ? "" : "s"}`}
                                    value={n}
                                    hideTrend
                                    deltaSlot={<span>{note as string}</span>}
                                />
                            );
                        })}
                    </MetricStrip>
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
        </Section>
    );
}

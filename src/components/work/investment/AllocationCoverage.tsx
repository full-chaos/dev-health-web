"use client";

import { useMemo } from "react";
import { DataState } from "@/components/ui/DataState";
import { formatNumber } from "@/lib/formatters";
import { isUnassignedLabel, stripSankeyPrefix } from "@/lib/investment";
import type { SankeyResponse } from "@/lib/types";

type AllocationCoverageProps = {
    teamCategoryFlow: SankeyResponse | null | undefined;
    repoTeamFlow: SankeyResponse | null | undefined;
    isLoading: boolean;
};

type CoverageReading = {
    teamCoverage: number | null;
    repoCoverage: number | null;
    unassignedShare: number | null;
};

/**
 * Share of total flow value that passes through an "unassigned" node.
 *
 * CHAOS-4756: an unassigned node's throughput is `max(inbound, outbound)` on
 * whichever hop it actually appears on. A TEAM node in a
 * `TEAM -> THEME -> REPO` flow is only ever a link SOURCE (first hop), so
 * summing only inbound links (the prior bug) always read 0 there. The
 * denominator sums only that SAME hop -- every link whose relevant endpoint
 * shares the node's group -- not every link across every hop in the flow;
 * summing all hops would roughly halve the ratio for a multi-hop flow.
 *
 * Returns `null` (never a spurious `0`) when no unassigned node's group
 * participates in any link -- the flow shape cannot express a share, so the
 * caller should fall back to another flow. Returns a real `0` only when an
 * unassigned node exists and genuinely carries zero flow.
 */
function computeUnassignedShare(flow: SankeyResponse): number | null {
    const unassignedNodes = flow.nodes.filter((node) =>
        isUnassignedLabel(stripSankeyPrefix(node.name)),
    );
    if (unassignedNodes.length === 0) {
        return null;
    }

    const groupByName = new Map(flow.nodes.map((node) => [node.name, node.group]));
    let unassignedThroughput = 0;
    let comparableTotal = 0;
    const measuredHops = new Set<string>();

    for (const node of unassignedNodes) {
        const inbound = flow.links
            .filter((link) => link.target === node.name)
            .reduce((sum, link) => sum + link.value, 0);
        const outbound = flow.links
            .filter((link) => link.source === node.name)
            .reduce((sum, link) => sum + link.value, 0);
        unassignedThroughput += Math.max(inbound, outbound);

        const onSourceHop = outbound >= inbound;
        const hopKey = `${node.group ?? ""}:${onSourceHop ? "source" : "target"}`;
        if (measuredHops.has(hopKey)) {
            continue;
        }
        measuredHops.add(hopKey);
        comparableTotal += flow.links
            .filter(
                (link) => groupByName.get(onSourceHop ? link.source : link.target) === node.group,
            )
            .reduce((sum, link) => sum + link.value, 0);
    }

    return comparableTotal > 0 ? unassignedThroughput / comparableTotal : null;
}

export function readCoverage(flow: SankeyResponse | null | undefined): CoverageReading {
    if (!flow) {
        return { teamCoverage: null, repoCoverage: null, unassignedShare: null };
    }
    const teamCoverage = flow.coverage?.team ?? flow.team_coverage ?? null;
    const repoCoverage = flow.coverage?.repo ?? flow.repo_coverage ?? null;

    return { teamCoverage, repoCoverage, unassignedShare: computeUnassignedShare(flow) };
}

const asPct = (value: number) =>
    formatNumber(value <= 1 ? value * 100 : value, { maximumFractionDigits: 0 });

/**
 * Coverage gaps + unassigned ownership, shown beside the Allocation visuals.
 *
 * Allocation answers "how is effort distributed across teams, repos, and
 * themes?" — so the honest counterpart is "how much of that effort could NOT be
 * attributed?". This reads coverage and unassigned shares straight off the
 * persisted Sankey responses (no recomputation) and degrades to an honest empty
 * state when no allocation path exists for the window.
 */
export function AllocationCoverage({
    teamCategoryFlow,
    repoTeamFlow,
    isLoading,
}: AllocationCoverageProps) {
    const reading = useMemo(() => {
        const primary = readCoverage(teamCategoryFlow);
        const secondary = readCoverage(repoTeamFlow);
        return {
            teamCoverage: primary.teamCoverage ?? secondary.teamCoverage,
            repoCoverage: primary.repoCoverage ?? secondary.repoCoverage,
            unassignedShare: primary.unassignedShare ?? secondary.unassignedShare ?? null,
        };
    }, [teamCategoryFlow, repoTeamFlow]);

    if (isLoading) {
        return <DataState variant="loading" />;
    }

    const hasAnySignal =
        reading.teamCoverage !== null ||
        reading.repoCoverage !== null ||
        reading.unassignedShare !== null;

    if (!hasAnySignal) {
        return (
            <DataState
                variant="insufficient-confidence"
                title="Coverage not available yet"
                description="No allocation path resolved for this scope and window, so team and repo coverage cannot be summarized."
            />
        );
    }

    const cards = [
        {
            id: "team",
            label: "Team coverage",
            value: reading.teamCoverage,
            gapLabel: "unmapped to a team",
        },
        {
            id: "repo",
            label: "Repo coverage",
            value: reading.repoCoverage,
            gapLabel: "unmapped to a repo",
        },
    ];

    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <div>
                <h3 className="font-(--font-display) text-lg">
                    Coverage gaps &amp; unassigned ownership
                </h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    How much of the distributed effort resolved to a known team and repository. Gaps
                    appear in the allocation paths as unassigned nodes.
                </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {cards.map((card) => (
                    <div
                        key={card.id}
                        className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4"
                    >
                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            {card.label}
                        </p>
                        {card.value !== null ? (
                            <>
                                <p className="mt-2 text-2xl font-(--font-display)">
                                    {asPct(card.value)}%
                                </p>
                                <p className="mt-1 text-xs text-(--ink-muted)">
                                    {asPct(Math.max(0, (card.value <= 1 ? 1 : 100) - card.value))}%{" "}
                                    {card.gapLabel}
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 text-sm text-(--ink-muted)">Not reported</p>
                        )}
                    </div>
                ))}
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Unassigned ownership
                    </p>
                    {reading.unassignedShare !== null ? (
                        <>
                            <p className="mt-2 text-2xl font-(--font-display)">
                                {asPct(reading.unassignedShare)}%
                            </p>
                            <p className="mt-1 text-xs text-(--ink-muted)">
                                of effort flows through unassigned nodes
                            </p>
                        </>
                    ) : (
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            No unassigned nodes detected
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

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
 * Share of TEAM throughput that passes through an unassigned TEAM node.
 *
 * "Unassigned ownership" is a team-ownership metric -- the sibling cards are
 * team/repo coverage, and the measured defect (CHAOS-4756/CHAOS-4716) is
 * entirely about `TEAM:unassigned`. Scoping to the `team` group is
 * deliberate, not incidental: an earlier version of this reducer considered
 * ANY node labeled "unassigned" (team, theme, subcategory, repo) and summed
 * every such group's hop total into one denominator. A primary
 * `TEAM -> THEME -> REPO` flow can legitimately carry a mid-path unassigned
 * THEME alongside an unassigned TEAM; blending the two hop totals produced a
 * number that was neither share (codex review, CHAOS-4756 round 1: 60/100
 * team-unassigned blended with a 40-unit unassigned-category hop read as
 * 0.5, not the true 0.6).
 *
 * TEAM nodes sit on exactly one side of a single hop in both flows this
 * component reads: SOURCE in `TEAM -> THEME -> REPO`, TARGET in
 * `REPO -> TEAM`. Measure whichever side actually carries team flow, for
 * both the unassigned throughput and the comparable team total, so the
 * ratio is always share-of-team-throughput -- never a cross-dimension
 * average.
 *
 * Returns `null` (never a spurious `0`) when no TEAM node participates in
 * any link -- the flow shape cannot express a share, so the caller should
 * fall back to another flow. Returns a real `0` only when unassigned TEAM
 * nodes exist and genuinely carry zero flow.
 */
function computeUnassignedShare(flow: SankeyResponse): number | null {
    const teamNodeNames = new Set(
        flow.nodes.filter((node) => node.group === "team").map((node) => node.name),
    );
    const unassignedTeamNames = new Set(
        flow.nodes
            .filter(
                (node) => node.group === "team" && isUnassignedLabel(stripSankeyPrefix(node.name)),
            )
            .map((node) => node.name),
    );
    if (unassignedTeamNames.size === 0) {
        return null;
    }

    let teamOutbound = 0;
    let teamInbound = 0;
    let unassignedOutbound = 0;
    let unassignedInbound = 0;
    for (const link of flow.links) {
        if (teamNodeNames.has(link.source)) {
            teamOutbound += link.value;
            if (unassignedTeamNames.has(link.source)) {
                unassignedOutbound += link.value;
            }
        }
        if (teamNodeNames.has(link.target)) {
            teamInbound += link.value;
            if (unassignedTeamNames.has(link.target)) {
                unassignedInbound += link.value;
            }
        }
    }

    const onSourceHop = teamOutbound >= teamInbound;
    const comparableTotal = onSourceHop ? teamOutbound : teamInbound;
    const unassignedThroughput = onSourceHop ? unassignedOutbound : unassignedInbound;

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

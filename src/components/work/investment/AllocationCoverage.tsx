"use client";

import { useMemo } from "react";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { formatNumber } from "@/lib/formatters";
import {
    COVERAGE_UNAVAILABLE_REASON,
    isUnassignedLabel,
    readFlowCoverage,
    stripSankeyPrefix,
} from "@/lib/investment";
import type { SankeyResponse } from "@/lib/types";

type AllocationCoverageProps = {
    teamCategoryFlow: SankeyResponse | null | undefined;
    repoTeamFlow: SankeyResponse | null | undefined;
    isLoading: boolean;
    /**
     * `strip` (default): three joined tiles, for the Allocation tab. `facts`: a "Coverage gaps"
     * card of fact rows, for the Confidence tab. Both print the same reading.
     */
    variant?: "strip" | "facts";
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
 *
 * `SankeyLink.source`/`target` reference nodes by `name` alone -- there is
 * no id on the wire (CHAOS-4772 tracks adding one). ANY node name that
 * occurs more than once in `flow.nodes` is therefore structurally
 * ambiguous: a link touching that name cannot be attributed to a single
 * node, whether the two node entries differ by group (a TEAM and a mid-path
 * THEME both literally "Unassigned", codex round 2: inflated 0.6 to 0.714 by
 * attributing the THEME's flow to the team) or share the exact same group
 * (two distinct TEAM entries both named "Unassigned", codex round 4:
 * returned 1 instead of null, since the round-2 guard only checked for
 * cross-group collisions).
 *
 * Crucially, an ambiguous name FAILS THE WHOLE FLOW CLOSED (returns `null`)
 * rather than being dropped from consideration while its unambiguous
 * siblings are still measured: silently excluding just the ambiguous node
 * still lets a denominator built from the REMAINING names stand in as if it
 * were the true team total (codex round 5, P1 EXECUTED: an unassigned team
 * carrying 60, plus two DIFFERENT team nodes both named "Fullchaos" carrying
 * 40 and 20, excluded only "Fullchaos" and left a denominator of 60 instead
 * of the true 120 -- reading 1.0 instead of bailing to `null`). A single
 * ambiguous team name makes the ENTIRE flow's team denominator
 * untrustworthy, not just that one node's own contribution.
 *
 * A prior version decided which side (inbound vs outbound) to measure ONCE,
 * from the TEAM group's aggregate totals, then applied that choice to every
 * team node. That breaks for a shape neither real flow_mode this component
 * reads actually produces, but that a valid `SankeyResponse` can still
 * describe: a TEAM node that is itself mid-path (both inbound AND outbound),
 * or team nodes split across both directions in the same flow. Either shape
 * has no single hop to measure a share on (codex round 3, P1 EXECUTED: a
 * mid-path unassigned TEAM with inbound 60/outbound 40 alongside an
 * inbound-only and an outbound-only assigned team tied the group totals at
 * 100/100, and the `>=` tiebreak silently picked the wrong side, 0.4 instead
 * of 0.6). Bail to `null` per node and per flow instead of guessing.
 */
function computeUnassignedShare(flow: SankeyResponse): number | null {
    const nodeOccurrencesByName = new Map<string, number>();
    for (const node of flow.nodes) {
        nodeOccurrencesByName.set(node.name, (nodeOccurrencesByName.get(node.name) ?? 0) + 1);
    }

    const teamNodeNames = new Set(
        flow.nodes.filter((node) => node.group === "team").map((node) => node.name),
    );
    for (const name of teamNodeNames) {
        if ((nodeOccurrencesByName.get(name) ?? 0) > 1) {
            return null;
        }
    }

    const unassignedTeamNames = new Set(
        [...teamNodeNames].filter((name) => isUnassignedLabel(stripSankeyPrefix(name))),
    );
    if (unassignedTeamNames.size === 0) {
        return null;
    }

    let teamOutbound = 0;
    let teamInbound = 0;
    let unassignedOutbound = 0;
    let unassignedInbound = 0;
    for (const name of teamNodeNames) {
        const inbound = flow.links
            .filter((link) => link.target === name)
            .reduce((sum, link) => sum + link.value, 0);
        const outbound = flow.links
            .filter((link) => link.source === name)
            .reduce((sum, link) => sum + link.value, 0);
        // A team node that is itself both a link source and target has no
        // single hop this measurement can attribute cleanly.
        if (inbound > 0 && outbound > 0) {
            return null;
        }
        teamInbound += inbound;
        teamOutbound += outbound;
        if (unassignedTeamNames.has(name)) {
            unassignedInbound += inbound;
            unassignedOutbound += outbound;
        }
    }
    // Team nodes split across both directions in the same flow (some
    // outbound-only, others inbound-only) describe two different hops, not
    // one comparable share.
    if (teamInbound > 0 && teamOutbound > 0) {
        return null;
    }

    const onSourceHop = teamOutbound > 0;
    const comparableTotal = onSourceHop ? teamOutbound : teamInbound;
    const unassignedThroughput = onSourceHop ? unassignedOutbound : unassignedInbound;

    return comparableTotal > 0 ? unassignedThroughput / comparableTotal : null;
}

export function readCoverage(flow: SankeyResponse | null | undefined): CoverageReading {
    if (!flow) {
        return { teamCoverage: null, repoCoverage: null, unassignedShare: null };
    }
    // Missing is not zero: only a coverage value the backend produced (a
    // finite number, 0 included) is a number here; anything else stays null.
    const { team: teamCoverage, repo: repoCoverage } = readFlowCoverage(flow);

    return { teamCoverage, repoCoverage, unassignedShare: computeUnassignedShare(flow) };
}

export const asPct = (value: number) =>
    formatNumber(value <= 1 ? value * 100 : value, { maximumFractionDigits: 0 });

/**
 * The coverage reading the Allocation strip shows: the team-category flow first, the repo-team
 * flow as the fallback for a missing leaf. Shared so every surface that prints coverage uses
 * the same function (null stays "unavailable", never 0).
 */
export function combineCoverage(
    primaryFlow: SankeyResponse | null | undefined,
    secondaryFlow: SankeyResponse | null | undefined,
): CoverageReading {
    const primary = readCoverage(primaryFlow);
    const secondary = readCoverage(secondaryFlow);
    return {
        teamCoverage: primary.teamCoverage ?? secondary.teamCoverage,
        repoCoverage: primary.repoCoverage ?? secondary.repoCoverage,
        unassignedShare: primary.unassignedShare ?? secondary.unassignedShare ?? null,
    };
}

/**
 * Coverage gaps + unassigned ownership, shown beside the Allocation visuals.
 *
 * Allocation answers "how is effort distributed across teams, repos, and
 * themes?" — so the honest counterpart is "how much of that effort could NOT be
 * attributed?". This reads coverage and unassigned shares straight off the
 * persisted Sankey responses (no recomputation). A coverage value the backend
 * did not produce (its coverage query can fail and degrade to null) renders as
 * "unavailable", never as a number; a produced 0 renders as 0%.
 */
export function AllocationCoverage({
    teamCategoryFlow,
    repoTeamFlow,
    isLoading,
    variant = "strip",
}: AllocationCoverageProps) {
    const reading = useMemo(
        () => combineCoverage(teamCategoryFlow, repoTeamFlow),
        [teamCategoryFlow, repoTeamFlow],
    );

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
                title="Coverage not available"
                description={`${COVERAGE_UNAVAILABLE_REASON}, so team and repo coverage cannot be summarized.`}
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

    if (variant === "facts") {
        // Confidence tab (approved prototype "Coverage gaps"): the same reading as fact rows.
        return (
            <Section title="Coverage gaps" data-testid="coverage-gaps">
                <EvidenceFactList aria-label="Coverage" testId="coverage-facts">
                    {cards.map((card) => (
                        <EvidenceFact
                            key={card.id}
                            label={card.label}
                            value={card.value !== null ? `${asPct(card.value)}%` : undefined}
                        />
                    ))}
                    <EvidenceFact
                        label="Unassigned ownership"
                        value={
                            reading.unassignedShare !== null
                                ? `${asPct(reading.unassignedShare)}%`
                                : "none detected"
                        }
                    />
                </EvidenceFactList>
                <p className="mt-4 rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-70) p-3.5 text-xs text-(--ink-muted)">
                    Unassigned is visible and inspectable. It is not silently redistributed to known
                    teams or repositories.
                </p>
            </Section>
        );
    }

    // Allocation tab (approved prototype `coverageStrip()`): three joined tiles.
    return (
        <MetricStrip data-testid="allocation-coverage-strip">
            {cards.map((card) => (
                <MetricCard
                    key={card.id}
                    testId={`coverage-tile-${card.id}`}
                    label={card.label}
                    hideTrend
                    valueText={card.value !== null ? `${asPct(card.value)}%` : "Unavailable"}
                    deltaSlot={
                        <span>
                            {card.value !== null
                                ? `${asPct(Math.max(0, (card.value <= 1 ? 1 : 100) - card.value))}% ${card.gapLabel}`
                                : COVERAGE_UNAVAILABLE_REASON}
                        </span>
                    }
                />
            ))}
            <MetricCard
                testId="coverage-tile-unassigned"
                label="Unassigned ownership"
                hideTrend
                valueText={
                    reading.unassignedShare !== null
                        ? `${asPct(reading.unassignedShare)}%`
                        : undefined
                }
                deltaSlot={
                    <span>
                        {reading.unassignedShare !== null
                            ? "of effort flows through unassigned nodes"
                            : "No unassigned nodes detected"}
                    </span>
                }
            />
        </MetricStrip>
    );
}

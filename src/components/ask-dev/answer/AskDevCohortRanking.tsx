import { useId, type ReactNode } from "react";

import { formatCohortScore, type RankedCohortRow } from "@/lib/ask-dev/cohort/cohort-ranking";
import {
    ABSENT,
    OUTCOME_WORD,
    memberDriversText,
    webCohortRanking,
} from "@/lib/ask-dev/cohort/web-cohort-ranking";
import { humanizeTerm } from "@/lib/ask-dev/facts/fact-rows";
import { formatDisplay, formatExact } from "@/lib/ask-dev/render/format";
import type { Cohort, CohortMemberDriver } from "@/lib/ask-dev/render/contracts";
import { windowText } from "@/lib/ask-dev/render/window-text";

import { CohortChartSlot } from "../render/RenderShapes";

import type { AnswerResult } from "./answerModel";
import { InvestmentRollupLabel } from "./InvestmentRollupLabel";
import { rollupForSubject } from "./investmentRollup";

/**
 * The cohort ranking of one answer (CHAOS-11944, E8 design §10). The gate is `webCohortRanking`
 * (G1, intent, the ported `rankingTable`); this view only shows what it returns:
 *
 * - "Ranking not shown" for a cohort of a kind web does not rank (G1: no person, organization or
 *   unknown kind): no name, score, rank or chart.
 * - "Not ranked by the service" when ACR ranked no member: a missing ranking is not an empty one.
 * - Otherwise one row per member ACR ranked, in its `attention_rank` order. A score never stands
 *   alone (check 8): its outcome word beside it and its top 2 drivers below; a score with no driver
 *   behind it is "withheld". Score, "—" (none sent) and "withheld" never collapse. Members ACR did
 *   not rank are named; an incomplete or truncated cohort says so; the answer window is in the
 *   header ("Window not stated" when absent). Served text is React text only, never HTML.
 *
 * The cohort charts are not drawn here: the chart slot is for I-41 (CHAOS-11943). Until then the
 * slot states the verified cohort shapes it holds as withheld (CHAOS-11942).
 */
export const RANKING_COPY = {
    notShownTitle: "Ranking not shown",
    notShown:
        "This answer carries a cohort of a kind this view does not rank, so no ranking is shown.",
    notRequested:
        "This answer carries ranking charts for a question that did not ask for a ranking, so they are not shown.",
    notComputedTitle: "Ranking",
    notComputed: "Not ranked by the service.",
    window: "Window",
    rowWindow: "window",
    topDrivers: "Top drivers",
    outcome: "outcome",
    driversEmpty: "No drivers reported.",
    driversWithheld: "No drivers reported — score withheld.",
    scoreWithheld: "withheld",
    unranked: "Not ranked by the service",
    missingSignals: "missing signals",
} as const;

/** G1 admits only these kinds, so the plural is a closed map (never `${kind}s`). */
const KIND_WORDS: Record<string, { readonly one: string; readonly many: string }> = {
    team: { one: "Team", many: "teams" },
    project: { one: "Project", many: "projects" },
    repository: { one: "Repository", many: "repositories" },
};
const kindWords = (kind: string) =>
    KIND_WORDS[kind] ?? { one: humanizeTerm(kind), many: humanizeTerm(kind) };

const PILL =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";
const OUTCOME_TONE: Record<string, string> = {
    qualified: "border-(--positive)/60",
    provisional: "border-(--caution)/70",
    insufficient_evidence: "border-dashed border-(--ink-muted)",
    not_applicable: "border-(--card-stroke)",
};

function Group({
    title,
    testId,
    children,
}: {
    title: string;
    testId: string;
    children: ReactNode;
}) {
    const titleId = useId();
    return (
        <div role="group" aria-labelledby={titleId} data-testid={testId} className="space-y-2">
            <h3 id={titleId} className="text-sm font-semibold text-foreground">
                {title}
            </h3>
            {children}
        </div>
    );
}

function Word({
    words,
    tones,
    value,
    testId,
}: {
    words: Record<string, string>;
    tones: Record<string, string>;
    value: string | undefined;
    testId: string;
}) {
    if (value === undefined || words[value] === undefined) {
        return <span data-testid={testId}>{ABSENT}</span>;
    }
    return (
        <span className={`${PILL} ${tones[value] ?? ""}`} data-testid={testId} data-value={value}>
            {words[value]}
        </span>
    );
}

/**
 * A row's detail line: its served driver rows (CHAOS-12245: never the completeness word; nothing
 * when the member serves none) and its window.
 */
function RowDetailLine({ member, window }: { member: Cohort["members"][number]; window: string }) {
    const drivers = memberDriversText(member);
    return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-(--ink-muted)">
            {drivers === null ? null : (
                <span data-testid="ask-dev-ranking-completeness">{drivers}</span>
            )}
            <span>
                {drivers === null ? "" : "· "}
                {RANKING_COPY.rowWindow} {humanizeTerm(window)}
            </span>
        </p>
    );
}

/** A served number, shown to 2 decimals (ask-dev's display rule, oracle-compared); the exact value is its title. */
function Num({ value }: { value: number }) {
    return <span title={formatExact(value)}>{formatDisplay(value)}</span>;
}

function DriverItem({ driver }: { driver: CohortMemberDriver }) {
    const threshold = driver.threshold_labels?.[0];
    return (
        <li data-testid="ask-dev-ranking-driver">
            <span className="font-medium text-foreground">{humanizeTerm(driver.signal)}</span>{" "}
            <span className="text-(--ink-muted)">
                value <Num value={driver.value} /> · contributed{" "}
                <Num value={driver.weight_contributed} /> of <Num value={driver.weight} />
                {threshold === undefined ? null : ` · ${humanizeTerm(threshold)}`}
            </span>
        </li>
    );
}

function ScoreCell({ row }: { row: RankedCohortRow }) {
    if (row.scoreWithheld) {
        return (
            <span
                className="text-(--ink-muted)"
                data-testid="ask-dev-ranking-score"
                data-state="withheld"
            >
                {RANKING_COPY.scoreWithheld}
            </span>
        );
    }
    if (row.score === null) {
        return (
            <span data-testid="ask-dev-ranking-score" data-state="none">
                {ABSENT}
            </span>
        );
    }
    return (
        <span data-testid="ask-dev-ranking-score" data-state="score">
            {formatCohortScore(row.score)}
        </span>
    );
}

/**
 * Four columns (rank, member, score, outcome) so the table fits the side panel and the phone sheet
 * without sideways scroll; each member's data completeness, window and top drivers sit in a
 * full-width detail row right below it. A member's two rows share one `tbody`, and the detail row
 * names the member for a screen reader.
 */
function RankingTable({
    cohort,
    rows,
    claims,
}: {
    cohort: Cohort;
    rows: readonly RankedCohortRow[];
    /** The answer's claimed facts: a member served the owning-team roll-up is labelled. */
    claims: NonNullable<AnswerResult["claimed_facts"]>;
}) {
    const kind = kindWords(cohort.kind);
    return (
        <table
            className="w-full border-collapse text-left text-xs"
            data-testid="ask-dev-ranking-table"
        >
            <caption className="sr-only">Ranked {kind.many}</caption>
            <thead>
                <tr className="border-b border-(--card-stroke) text-(--ink-muted)">
                    <th scope="col" className="py-1 pr-2 font-medium">
                        Rank
                    </th>
                    <th scope="col" className="py-1 pr-2 font-medium">
                        {kind.one}
                    </th>
                    <th scope="col" className="py-1 pr-2 font-medium">
                        Score
                    </th>
                    <th scope="col" className="py-1 font-medium">
                        Outcome
                    </th>
                </tr>
            </thead>
            {rows.map((row) => (
                <tbody
                    key={row.member.subject.canonical_id}
                    className="border-b border-(--card-stroke)"
                    data-testid="ask-dev-ranking-row"
                >
                    <tr className="align-top">
                        <td className="pt-2 pr-2" data-testid="ask-dev-ranking-rank">
                            {row.attentionRank === undefined ? ABSENT : String(row.attentionRank)}
                        </td>
                        <th
                            scope="row"
                            className="pt-2 pr-2 font-medium break-words text-foreground"
                            data-testid="ask-dev-ranking-name"
                        >
                            {row.member.subject.label}
                        </th>
                        <td className="pt-2 pr-2">
                            <ScoreCell row={row} />
                        </td>
                        <td className="pt-2">
                            <Word
                                words={OUTCOME_WORD}
                                tones={OUTCOME_TONE}
                                value={row.member.outcome}
                                testId="ask-dev-ranking-outcome"
                            />
                        </td>
                    </tr>
                    <tr>
                        <td
                            colSpan={4}
                            className="space-y-1 pt-1 pb-2"
                            data-testid="ask-dev-ranking-detail"
                        >
                            <span className="sr-only">{row.member.subject.label}: </span>
                            <RowDetailLine member={row.member} window={row.window} />
                            <RowRollup
                                claims={claims}
                                canonicalId={row.member.subject.canonical_id}
                            />
                            {row.topDrivers.length === 0 ? (
                                <p
                                    className="text-(--ink-muted)"
                                    data-testid="ask-dev-ranking-no-drivers"
                                >
                                    {row.scoreWithheld
                                        ? RANKING_COPY.driversWithheld
                                        : RANKING_COPY.driversEmpty}
                                </p>
                            ) : (
                                <ul className="space-y-1" aria-label={RANKING_COPY.topDrivers}>
                                    {row.topDrivers.map((driver) => (
                                        <DriverItem key={driver.signal} driver={driver} />
                                    ))}
                                </ul>
                            )}
                        </td>
                    </tr>
                </tbody>
            ))}
        </table>
    );
}

/** CHAOS-12178: a member whose investment claim is the owning team's roll-up says so. */
function RowRollup({
    claims,
    canonicalId,
}: {
    claims: NonNullable<AnswerResult["claimed_facts"]>;
    canonicalId: string;
}) {
    const rollup = rollupForSubject(claims, canonicalId);
    if (rollup === null) return null;
    return (
        <p>
            <InvestmentRollupLabel rollup={rollup} />
        </p>
    );
}

function WindowLine({ result }: { result: AnswerResult }) {
    return (
        <p className="text-xs text-(--ink-muted)" data-testid="ask-dev-ranking-window">
            {RANKING_COPY.window}: {windowText(result)}
        </p>
    );
}

function IncompleteNotice({ cohort }: { cohort: Cohort }) {
    if (cohort.complete && !cohort.truncated) return null;
    const kind = kindWords(cohort.kind);
    return (
        <p className="text-xs text-foreground" data-testid="ask-dev-ranking-incomplete">
            {cohort.truncated
                ? `This ranking covers only the ${kind.many} the service returned — the cohort was truncated, so it is not every ${kind.one.toLowerCase()}.`
                : `The service did not report this cohort as complete, so this ranking may not cover every ${kind.one.toLowerCase()}.`}
        </p>
    );
}

/**
 * An unranked member by name, with the outcome ACR served for it and its served driver rows (they
 * often say why it was not ranked). It never carries a score or rank: ACR ranked it not. The same
 * `memberDriversText` as the ranking column, so the two never disagree (CHAOS-12245).
 */
function unrankedEntry(member: Cohort["members"][number]): string {
    const words = [
        member.outcome === undefined
            ? null
            : `${RANKING_COPY.outcome} ${OUTCOME_WORD[member.outcome]}`,
        memberDriversText(member),
    ].filter((word) => word !== null);
    return words.length === 0
        ? member.subject.label
        : `${member.subject.label} (${words.join(", ")})`;
}

/**
 * What the ranking does not cover, the same whether ACR ranked some members or none (codex r1, r2
 * on #1628): every member's missing signals (ranked members in rank order, then the members ACR did
 * not rank, which they often explain), and the unranked members by name. Never dropped silently.
 */
function CoverageNotes({ cohort, ranked }: { cohort: Cohort; ranked: readonly RankedCohortRow[] }) {
    const unranked = cohort.members
        .filter((member) => member.ranking_computed !== true)
        .map(unrankedEntry);
    const members = [
        ...ranked.map((row) => row.member),
        ...cohort.members.filter((member) => member.ranking_computed !== true),
    ];
    return (
        <>
            {members.map((member) =>
                member.missing_signals === undefined ? null : (
                    <p
                        key={`${member.subject.canonical_id}-missing`}
                        className="text-xs text-(--ink-muted)"
                        data-testid="ask-dev-ranking-missing-signals"
                    >
                        {member.subject.label} — {RANKING_COPY.missingSignals}:{" "}
                        {member.missing_signals.map(humanizeTerm).join(", ")}
                    </p>
                ),
            )}
            {unranked.length === 0 ? null : (
                <p className="text-xs text-(--ink-muted)" data-testid="ask-dev-ranking-unranked">
                    {RANKING_COPY.unranked}: {unranked.join("; ")}.
                </p>
            )}
        </>
    );
}

export function AskDevCohortRanking({ result }: { result: AnswerResult }) {
    const ranking = webCohortRanking(result);
    switch (ranking.state) {
        case "none":
            return null;
        case "kind_not_ranked":
            // G1: nothing of the cohort, not even its window or member names.
            return (
                <Group title={RANKING_COPY.notShownTitle} testId="ask-dev-ranking-not-shown">
                    <p className="text-sm text-(--ink-muted)">{RANKING_COPY.notShown}</p>
                </Group>
            );
        case "not_requested":
            return (
                <p
                    className="text-xs text-(--ink-muted)"
                    data-testid="ask-dev-ranking-not-requested"
                >
                    {RANKING_COPY.notRequested}
                </p>
            );
        case "not_computed":
            return (
                <Group title={RANKING_COPY.notComputedTitle} testId="ask-dev-ranking-not-computed">
                    <p className="text-sm text-(--ink-muted)">{RANKING_COPY.notComputed}</p>
                    <WindowLine result={result} />
                    <IncompleteNotice cohort={ranking.cohort} />
                    <CoverageNotes cohort={ranking.cohort} ranked={[]} />
                </Group>
            );
        case "rows": {
            const { cohort, rows } = ranking;
            return (
                <Group title={`Ranked ${kindWords(cohort.kind).many}`} testId="ask-dev-ranking">
                    <WindowLine result={result} />
                    <IncompleteNotice cohort={cohort} />
                    <CohortChartSlot />
                    <RankingTable cohort={cohort} rows={rows} claims={result.claimed_facts ?? []} />
                    <CoverageNotes cohort={cohort} ranked={rows} />
                </Group>
            );
        }
    }
}

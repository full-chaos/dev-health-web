import { rankingTable } from "@/lib/ask-dev/cohort/cohort-ranking";
import type { Cohort, RenderShape } from "@/lib/ask-dev/render/contracts";

/**
 * The coverage caption of a cohort chart (CHAOS-11943, E8 design §7.4): which ranked members the
 * chart does not show, and why, in counts of members read from the verified cohort, never from the
 * chart's numbers. It mirrors ACR's own selection (acr `render_shapes.go`: ranked members with a
 * score, by `attention_rank` then canonical id, at most 64; a stack only for members with drivers).
 *
 * When the members the shape cites are not the members that selection expects, the caption states
 * the plain counts only, names no cause, and the mismatch is returned for a counts-only log line.
 */
export const COHORT_CHART_LIMIT = 64;

/** G1 admits only these kinds, so the words are a closed map (never `${kind}s`). */
const NOUNS: Record<string, { readonly one: string; readonly many: string }> = {
    team: { one: "team", many: "teams" },
    project: { one: "project", many: "projects" },
    repository: { one: "repository", many: "repositories" },
};

export type CoverageMismatch = {
    readonly ranked: number;
    readonly scored: number;
    readonly expected: number;
    readonly cited: number;
};

export type CoverageCaption = {
    readonly sentences: readonly string[];
    readonly mismatch: CoverageMismatch | null;
};

export function coverageCaption(shape: RenderShape, cohort: Cohort | undefined): CoverageCaption {
    const nouns = NOUNS[cohort?.kind ?? ""] ?? { one: "member", many: "members" };
    const noun = (count: number) => (count === 1 ? nouns.one : nouns.many);
    const rows = rankingTable(cohort?.members ?? []) ?? [];
    const ranked = rows.length;
    const scored = rows.filter((row) => row.score !== null);
    const noScore = ranked - scored.length;
    const id = (row: (typeof rows)[number]) => row.member.subject.canonical_id;
    const candidates = [...scored]
        .sort(
            (a, b) =>
                (a.attentionRank ?? Number.POSITIVE_INFINITY) -
                    (b.attentionRank ?? Number.POSITIVE_INFINITY) ||
                (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0),
        )
        .slice(0, COHORT_CHART_LIMIT);
    const capped = Math.max(0, scored.length - COHORT_CHART_LIMIT);
    const stack = shape.selected_by === "cohort_driver_contribution";
    const noDrivers = stack
        ? candidates.filter((row) => (row.member.drivers ?? []).length === 0).length
        : 0;
    const expected = candidates.length - noDrivers;
    const cited = new Set(
        shape.series.flatMap((series) =>
            series.points.map((point) => point.source.subject_canonical_id),
        ),
    ).size;

    if (cited !== expected) {
        return {
            sentences: [`Shows ${cited} of ${ranked} ranked ${noun(ranked)}.`],
            mismatch: { ranked, scored: scored.length, expected, cited },
        };
    }
    const sentences: string[] = [];
    if (noScore > 0)
        sentences.push(
            `${noScore} ranked ${noun(noScore)} ${noScore === 1 ? "has" : "have"} no score.`,
        );
    if (capped > 0)
        sentences.push(
            `${capped} more scored ${noun(capped)} ${capped === 1 ? "is" : "are"} beyond the ` +
                `${COHORT_CHART_LIMIT}-${nouns.one} chart limit.`,
        );
    if (noDrivers > 0)
        sentences.push(
            `${noDrivers} ${noun(noDrivers)} ${noDrivers === 1 ? "has" : "have"} no driver data.`,
        );
    return { sentences, mismatch: null };
}

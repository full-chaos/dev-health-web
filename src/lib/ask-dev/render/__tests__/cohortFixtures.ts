/**
 * Cohort-chart fixtures for CHAOS-11943, from real scrubbed captures: the kiac repository ranking
 * (4 ranked and scored repositories, both cohort shapes) and the public seed corpus (3 ranked
 * teams, 1 scored: the F13 coverage case). Edits made for a test are named where they are made.
 */
import seed from "@/lib/ask-dev/render/__oracle__/captures/seed-cv-discovered-team-series-rep1-t2-a1.result.json";
import attention from "@/lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json";
import type {
    CohortMember,
    InvestigationResult,
    RenderShape,
} from "@/lib/ask-dev/render/contracts";

export type Result = InvestigationResult;

/** kiac: rs_1 attention bars (4 repositories), rs_2 driver stack (2 driver families). */
export const kiacRanking = (): Result =>
    structuredClone((attention as { result: unknown }).result) as Result;

/** Seed: 3 ranked teams, only rank 1 scored. */
export const seedRanking = (): Result => structuredClone(seed as unknown) as Result;

export const shapeOf = (result: Result, selectedBy: RenderShape["selected_by"]): RenderShape => {
    const shape = result.render_shapes?.find((candidate) => candidate.selected_by === selectedBy);
    if (shape === undefined) throw new Error(`no ${selectedBy} shape`);
    return shape;
};

export const memberOf = (result: Result, canonicalId: string): CohortMember => {
    const member = result.cohort?.members.find((m) => m.subject.canonical_id === canonicalId);
    if (member === undefined) throw new Error(`no member ${canonicalId}`);
    return member;
};

/** The rank-1 member's canonical id. */
export const topRanked = (result: Result): string =>
    [...(result.cohort?.members ?? [])].sort(
        (a, b) => (a.attention_rank ?? 99) - (b.attention_rank ?? 99),
    )[0]!.subject.canonical_id;

export function withShapes(result: Result, shapes: readonly RenderShape[]): Result {
    return { ...result, render_shapes: [...shapes] } as Result;
}

/**
 * R1-8: the driver stack with the FIRST driver family's point for the top-ranked member removed.
 * The member still leads the axis (rank order, not first-seen order), and its first segment is a
 * gap (null), never 0.
 */
export function stackMissingFirstFamilyForTop(result: Result): RenderShape {
    const stack = structuredClone(shapeOf(result, "cohort_driver_contribution"));
    const top = topRanked(result);
    const first = stack.series[0]!;
    first.points = first.points.filter(
        (point) => point.source.subject_canonical_id !== top,
    ) as typeof first.points;
    return stack;
}

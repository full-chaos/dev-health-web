import type { Cohort, CohortMember, RenderShape } from "@/lib/ask-dev/render/contracts";

/**
 * Web-only render guards (CHAOS-11941, E8 design §5.3). They run AFTER the ported verifier admits a
 * shape and are never inside the port, so the differential oracle keeps comparing ask-dev's exact
 * behaviour while web adds its own refusals. Each returns `null` (pass) or the reason the shape is
 * WITHHELD. G3 (no derived stack total) is a rule on the option builder (I-24, I-41) and G4 (every
 * occurrence ends drawn or withheld, exactly once) is the ledger in `placement.ts`.
 */
export type GuardReason =
    | "cohort_kind_not_ranked"
    | "chart_score_without_ranking_row"
    | "chart_score_without_drivers"
    | "time_order_utc_disagreement"
    | "time_label_instant_collision"
    | "signed_stack_unsupported"
    | "palette_exhausted";

/** G1: the only subject kinds web ranks. No person ranking, whatever the cohort says. */
export const WEB_RANKABLE_KINDS: readonly string[] = ["team", "project", "repository"];

/** G1: a cohort is rankable only when its kind and every member's kind are team/project/repository. */
export function cohortKindsRankable(cohort: Cohort | undefined): boolean {
    if (cohort === undefined) return false;
    return (
        WEB_RANKABLE_KINDS.includes(cohort.kind) &&
        cohort.members.every((member) => WEB_RANKABLE_KINDS.includes(member.subject.kind))
    );
}

export function guardCohortKinds(
    shape: RenderShape,
    cohort: Cohort | undefined,
): GuardReason | null {
    const cohortRule =
        shape.selected_by === "cohort_attention_score" ||
        shape.selected_by === "cohort_driver_contribution";
    return cohortRule && !cohortKindsRankable(cohort) ? "cohort_kind_not_ranked" : null;
}

/**
 * G2: no bare score in a chart. Every point of a `cohort_attention_score` shape must map, by
 * `source.subject_canonical_id`, to exactly one ELIGIBLE ranking row: a member with
 * `ranking_computed === true`, an `outcome`, a non-null score and at least one driver. One point
 * without such a row withholds the whole shape; it is never trimmed.
 */
export function guardScoreRows(shape: RenderShape, cohort: Cohort | undefined): GuardReason | null {
    if (shape.selected_by !== "cohort_attention_score") return null;
    const members = cohort?.members ?? [];
    for (const series of shape.series) {
        for (const point of series.points) {
            const matches = members.filter(
                (m: CohortMember) => m.subject.canonical_id === point.source.subject_canonical_id,
            );
            if (matches.length !== 1) return "chart_score_without_ranking_row";
            const member = matches[0]!;
            if (
                member.ranking_computed !== true ||
                member.outcome === undefined ||
                member.score === null ||
                member.score === undefined
            ) {
                return "chart_score_without_ranking_row";
            }
            if ((member.drivers ?? []).length === 0) return "chart_score_without_drivers";
        }
    }
    return null;
}

const ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The instant a time label is DRAWN at: a bare date is UTC midnight, a zoned label is its instant,
 * a zone-less date-time is read as UTC (the renderer runs `useUTC`). `null` when it is no instant.
 */
export function utcInstant(label: string): number | null {
    if (DATE_ONLY.test(label)) return Date.parse(`${label}T00:00:00Z`);
    const value = ZONED.test(label) ? Date.parse(label) : Date.parse(`${label.replace(" ", "T")}Z`);
    return Number.isNaN(value) ? null : value;
}

/**
 * G5: a time shape the port admitted (under the process time zone, ask-dev's local parse, F12) must
 * also be strictly ascending under the UTC parse the chart draws with, and two DIFFERENT label
 * strings must not land on one instant.
 */
export function guardUtcTimeOrder(shape: RenderShape): GuardReason | null {
    if (shape.axis_kind !== "time") return null;
    const labelAt = new Map<number, string>();
    for (const series of shape.series) {
        let previous: number | null = null;
        for (const point of series.points) {
            const at = utcInstant(point.label);
            if (at === null || (previous !== null && at <= previous))
                return "time_order_utc_disagreement";
            previous = at;
            const seen = labelAt.get(at);
            if (seen !== undefined && seen !== point.label) return "time_label_instant_collision";
            labelAt.set(at, point.label);
        }
    }
    return null;
}

/** G6: no signed stack (ECharts stacks positive and negative values apart, F15). */
export function guardSignedStack(shape: RenderShape): GuardReason | null {
    if (shape.presentation !== "stacked_bars") return null;
    return shape.series.some((series) => series.points.some((point) => point.value < 0))
        ? "signed_stack_unsupported"
        : null;
}

/** G7: one distinct theme colour per series; never a cycled colour. */
export function guardPalette(shape: RenderShape, paletteSize: number): GuardReason | null {
    return shape.series.length > paletteSize ? "palette_exhausted" : null;
}

/** G1, G2, G5, G6 and G7 in that order: the first reason that withholds the shape, or `null`. */
export function webGuardReason(
    shape: RenderShape,
    cohort: Cohort | undefined,
    paletteSize: number,
): GuardReason | null {
    return (
        guardCohortKinds(shape, cohort) ??
        guardScoreRows(shape, cohort) ??
        guardUtcTimeOrder(shape) ??
        guardSignedStack(shape) ??
        guardPalette(shape, paletteSize)
    );
}

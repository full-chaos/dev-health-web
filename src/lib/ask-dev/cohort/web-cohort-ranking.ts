import {
    isCohortIntent,
    rankingTable,
    type RankedCohortRow,
} from "@/lib/ask-dev/cohort/cohort-ranking";
import type { Cohort, InterpretedShape, RenderShape } from "@/lib/ask-dev/render/contracts";
import { cohortKindsRankable } from "@/lib/ask-dev/render/guards";
import type { WithheldReason } from "@/lib/ask-dev/render/withheld-log";

/**
 * Web's cohort ranking gate (CHAOS-11944, E8 design §10). The ported `cohort-ranking.ts` stays exact
 * (the I-26 oracle compares it); every web rule sits here, outside the port, and web never calls the
 * port's `cohortRanking`: its kind list admits `organization` and other kinds web does not rank
 * (codex r3 on #1625), and its intent gate returns `not_requested` for an `open` answer.
 *
 *   1. No cohort: nothing.
 *   2. G1: the cohort kind and every member kind must be team, project or repository. Else "Ranking
 *      not shown": no name, score, rank or chart.
 *   3. Intent (Q1 default): a cohort `interpretation.shape`, or the answer carries a cohort-rule render
 *      shape (ACR selects those only under its own cohort intent; web reads that decision). Not asked:
 *      nothing, and any cohort shape is withheld `ranking_not_requested` behind one generic notice.
 *      `intent: "parity"` is ask-dev's rule (the shape clause dropped), kept for the design's
 *      alternative and tested.
 *   4. The ported `rankingTable(cohort.members)`: `null` → "Not ranked by the service", cohort shapes
 *      withheld `ranking_not_computed`; rows → the table, and the cohort shapes go to the chart slot.
 */
export const COHORT_SHAPE_RULES: readonly string[] = [
    "cohort_attention_score",
    "cohort_driver_contribution",
];

export type IntentRule = "q1" | "parity";

export type WebCohortRankingInput = {
    readonly cohort?: Cohort | undefined;
    readonly interpretation: { readonly shape: InterpretedShape };
    readonly render_shapes?: readonly RenderShape[] | undefined;
};

/** One served cohort-rule shape occurrence, by its index in `render_shapes`. */
export type CohortShapeOutcome =
    | { readonly index: number; readonly placement: "chart_slot" }
    | { readonly index: number; readonly withheld: WithheldReason };

export type WebCohortRanking =
    | { readonly state: "none"; readonly shapes: readonly CohortShapeOutcome[] }
    | { readonly state: "kind_not_ranked"; readonly shapes: readonly CohortShapeOutcome[] }
    | { readonly state: "not_requested"; readonly shapes: readonly CohortShapeOutcome[] }
    | {
          readonly state: "not_computed";
          readonly cohort: Cohort;
          readonly shapes: readonly CohortShapeOutcome[];
      }
    | {
          readonly state: "rows";
          readonly cohort: Cohort;
          readonly rows: readonly RankedCohortRow[];
          readonly shapes: readonly CohortShapeOutcome[];
      };

function cohortShapeIndexes(shapes: readonly RenderShape[] | undefined): number[] {
    const indexes: number[] = [];
    (shapes ?? []).forEach((shape, index) => {
        if (COHORT_SHAPE_RULES.includes(shape.selected_by)) indexes.push(index);
    });
    return indexes;
}

const withheld = (indexes: readonly number[], reason: WithheldReason): CohortShapeOutcome[] =>
    indexes.map((index) => ({ index, withheld: reason }));

export function webCohortRanking(
    result: WebCohortRankingInput,
    intent: IntentRule = "q1",
): WebCohortRanking {
    const indexes = cohortShapeIndexes(result.render_shapes);
    const cohort = result.cohort;
    // A cohort shape with no cohort cannot be placed: the answer-level notice owns it (§4.3).
    if (cohort === undefined)
        return { state: "none", shapes: withheld(indexes, "placement_missing") };
    if (!cohortKindsRankable(cohort)) {
        return { state: "kind_not_ranked", shapes: withheld(indexes, "cohort_kind_not_ranked") };
    }
    const asked =
        isCohortIntent(result.interpretation.shape) || (intent === "q1" && indexes.length > 0);
    if (!asked) {
        return indexes.length === 0
            ? { state: "none", shapes: [] }
            : { state: "not_requested", shapes: withheld(indexes, "ranking_not_requested") };
    }
    const rows = rankingTable(cohort.members);
    if (rows === null) {
        return { state: "not_computed", cohort, shapes: withheld(indexes, "ranking_not_computed") };
    }
    return {
        state: "rows",
        cohort,
        rows,
        shapes: indexes.map((index) => ({ index, placement: "chart_slot" })),
    };
}

/** AC-11: each outcome its own word; absent is "—". The word carries the meaning, never colour alone. */
export const OUTCOME_WORD = {
    qualified: "Qualified",
    provisional: "Provisional",
    insufficient_evidence: "Insufficient evidence",
    not_applicable: "Not applicable",
} as const;

export const DATA_COMPLETENESS_WORD = {
    complete: "Complete",
    partial: "Partial",
    degraded: "Degraded",
} as const;

export const ABSENT = "—";

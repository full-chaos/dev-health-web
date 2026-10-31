import { webCohortRanking } from "@/lib/ask-dev/cohort/web-cohort-ranking";
import type { InvestigationResult, RenderShape } from "@/lib/ask-dev/render/contracts";
import { coverageCaption, type CoverageCaption } from "@/lib/ask-dev/render/coverage-caption";
import { webGuardReason } from "@/lib/ask-dev/render/guards";
import { placementFor, type Outcome, type Placement } from "@/lib/ask-dev/render/placement";
import { admissionReason } from "@/lib/ask-dev/render/verify-reasons";
import type { WithheldReason } from "@/lib/ask-dev/render/withheld-log";

/**
 * Where each served `render_shapes[i]` occurrence goes and what it starts as (CHAOS-11942, E8 design
 * §4.1, §4.3): the ported admission (verify), then the web guards (G1-G7), then placement by rule.
 * Pure. The answer's ledger records `initial` for every index; a PENDING occurrence is settled by
 * the figure that mounts it.
 *
 * Notice owner (single-owner rule, §4.3): an occurrence withheld for a reason in
 * `ANSWER_LEVEL_REASONS`, or one with no slot to sit in, is counted by the answer-level notice; any
 * other withheld trend by its fact-table group's slot; any other withheld cohort shape by the
 * ranking panel. No occurrence has two owners.
 */
export type NoticeOwner =
    | { readonly kind: "answer" }
    | { readonly kind: "group"; readonly key: string }
    | { readonly kind: "cohort_panel" };

export type PlannedShape = {
    readonly index: number;
    readonly shape: RenderShape;
    readonly placement: Placement;
    /** The fact-table group key (its first claim id) a trend mounts in, else `null`. */
    readonly group: string | null;
    readonly owner: NoticeOwner;
    readonly initial: Outcome;
    /** E8 §7.4: the coverage caption of a cohort chart the slot draws. */
    readonly caption?: CoverageCaption;
};

/** §4.3: these are always shown once, in the answer-level notice. */
export const ANSWER_LEVEL_REASONS: readonly WithheldReason[] = [
    "multi_claim_trend",
    "placement_missing",
    "kind_not_drawable",
    "presentation_missing",
    "time_axis_requires_line",
    "render_error",
    "render_timeout",
    "render_accounting_violated",
];

/** The ranking panel's own gate notices already state these (CHAOS-11944); its slot never recounts them. */
export const RANKING_GATE_REASONS: readonly WithheldReason[] = [
    "cohort_kind_not_ranked",
    "ranking_not_requested",
    "ranking_not_computed",
];

/** The fields the plan (and the ported verifier inside it) read. */
export type PlanInput = Pick<
    InvestigationResult,
    "render_shapes" | "cohort" | "claimed_facts" | "interpretation"
>;

export type PlanOptions = {
    /**
     * The claim ids of each rendered fact-table group, in order (`claimedFactTables(...).claimIds`),
     * or `null` when the answer renders no analysis parts (no table group and no ranking panel).
     */
    readonly groups: readonly (readonly string[])[] | null;
    readonly paletteSize: number;
};

const ANSWER: NoticeOwner = { kind: "answer" };
const withheld = (reason: WithheldReason): Outcome => ({ kind: "WITHHELD", reason });

/** Who counts a WITHHELD occurrence: the answer for an answer-level reason, else its slot. */
export function noticeOwnerFor(planned: PlannedShape, reason: WithheldReason): NoticeOwner {
    return ANSWER_LEVEL_REASONS.includes(reason) ? ANSWER : planned.owner;
}

function citedClaims(shape: RenderShape): Set<string | undefined> {
    return new Set(
        shape.series.flatMap((series) => series.points.map((point) => point.source.claim_id)),
    );
}

export function planRenderShapes(result: PlanInput, options: PlanOptions): PlannedShape[] {
    // The ported verifier is typed on the whole result but reads only `render_shapes`, `cohort` and
    // `claimed_facts` (a test holds this with a guard on every other field).
    const verifyInput = result as InvestigationResult;
    const cohortGate =
        options.groups === null
            ? null
            : new Map(webCohortRanking(result).shapes.map((outcome) => [outcome.index, outcome]));

    return (result.render_shapes ?? []).map((shape, index): PlannedShape => {
        const placement = placementFor(shape);
        const verdict = admissionReason(shape, verifyInput);
        const refused = verdict.ok
            ? webGuardReason(shape, result.cohort, options.paletteSize)
            : verdict.reason;

        if (placement === "cohort_panel") {
            const gate = cohortGate?.get(index);
            // The ranking panel renders for this cohort (any gate state but "no cohort").
            const panel =
                gate !== undefined &&
                !("withheld" in gate && gate.withheld === "placement_missing");
            // The chart slot is mounted only when the panel shows ranking rows.
            const slot = gate !== undefined && "placement" in gate;
            const at = (owned: boolean): NoticeOwner => (owned ? { kind: "cohort_panel" } : ANSWER);
            const entry = (owner: NoticeOwner, reason: WithheldReason): PlannedShape => ({
                index,
                shape,
                placement,
                group: null,
                owner,
                initial: withheld(reason),
            });
            // §4.1 order: a verifier or web-guard refusal comes before placement and the ranking
            // gate (codex r2b on #1629). G1's own refusal is stated by the panel; any other one by
            // the chart slot when it is mounted, else by the answer.
            if (refused !== null)
                return entry(at(RANKING_GATE_REASONS.includes(refused) ? panel : slot), refused);
            if (!panel) return entry(ANSWER, "placement_missing");
            // The panel's gate (intent, ranking computed) is stated by the panel itself.
            if ("withheld" in gate!) return entry(at(true), gate.withheld);
            // A verified cohort shape is drawn in the ranking panel's chart slot (CHAOS-11943).
            return {
                index,
                shape,
                placement,
                group: null,
                owner: at(true),
                initial: { kind: "PENDING", component: "cohort_panel" },
                caption: coverageCaption(shape, result.cohort),
            };
        }

        if (placement === "fact_group" && options.groups !== null) {
            const claims = citedClaims(shape);
            const claim = claims.size === 1 ? [...claims][0] : undefined;
            const group =
                claim === undefined
                    ? undefined
                    : options.groups.find((claimIds) => claimIds.includes(claim));
            if (group !== undefined) {
                const key = group[0]!;
                return {
                    index,
                    shape,
                    placement,
                    group: key,
                    owner: { kind: "group", key },
                    initial:
                        refused === null
                            ? { kind: "PENDING", component: "fact_group" }
                            : withheld(refused),
                };
            }
        }

        return {
            index,
            shape,
            placement,
            group: null,
            owner: ANSWER,
            initial: withheld(refused ?? "placement_missing"),
        };
    });
}

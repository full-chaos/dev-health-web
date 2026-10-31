import type { RenderShape } from "@/lib/ask-dev/render/contracts";
import type { WithheldReason } from "@/lib/ask-dev/render/withheld-log";

/**
 * Where a served shape goes, and the occurrence ledger (CHAOS-11941, E8 design §4.1, §4.3, G4).
 * Every served `render_shapes[i]` OCCURRENCE (by index, not by `shape_id`) ends in exactly one
 * visible outcome, DRAWN or WITHHELD, and the ledger proves it before an answer is shown as done.
 */
export type Placement = "cohort_panel" | "fact_group" | "answer_level";

/** §4.3: cohort rules go to the ranking panel, trends beside their fact group, anything else to the answer. */
export function placementFor(shape: RenderShape): Placement {
    if (
        shape.selected_by === "cohort_attention_score" ||
        shape.selected_by === "cohort_driver_contribution"
    ) {
        return "cohort_panel";
    }
    if (shape.selected_by === "dated_fact_trend") return "fact_group";
    return "answer_level";
}

export type Outcome =
    | { readonly kind: "PENDING"; readonly component: string }
    | { readonly kind: "DRAWN" }
    | { readonly kind: "WITHHELD"; readonly reason: WithheldReason };

export type LedgerViolation =
    | { readonly kind: "missing_outcome"; readonly index: number }
    | { readonly kind: "duplicate_outcome"; readonly index: number }
    | { readonly kind: "unknown_index"; readonly index: number }
    | { readonly kind: "pending_after_bound"; readonly index: number };

/**
 * One ledger per answer render. `record` keeps every outcome it is given (a second one for the same
 * index is a violation, not an overwrite), so the check can see a duplicate that balances a drop.
 */
export class OccurrenceLedger {
    private static made = 0;
    /** Distinct per ledger: a view keys its figures by it so each ledger gets its own attempt. */
    readonly id = ++OccurrenceLedger.made;
    private readonly entries = new Map<number, Outcome[]>();
    private readonly strays: number[] = [];

    constructor(readonly size: number) {}

    record(index: number, outcome: Outcome): void {
        if (!Number.isInteger(index) || index < 0 || index >= this.size) {
            this.strays.push(index);
            return;
        }
        const list = this.entries.get(index) ?? [];
        list.push(outcome);
        this.entries.set(index, list);
    }

    /** Settles a PENDING occurrence once: the first DRAWN/WITHHELD wins, later settlements are ignored. */
    settle(index: number, outcome: Exclude<Outcome, { kind: "PENDING" }>): boolean {
        const list = this.entries.get(index);
        const last = list?.[list.length - 1];
        if (list === undefined || last?.kind !== "PENDING" || list.length !== 1) return false;
        list[0] = outcome;
        return true;
    }

    /**
     * A DRAWN occurrence whose figure fails afterwards (a React error after the chart drew) ends
     * WITHHELD, once (CHAOS-11942): the figure is gone, so DRAWN would no longer be true.
     */
    withdraw(index: number, outcome: Extract<Outcome, { kind: "WITHHELD" }>): boolean {
        const list = this.entries.get(index);
        if (list === undefined || list.length !== 1 || list[0]!.kind !== "DRAWN") return false;
        list[0] = outcome;
        return true;
    }

    /** G4. `final`: the bound has passed, so a PENDING occurrence is a violation too. */
    violations(final: boolean): LedgerViolation[] {
        const out: LedgerViolation[] = this.strays.map(
            (index) => ({ kind: "unknown_index", index }) as const,
        );
        for (let index = 0; index < this.size; index++) {
            const list = this.entries.get(index) ?? [];
            if (list.length === 0) out.push({ kind: "missing_outcome", index });
            else if (list.length > 1) out.push({ kind: "duplicate_outcome", index });
            else if (final && list[0]!.kind === "PENDING")
                out.push({ kind: "pending_after_bound", index });
        }
        return out;
    }

    outcome(index: number): Outcome | undefined {
        const list = this.entries.get(index);
        return list?.length === 1 ? list[0] : undefined;
    }
}

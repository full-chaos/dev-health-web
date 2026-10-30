import type { InvestigationResult, RenderShape } from "@/lib/ask-dev/render/contracts";
import {
    EXACT_INTEGER_BOUND,
    everyLabelIsADate,
    everySeriesAscendsInTime,
    hasDuplicate,
    resolvePointSource,
    sourceAddressMatchesKind,
    verifyRenderShape,
} from "@/lib/ask-dev/render/verify";

/**
 * Why the ported verifier refused a shape (CHAOS-11941, E8 design §5.2). Built on the port's OWN
 * checks, in the port's order, so `ok` equals `verifyRenderShape` (a test holds this on every oracle
 * input). Reasons feed logs and tests; the UI text stays generic.
 */
export type VerifyReason =
    | "kind_not_drawable"
    | "time_axis_requires_line"
    | "presentation_missing"
    | "time_label_not_date"
    | "time_not_ascending"
    | "duplicate_series_key"
    | "duplicate_point_label"
    | "source_address_mismatch"
    | "value_out_of_bounds"
    | "source_unresolved"
    | "value_mismatch"
    | "duplicate_shape_id"
    | "multi_claim_trend";

export type VerifyVerdict =
    { readonly ok: true } | { readonly ok: false; readonly reason: VerifyReason };

const refuse = (reason: VerifyReason): VerifyVerdict => ({ ok: false, reason });

/** The per-shape verdict, with the first failing check named. */
export function verifyRenderShapeReason(
    shape: RenderShape,
    result: InvestigationResult,
): VerifyVerdict {
    if (shape.kind !== "series") return refuse("kind_not_drawable");
    if (shape.axis_kind === "time" && shape.presentation !== "line")
        return refuse("time_axis_requires_line");
    if (
        shape.presentation !== "bars" &&
        shape.presentation !== "stacked_bars" &&
        shape.presentation !== "line"
    ) {
        return refuse("presentation_missing");
    }
    if (shape.axis_kind === "time" && !everyLabelIsADate(shape))
        return refuse("time_label_not_date");
    if (shape.axis_kind === "time" && !everySeriesAscendsInTime(shape))
        return refuse("time_not_ascending");
    if (hasDuplicate(shape.series.map((series) => series.key)))
        return refuse("duplicate_series_key");
    for (const series of shape.series) {
        const seen = new Set<string>();
        for (const point of series.points) {
            if (seen.has(point.label)) return refuse("duplicate_point_label");
            seen.add(point.label);
            if (!sourceAddressMatchesKind(point.source)) return refuse("source_address_mismatch");
            if (!Number.isFinite(point.value) || Math.abs(point.value) >= EXACT_INTEGER_BOUND) {
                return refuse("value_out_of_bounds");
            }
            const resolved = resolvePointSource(point.source, result.cohort, result.claimed_facts);
            if (resolved === undefined) return refuse("source_unresolved");
            if (resolved !== point.value) return refuse("value_mismatch");
        }
    }
    return { ok: true };
}

/**
 * The admission verdict for one served shape: the per-shape checks, then the answer-level rules the
 * port applies when it admits (a `shape_id` shared with another shape withholds both; a trend whose
 * points cite several claims is drawn by no claim).
 */
export function admissionReason(shape: RenderShape, result: InvestigationResult): VerifyVerdict {
    const ids = (result.render_shapes ?? []).map((candidate) => candidate.shape_id);
    if (ids.filter((id) => id === shape.shape_id).length > 1) return refuse("duplicate_shape_id");
    if (shape.selected_by === "dated_fact_trend") {
        const claims = new Set(
            shape.series.flatMap((series) => series.points.map((point) => point.source.claim_id)),
        );
        if (claims.size > 1) return refuse("multi_claim_trend");
    }
    const verdict = verifyRenderShapeReason(shape, result);
    // The reason function must never disagree with the ported boolean.
    if (verdict.ok !== verifyRenderShape(shape, result))
        throw new Error("verifyRenderShapeReason drifted from the port");
    return verdict;
}

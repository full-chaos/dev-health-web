import type { RenderKind, RenderPresentation, RenderShapeRule } from "@/lib/acr/generated";
import { logger } from "@/lib/logger";

import type { RenderShape } from "@/lib/ask-dev/render/contracts";
import type { GuardReason } from "@/lib/ask-dev/render/guards";
import type { VerifyReason } from "@/lib/ask-dev/render/verify-reasons";

/**
 * One log line per WITHHELD occurrence per render of a result (CHAOS-11941, E8 design §5.4): ids,
 * closed vocabularies and the reason only. Never a label, value, subject id or question text, and a
 * `shape_id` only when it has ACR's own form (`rs_<n>`).
 *
 * Every string field is checked at RUN time, not only typed: a value outside its closed list (or an
 * id outside its id form) is logged as `"unlisted"`, so a caller that passes free text (an error
 * message, a served label) cannot put it in the log.
 */
const ACR_SHAPE_ID = /^rs_[0-9]{1,3}$/u;
const RESULT_ID = /^result_[0-9a-f]{8,64}$/u;
// ACR's API mints `req_<hex>` (acr `observability`); `request_<hex>` is the panel harness form.
const REQUEST_ID = /^(?:req|request)_[0-9a-f]{8,64}$/u;
export const UNLISTED = "unlisted";

const VERIFY_REASONS = [
    "kind_not_drawable",
    "time_axis_requires_line",
    "presentation_missing",
    "time_label_not_date",
    "time_not_ascending",
    "duplicate_series_key",
    "duplicate_point_label",
    "source_address_mismatch",
    "value_out_of_bounds",
    "source_unresolved",
    "value_mismatch",
    "duplicate_shape_id",
    "multi_claim_trend",
] as const satisfies readonly VerifyReason[];

const GUARD_REASONS = [
    "cohort_kind_not_ranked",
    "chart_score_without_ranking_row",
    "chart_score_without_drivers",
    "time_order_utc_disagreement",
    "time_label_instant_collision",
    "signed_stack_unsupported",
    "palette_exhausted",
] as const satisfies readonly GuardReason[];

/** §4.1 mount and ledger outcomes, §4.3 placement and the ranking gate. */
const RENDER_REASONS = [
    "render_error",
    "render_timeout",
    "render_accounting_violated",
    "placement_missing",
    "ranking_not_computed",
    "ranking_not_requested",
    // CHAOS-11942: a verified cohort bar or stacked-bar shape until I-41 (CHAOS-11943) draws it.
    "presentation_not_rendered",
] as const;

export const WITHHELD_REASONS = [...VERIFY_REASONS, ...GUARD_REASONS, ...RENDER_REASONS] as const;
export type WithheldReason = (typeof WITHHELD_REASONS)[number];

const RULES = [
    "cohort_attention_score",
    "cohort_driver_contribution",
    "dated_fact_trend",
] as const satisfies readonly RenderShapeRule[];
const KINDS = [
    "series",
    "table",
    "quadrant",
    "treemap",
    "sunburst",
    "sankey",
    "burndown",
    "forecast",
] as const satisfies readonly RenderKind[];
const PRESENTATIONS = [
    "bars",
    "stacked_bars",
    "line",
] as const satisfies readonly RenderPresentation[];

// A union member missing from its list fails typecheck here, so a widened vocabulary is a reviewed change.
type Missing<Union, List extends readonly unknown[]> = Exclude<Union, List[number]>;
const exhaustive = <T extends never>(): T | undefined => undefined;
exhaustive<Missing<VerifyReason, typeof VERIFY_REASONS>>();
exhaustive<Missing<GuardReason, typeof GUARD_REASONS>>();
exhaustive<Missing<RenderShapeRule, typeof RULES>>();
exhaustive<Missing<RenderKind, typeof KINDS>>();
exhaustive<Missing<RenderPresentation, typeof PRESENTATIONS>>();

const listed = (list: readonly string[], value: unknown): string =>
    typeof value === "string" && list.includes(value) ? value : UNLISTED;
const idForm = (form: RegExp, value: unknown): string =>
    typeof value === "string" && form.test(value) ? value : UNLISTED;

/** A result id in ACR's own form, else `"unlisted"`: for every Ask Dev render log line. */
export const loggableResultId = (value: unknown): string => idForm(RESULT_ID, value);

export type WithheldLogFields = {
    readonly event: "ask_dev_render_withheld";
    readonly result_id: string;
    readonly request_id: string;
    readonly shape_index: number;
    readonly shape_id_ok: boolean;
    readonly shape_id?: string;
    readonly selected_by: string;
    readonly kind: string;
    readonly presentation: string | null;
    readonly reason: string;
};

export function withheldLogFields(
    ids: { readonly resultId: string; readonly requestId: string },
    shapeIndex: number,
    shape: RenderShape,
    reason: WithheldReason,
): WithheldLogFields {
    const idOk = typeof shape.shape_id === "string" && ACR_SHAPE_ID.test(shape.shape_id);
    return {
        event: "ask_dev_render_withheld",
        result_id: loggableResultId(ids.resultId),
        request_id: idForm(REQUEST_ID, ids.requestId),
        shape_index: Number.isInteger(shapeIndex) && shapeIndex >= 0 ? shapeIndex : -1,
        shape_id_ok: idOk,
        ...(idOk ? { shape_id: shape.shape_id } : {}),
        selected_by: listed(RULES, shape.selected_by),
        kind: listed(KINDS, shape.kind),
        presentation:
            shape.presentation === undefined ? null : listed(PRESENTATIONS, shape.presentation),
        reason: listed(WITHHELD_REASONS, reason),
    };
}

export function logWithheld(
    ids: { readonly resultId: string; readonly requestId: string },
    shapeIndex: number,
    shape: RenderShape,
    reason: WithheldReason,
): void {
    logger.warn(withheldLogFields(ids, shapeIndex, shape, reason), "ask dev render withheld");
}

import { logger } from "@/lib/logger";

import type { RenderShape } from "@/lib/ask-dev/render/contracts";

/**
 * One log line per WITHHELD occurrence per render of a result (CHAOS-11941, E8 design §5.4): ids,
 * closed vocabularies and the reason only. Never a label, value, subject id or question text, and a
 * `shape_id` only when it has ACR's own form (`rs_<n>`).
 */
const ACR_SHAPE_ID = /^rs_[0-9]{1,3}$/u;

export type WithheldLogFields = {
    readonly event: "ask_dev_render_withheld";
    readonly result_id: string;
    readonly request_id: string;
    readonly shape_index: number;
    readonly shape_id_ok: boolean;
    readonly shape_id?: string;
    readonly selected_by: string;
    readonly kind: string;
    readonly presentation: string | undefined;
    readonly reason: string;
};

export function withheldLogFields(
    ids: { readonly resultId: string; readonly requestId: string },
    shapeIndex: number,
    shape: RenderShape,
    reason: string,
): WithheldLogFields {
    const idOk = typeof shape.shape_id === "string" && ACR_SHAPE_ID.test(shape.shape_id);
    return {
        event: "ask_dev_render_withheld",
        result_id: ids.resultId,
        request_id: ids.requestId,
        shape_index: shapeIndex,
        shape_id_ok: idOk,
        ...(idOk ? { shape_id: shape.shape_id } : {}),
        selected_by: shape.selected_by,
        kind: shape.kind,
        presentation: shape.presentation,
        reason,
    };
}

export function logWithheld(
    ids: { readonly resultId: string; readonly requestId: string },
    shapeIndex: number,
    shape: RenderShape,
    reason: string,
): void {
    logger.warn(withheldLogFields(ids, shapeIndex, shape, reason), "ask dev render withheld");
}

/**
 * Failure Patterns chart transform.
 *
 * The Pipelines "Failure Patterns" heatmap groups pipeline failure rate by a
 * real dimension (e.g. TEAM). Upstream data can carry a null/empty grouping key
 * (Python `None` is frequently stringified to the literal `"None"`), which
 * previously rendered as a single silent "None" bar — meaningless to a customer.
 *
 * This module normalizes grouping keys so that:
 *   - Genuinely-missing keys are bucketed into an explicit, labeled
 *     "Unattributed" category (never a silent "None"), surfaced with a caveat.
 *   - When the dimension genuinely has no data, callers render a customer-safe
 *     empty state instead of an empty/degenerate chart.
 *   - Tooltips keep showing the real category + value (handled by HeatmapChart).
 */

import type { BreakdownResult } from "@/lib/graphql/schemas/analytics";
import type { HeatmapResponse } from "@/lib/types";

/** Human-facing label for failures that have no real grouping key. */
export const UNATTRIBUTED_LABEL = "Unattributed";

/** Row label for the single-row failure-rate heatmap. */
const FAILURE_ROW_LABEL = "Failure Rate";

/**
 * Lower-cased tokens that represent a missing/unknown grouping key. Includes the
 * common stringified-null values that leak in from upstream serializers.
 */
const MISSING_KEY_TOKENS = new Set(["", "none", "null", "undefined", "n/a", "na", "nan"]);

/** True when a breakdown key carries no real grouping information. */
export function isMissingKey(key: string | null | undefined): boolean {
    if (key == null) return true;
    return MISSING_KEY_TOKENS.has(key.trim().toLowerCase());
}

export type FailurePatternsModel = {
    heatmap: HeatmapResponse;
    /** True when the dimension genuinely has no failure data for the window/scope. */
    isEmpty: boolean;
    /** True when at least one failure value was bucketed as Unattributed. */
    hasUnattributed: boolean;
};

/**
 * Build the Failure Patterns heatmap model from a failure-rate breakdown.
 *
 * Missing/null grouping keys are collapsed into a single, explicitly labeled
 * {@link UNATTRIBUTED_LABEL} bucket (rendered last) rather than a silent "None".
 */
export function buildFailurePatternsModel(
    breakdown: BreakdownResult | undefined,
    unit = "%",
): FailurePatternsModel {
    const items = breakdown?.items ?? [];

    if (items.length === 0) {
        return {
            heatmap: {
                axes: { x: [], y: [FAILURE_ROW_LABEL] },
                cells: [],
                legend: { unit, scale: "linear" },
            },
            isEmpty: true,
            hasUnattributed: false,
        };
    }

    // Aggregate values per normalized key so that multiple missing keys collapse
    // into one Unattributed bucket and duplicate real keys are summed.
    const attributed = new Map<string, number>();
    let unattributed = 0;
    let hasUnattributed = false;

    for (const item of items) {
        const value = Number.isFinite(item.value) ? item.value : 0;
        if (isMissingKey(item.key)) {
            unattributed += value;
            hasUnattributed = true;
            continue;
        }
        attributed.set(item.key, (attributed.get(item.key) ?? 0) + value);
    }

    // Preserve the original ordering of real keys; append Unattributed last.
    const orderedKeys = [...attributed.keys()];
    if (hasUnattributed) {
        orderedKeys.push(UNATTRIBUTED_LABEL);
        attributed.set(UNATTRIBUTED_LABEL, unattributed);
    }

    const cells = orderedKeys.map((key) => ({
        x: key,
        y: FAILURE_ROW_LABEL,
        value: attributed.get(key) ?? 0,
    }));

    return {
        heatmap: {
            axes: { x: orderedKeys, y: [FAILURE_ROW_LABEL] },
            cells,
            legend: { unit, scale: "linear" },
        },
        isEmpty: cells.length === 0,
        hasUnattributed,
    };
}

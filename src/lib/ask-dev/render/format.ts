import type { InvestigationResult, RenderShape } from "@/lib/ask-dev/render/contracts";
import { trendShapesForClaim } from "@/lib/ask-dev/render/verify";

// Ported 1:1 from three functions ask-dev keeps private (CHAOS-11941, E8 design §6.1): `formatValue`
// and `formatDisplay` (ask-dev `src/components/RenderShapeChart.tsx`) and `trendsForGroup` (ask-dev
// `src/components/FactRowsPanel.tsx`), at the pinned `scripts/ask-dev-oracle/ASK_DEV_SHA`. The bodies
// are unchanged. The oracle reaches ask-dev's private originals through an append-only export
// transform checked against the pinned blob, and compares their complete returns with these.

/**
 * Formats a plotted number WITHOUT turning it into a different one (ask-dev `formatValue`).
 *
 * Two decimals is a readable default, but `0.004` rounds to `0` — and this
 * contract exists so a chart number equals the fact it cites. In the
 * accessible table it is the only number a reader gets at all. So the short
 * form is used only when it round-trips to the same value; otherwise the
 * value is shown in full (codex round 1, P2).
 */
export function formatExact(value: number): string {
    return String(value);
}

/**
 * The DRAWN form of a number: at most two decimals.
 *
 * Rounding a glyph is honest only because the exact value is always
 * reachable beside it — every mark carries the full value in its
 * `aria-label` and `<title>`, and the accessible table prints it in full via
 * `formatValue`. What is never allowed is rounding being the ONLY form a
 * reader can get, which is why the table uses the exact value and this is
 * used for drawn text alone.
 */
export function formatDisplay(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/**
 * Merges acr's own server-selected trend shapes across every claim in a
 * CHAOS-4672 table group, not just the panel's primary claim — a shape
 * `trendShapesForClaim` would have drawn for a claim that is now folded into
 * `alsoClaims` must still be drawn HERE, on the one panel left standing for
 * their shared table (never silently dropped by the dedupe). A shape is
 * "owned" by at most one claim (`trendShapesForClaim`'s own ownership rule:
 * every point cites ONLY that claim), so `shapes` from different claim ids
 * are already disjoint — the `Map` below is defense in depth, not a real
 * collision. `withheld` is summed per claim rather than deduplicated: the
 * safe direction for a count whose whole purpose is "surface an answer-
 * quality failure, never swallow it" is to over-report, not under-report,
 * on the rare case a withheld candidate mentions more than one claim in the
 * group.
 */
export function trendsForGroup(
    result: InvestigationResult | undefined,
    claimIds: readonly string[],
): { readonly shapes: readonly RenderShape[]; readonly withheld: number } {
    if (result === undefined) return { shapes: [], withheld: 0 };
    const shapeById = new Map<string, RenderShape>();
    let withheld = 0;
    for (const claimId of claimIds) {
        const perClaim = trendShapesForClaim(result, claimId);
        for (const shape of perClaim.shapes) shapeById.set(shape.shape_id, shape);
        withheld += perClaim.withheld;
    }
    return { shapes: [...shapeById.values()], withheld };
}

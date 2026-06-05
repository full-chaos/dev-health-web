// ── Area signals: the cross-area signal-card contract (CHAOS-2074) ────────────
//
// An `AreaSignal` is the resolved, render-ready descriptor for one sub-area of a
// decision area's landing page. The area landing (an RSC) resolves an
// `AreaSignal[]` for its area and hands it to {@link AreaHub}, which renders each
// as a severity-sorted signal card (metric + state) instead of a passive link
// (Framework A2a).
//
// Honest-state contract (owner decision 1): a signal whose metric is genuinely
// unavailable carries `state: "unavailable"` — never a fabricated value. Those
// cards render the {@link DataState} primitive and sink to the bottom of the
// sort. Real signals always sort first.
//
// This is the SHARED shape every area resolver returns. Govern is wired now;
// Diagnose / Improve resolvers (Phase 2) return the same shape.

import type { ConfidenceLevel, SignalDirection, SignalSeverity } from "@/lib/types";

/**
 * A sub-area surfaced as a signal card on its area's landing page.
 *
 * `state` reuses the canonical {@link SignalSeverity} ladder, widened with
 * `"unavailable"` (honest empty — render via DataState) and `"neutral"` (a
 * value worth surfacing that is NOT a severity, e.g. AI adoption %).
 */
export type AreaSignalState = SignalSeverity | "neutral" | "unavailable";

export type AreaSignal = {
    /** Stable id, mirrors the originating `NavAreaHubItem.id`. */
    id: string;
    /** Sub-area label (e.g. "Coverage", "Security"). */
    label: string;
    /** Destination route (already filter-decorated by AreaHub at render time). */
    href: string;
    /** Optional sub-group header within the area (Govern: "Quality" | "Risk"). */
    cluster?: string;
    /** Short metric name shown on the card (e.g. "Line coverage", "Open criticals"). */
    metricLabel: string;
    /**
     * Pre-formatted headline value via `@/lib/formatters` (e.g. "83%", "2").
     * Empty string when `state === "unavailable"`.
     */
    value: string;
    /** Severity ladder, widened with "neutral" / "unavailable" (honest states). */
    state: AreaSignalState;
    /** Optional trend glyph direction for the metric. */
    direction?: SignalDirection;
    /** Optional confidence in the resolved value. */
    confidence?: ConfidenceLevel;
    /**
     * R4-style low-value single surface (e.g. Feature Flags): render visually
     * secondary within its cluster rather than at equal billing.
     */
    demoted?: boolean;
};

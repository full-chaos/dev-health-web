// ── Shared signal severity tokens (CHAOS-2074) ────────────────────────────────
//
// The canonical severity → token maps, extracted from {@link SignalCard} so the
// cockpit cards and the area-landing signal cards ({@link AreaHub}) share ONE
// visual language. Token-only (design tokens / Tailwind utilities — no new hex
// or px), so this module is import-safe from both client and server components.

import type { ConfidenceLevel, SignalDirection, SignalSeverity } from "@/lib/types";
import type { AreaSignalState } from "@/lib/areaSignals/types";

/** Severity badge chip classes (border + bg + text). */
export const SEVERITY_BADGE: Record<SignalSeverity, string> = {
    critical: "border-(--accent-negative)/30 bg-(--accent-negative)/12 text-(--accent-negative)",
    high: "border-(--accent-3)/30 bg-(--accent-3)/12 text-(--accent-3)",
    medium: "border-(--accent-2)/30 bg-(--accent-2)/12 text-(--accent-2)",
    low: "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)",
};

/** Severity badge labels. */
export const SEVERITY_LABEL: Record<SignalSeverity, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
};

export const CONFIDENCE_DOT: Record<ConfidenceLevel, string> = {
    high: "bg-(--accent-3)",
    medium: "bg-(--accent-3)",
    low: "bg-(--ink-muted)",
};

export const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
    high: "text-(--accent-3)",
    medium: "text-(--accent-3)",
    low: "text-(--ink-muted)",
};

export const DIRECTION_GLYPH: Record<SignalDirection, string> = {
    up: "↑",
    down: "↓",
    flat: "→",
};

export const directionAccent = (direction: SignalDirection): string =>
    direction === "up"
        ? "text-(--accent-3)"
        : direction === "down"
          ? "text-(--accent-negative)"
          : "text-(--ink-muted)";

// ── Area-signal state extensions (CHAOS-2074) ─────────────────────────────────
// Area signals widen `SignalSeverity` with "neutral" (informational, non-severity
// — e.g. AI adoption %) and "unavailable" (honest-empty, rendered via DataState
// rather than a badge). The badge map below covers only the badge-bearing states.

/** Neutral / informational chip — calm, non-alarming. */
export const NEUTRAL_BADGE = "border-(--card-stroke) bg-(--card-70) text-(--ink-muted)";
export const NEUTRAL_LABEL = "Info";

/** Badge classes for any badge-bearing area-signal state ("unavailable" excluded). */
export const AREA_STATE_BADGE: Record<Exclude<AreaSignalState, "unavailable">, string> = {
    ...SEVERITY_BADGE,
    neutral: NEUTRAL_BADGE,
};

/** Badge label for any badge-bearing area-signal state ("unavailable" excluded). */
export const AREA_STATE_LABEL: Record<Exclude<AreaSignalState, "unavailable">, string> = {
    ...SEVERITY_LABEL,
    neutral: NEUTRAL_LABEL,
};

/**
 * Area-card severity pill (approved `.pill`): small, fully round (`rounded-full!` beats a caller's `rounded-sm`), tinted fill, no outline, no forced caps.
 * Production's severity words stay (Critical / High / Medium / Low / Info).
 */
export const AREA_STATE_PILL: Record<Exclude<AreaSignalState, "unavailable">, string> = {
    critical: "rounded-full! bg-(--accent-negative)/12 text-(--accent-negative)",
    high: "rounded-full! bg-(--accent-3)/12 text-(--accent-3)",
    medium: "rounded-full! bg-(--accent-2)/12 text-(--accent-2)",
    low: "rounded-full! bg-(--positive)/12 text-(--positive)",
    neutral: "rounded-full! bg-(--info)/12 text-(--info)",
};

/** Hero big-value color by state: critical and high take their severity token, others stay ink. */
export const AREA_STATE_VALUE_COLOR: Record<Exclude<AreaSignalState, "unavailable">, string> = {
    critical: "text-(--accent-negative)",
    high: "text-(--accent-3)",
    medium: "text-foreground",
    low: "text-foreground",
    neutral: "text-foreground",
};

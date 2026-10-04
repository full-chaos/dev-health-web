import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { formatDelta } from "@/lib/formatters";
import type { OpportunityCard } from "@/lib/types";

/**
 * The move an opportunity card is about, as the API serves it (CHAOS-8109): `change_percent`
 * (signed and unrounded), `direction` ("up" | "down": the sign as a word, NOT good or bad), and
 * the compared windows `range_days` / `compare_days`.
 *
 * The web shows these values and makes none: a value that is not served reads "Not reported" and
 * no zero takes its place. The card has no served no-data flag, so the web has no rule of its own
 * for a window with no data: a served -100 prints as "-100%".
 */

/** "+1,041%" / "-33%", printed by the web's one change formatter; "Not reported" when not served. */
export function capturedChangeValue(card: OpportunityCard): string {
    const change = card.change_percent;
    return typeof change === "number" && Number.isFinite(change)
        ? formatDelta(change)
        : NOT_REPORTED;
}

/** True when the change is served: the value is a number and not the "Not reported" text. */
export function hasCapturedChange(card: OpportunityCard): boolean {
    return typeof card.change_percent === "number" && Number.isFinite(card.change_percent);
}

const DIRECTION_WORD: Record<string, string> = { up: "Up", down: "Down" };

const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

/**
 * "Up, last 14 days against the 14 days before." from the served direction word and the served
 * window days. A part that is not served is left out; with no part there is no line (null).
 */
export function capturedChangeWindow(card: OpportunityCard): string | null {
    const word = typeof card.direction === "string" ? DIRECTION_WORD[card.direction] : undefined;
    const { range_days: range, compare_days: compare } = card;
    const window =
        typeof range === "number" && typeof compare === "number"
            ? `last ${dayCount(range)} against the ${dayCount(compare)} before`
            : null;
    if (word && window) return `${word}, ${window}.`;
    if (word) return `${word}.`;
    if (window) return `${window.charAt(0).toUpperCase()}${window.slice(1)}.`;
    return null;
}

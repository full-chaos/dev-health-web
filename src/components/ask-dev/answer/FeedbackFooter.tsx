"use client";

import { CTA_LABELS } from "@/lib/design/cta";

/** The rating this footer has committed, or `saving` while the request is in
 * flight. `null` means nothing has been submitted for this answer yet. */
export type FeedbackState = "helpful" | "not_helpful" | "saving" | null;

/**
 * Beta feedback for one answer.
 *
 * Deliberately narrow today: a binary rating is all the wire vocabulary
 * supports being asked for honestly. The reason dimensions the contract
 * already carries are not surfaced yet, and the two the provider currently
 * sends are inferred from the rating rather than chosen by the reader — so
 * this component asks only the question it can actually record.
 */
export function FeedbackFooter({
    error,
    onRate,
    state,
}: {
    error: string | null;
    onRate: (rating: "helpful" | "not_helpful") => void;
    state: FeedbackState;
}) {
    return (
        <footer className="flex flex-wrap items-center gap-2 border-t border-(--border) pt-4">
            <span className="mr-1 text-xs text-(--text-muted)">Was this useful?</span>
            <button
                type="button"
                disabled={state === "saving" || state === "helpful"}
                onClick={() => onRate("helpful")}
                className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs text-(--text-secondary) hover:border-(--positive)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--positive)/45 disabled:opacity-55"
            >
                {CTA_LABELS.askDevHelpful}
            </button>
            <button
                type="button"
                disabled={state === "saving" || state === "not_helpful"}
                onClick={() => onRate("not_helpful")}
                className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs text-(--text-secondary) hover:border-(--caution)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--caution)/45 disabled:opacity-55"
            >
                {CTA_LABELS.askDevNotHelpful}
            </button>
            {state === "helpful" || state === "not_helpful" ? (
                <span role="status" className="text-xs text-(--positive)">
                    Feedback saved.
                </span>
            ) : null}
            {error ? (
                <span role="alert" className="text-xs text-(--negative)">
                    {error}
                </span>
            ) : null}
        </footer>
    );
}

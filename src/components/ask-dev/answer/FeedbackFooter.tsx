"use client";

import { useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

import {
    FEEDBACK_COMMENT_MAX_LENGTH,
    FEEDBACK_REASON_LABELS,
    NEGATIVE_FEEDBACK_REASONS,
    POSITIVE_FEEDBACK_REASON,
    type DevFeedbackReason,
} from "./feedbackReasons";

/** The rating this footer has committed, or `saving` while the request is in
 * flight. `null` means nothing has been submitted for this answer yet. */
export type FeedbackState = "helpful" | "not_helpful" | "saving" | null;

export type FeedbackSubmission = Readonly<{
    rating: "helpful" | "not_helpful";
    reasons: readonly DevFeedbackReason[];
    comment: string | null;
}>;

/**
 * Beta feedback for one answer.
 *
 * The two paths are deliberately asymmetric, and the asymmetry is the point.
 *
 * `reasons` is required on the wire with `minItems: 1`, so *something* must
 * always be sent. A positive rating can satisfy that honestly: `useful`
 * restates the button the reader pressed. A negative rating cannot — any reason
 * filled in on the reader's behalf is a specific diagnosis nobody made. The
 * previous implementation sent `["unclear"]` for every unhelpful rating, which
 * recorded "the answer was unclear" for every thumbs-down whether or not it
 * was: a measurement that never happened, stored as one that did, inside the
 * very signal this beta collects. So the negative path asks, and `Save` stays
 * disabled until at least one reason is actually chosen.
 *
 * If a neutral "declined to say" member is added to the contract, the negative
 * path can go back to one click and record that member instead — an honest
 * value for an honest absence. Until then, asking is the only truthful option.
 */
export function FeedbackFooter({
    error,
    onSubmit,
    state,
}: {
    error: string | null;
    onSubmit: (submission: FeedbackSubmission) => void;
    state: FeedbackState;
}) {
    const [reasonsOpen, setReasonsOpen] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<DevFeedbackReason>>(() => new Set());
    const [comment, setComment] = useState("");

    const settled = state === "helpful" || state === "not_helpful";
    const saving = state === "saving";

    const toggleReason = (reason: DevFeedbackReason) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(reason)) next.delete(reason);
            else next.add(reason);
            return next;
        });
    };

    const submitNegative = () => {
        if (!selected.size) return;
        const trimmed = comment.trim();
        onSubmit({
            rating: "not_helpful",
            // Sorted so the recorded order reflects the sanctioned reason order
            // rather than the order the reader happened to click in.
            reasons: NEGATIVE_FEEDBACK_REASONS.filter((reason) => selected.has(reason)),
            comment: trimmed.length ? trimmed : null,
        });
    };

    return (
        <footer className="space-y-3 border-t border-(--border) pt-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-(--text-muted)">Was this useful?</span>
                <button
                    type="button"
                    disabled={saving || settled}
                    onClick={() =>
                        onSubmit({
                            rating: "helpful",
                            reasons: [POSITIVE_FEEDBACK_REASON],
                            comment: null,
                        })
                    }
                    className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs text-(--text-secondary) hover:border-(--positive)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--positive)/45 disabled:opacity-55"
                >
                    {CTA_LABELS.askDevHelpful}
                </button>
                <button
                    type="button"
                    disabled={saving || settled}
                    aria-expanded={reasonsOpen}
                    onClick={() => setReasonsOpen(true)}
                    className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs text-(--text-secondary) hover:border-(--caution)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--caution)/45 disabled:opacity-55"
                >
                    {CTA_LABELS.askDevNotHelpful}
                </button>
                {settled ? (
                    <span role="status" className="text-xs text-(--positive)">
                        Feedback saved.
                    </span>
                ) : null}
                {error ? (
                    <span role="alert" className="text-xs text-(--negative)">
                        {error}
                    </span>
                ) : null}
            </div>

            {reasonsOpen && !settled ? (
                <div className="space-y-2" aria-label="What was wrong with this answer?">
                    <p className="text-xs text-(--text-muted)">
                        Tell us what was wrong. Pick at least one.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {NEGATIVE_FEEDBACK_REASONS.map((reason) => (
                            <button
                                key={reason}
                                type="button"
                                disabled={saving}
                                aria-pressed={selected.has(reason)}
                                onClick={() => toggleReason(reason)}
                                className={
                                    selected.has(reason)
                                        ? "rounded-(--radius-pill) border border-(--caution)/60 bg-(--caution)/12 px-3 py-1 text-xs text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--caution)/45"
                                        : "rounded-(--radius-pill) border border-(--border) px-3 py-1 text-xs text-(--text-secondary) hover:border-(--caution)/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--caution)/45 disabled:opacity-55"
                                }
                            >
                                {FEEDBACK_REASON_LABELS[reason]}
                            </button>
                        ))}
                    </div>
                    <label className="block space-y-1">
                        <span className="text-xs text-(--text-muted)">
                            Anything else? (optional)
                        </span>
                        <textarea
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
                            rows={2}
                            disabled={saving}
                            className="w-full rounded-(--radius-sm) border border-(--border) bg-(--background)/60 px-2 py-1.5 text-xs text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-55"
                        />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={saving || selected.size === 0}
                            onClick={submitNegative}
                            className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) hover:border-(--accent)/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-55"
                        >
                            {saving ? CTA_LABELS.saving : CTA_LABELS.save}
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                                setReasonsOpen(false);
                                setSelected(new Set());
                                setComment("");
                            }}
                            className="rounded-(--radius-sm) px-2.5 py-1.5 text-xs text-(--text-muted) hover:text-(--text-secondary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-55"
                        >
                            {CTA_LABELS.cancel}
                        </button>
                    </div>
                </div>
            ) : null}
        </footer>
    );
}

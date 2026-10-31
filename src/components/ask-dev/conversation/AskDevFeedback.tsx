"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Check } from "lucide-react";

import { CTA_LABELS } from "@/lib/design/cta";

import { useAskDevFeedbackStore } from "./AskDevConversationContext";
import {
    FEEDBACK_QUESTIONS,
    type FeedbackEntry,
    type FeedbackQuestion,
    type FeedbackStore,
} from "./feedbackStore";

/**
 * Feedback on one answer (CHAOS-11958; E6 web design v5 §6): "Correct?" and "Useful?", each yes or
 * no; pressing the chosen value again clears it. One state per `result_id` in both surfaces.
 *
 * - ACR's 404 (not the caller's Ask Dev result, or not served now) renders nothing.
 * - While the first read is out, the controls are drawn disabled. A failed read keeps them disabled,
 *   with "Try again" (a GET).
 * - A failed write rolls its change back and says "Feedback was not saved."
 * - There is no free text, and nothing here sends product telemetry or logs a choice.
 */
export const FEEDBACK_COPY = {
    region: "Feedback on this answer",
    correct: "Correct?",
    useful: "Useful?",
    yes: "Yes",
    no: "No",
    readFailed: "Feedback could not be read.",
    notSaved: "Feedback was not saved.",
} as const;

const CHIP =
    "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-60";
const CHIP_ON = "border-(--accent-2) bg-(--accent-2)/25 font-semibold text-foreground";
const CHIP_OFF =
    "border-(--card-stroke) bg-(--surface) text-foreground enabled:hover:bg-(--surface-raised)";
const LINK_BUTTON =
    "text-sm font-semibold text-foreground underline underline-offset-2 hover:text-(--accent-2) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)";

/** The feedback controls of `resultId`, or nothing when there is no transport. */
export function AskDevFeedback({ resultId }: { resultId: string }) {
    const store = useAskDevFeedbackStore();
    if (store === null) return null;
    return <FeedbackControls store={store} resultId={resultId} />;
}

function FeedbackControls({ store, resultId }: { store: FeedbackStore; resultId: string }) {
    const entry = useSyncExternalStore(
        store.subscribe,
        () => store.entry(resultId),
        () => undefined,
    );
    // Read once per partition: again after a partition change dropped the entry.
    useEffect(() => {
        if (entry === undefined) store.ensure(resultId);
    }, [store, resultId, entry]);
    if (entry === undefined || entry.state === "unavailable") return null;
    const enabled = entry.state === "ready";
    return (
        <section
            aria-label={FEEDBACK_COPY.region}
            data-testid="ask-dev-feedback"
            data-state={entry.state}
            aria-busy={entry.state === "loading" || entry.saving}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-(--card-stroke) pt-3"
        >
            {FEEDBACK_QUESTIONS.map((question) => (
                <FlagGroup
                    key={question}
                    question={question}
                    entry={entry}
                    enabled={enabled}
                    onChoose={(value) => store.choose(resultId, question, value)}
                />
            ))}
            {entry.state === "read_failed" ? (
                <p
                    role="status"
                    data-testid="ask-dev-feedback-read-failed"
                    className="flex items-center gap-2 text-sm text-(--ink-muted)"
                >
                    {FEEDBACK_COPY.readFailed}
                    <button
                        type="button"
                        data-testid="ask-dev-feedback-retry"
                        className={LINK_BUTTON}
                        onClick={() => store.retryRead(resultId)}
                    >
                        {CTA_LABELS.tryAgain}
                    </button>
                </p>
            ) : null}
            {entry.notSaved ? (
                <p
                    role="status"
                    data-testid="ask-dev-feedback-not-saved"
                    className="text-sm text-(--ink-muted)"
                >
                    {FEEDBACK_COPY.notSaved}
                </p>
            ) : null}
        </section>
    );
}

function FlagGroup({
    question,
    entry,
    enabled,
    onChoose,
}: {
    question: FeedbackQuestion;
    entry: FeedbackEntry;
    enabled: boolean;
    onChoose: (value: "yes" | "no") => void;
}) {
    const label = FEEDBACK_COPY[question];
    const chosen = entry.desired[question];
    return (
        <div
            role="group"
            aria-label={label}
            data-testid={`ask-dev-feedback-${question}`}
            className="flex items-center gap-2"
        >
            <span aria-hidden="true" className="text-sm text-(--ink-muted)">
                {label}
            </span>
            {(["yes", "no"] as const).map((value) => {
                const on = chosen === value;
                return (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        disabled={!enabled}
                        data-testid={`ask-dev-feedback-${question}-${value}`}
                        className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                        onClick={() => onChoose(value)}
                    >
                        {on ? <Check aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> : null}
                        {FEEDBACK_COPY[value]}
                    </button>
                );
            })}
        </div>
    );
}

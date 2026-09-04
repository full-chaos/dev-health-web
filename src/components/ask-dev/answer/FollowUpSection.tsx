"use client";

import type { SafeProse } from "./labels";

/**
 * Server-suggested next questions.
 *
 * These are prompts, not answers: clicking one submits that question as a new
 * run through the same path a typed question takes. Nothing here pre-computes
 * or hardcodes a result, and nothing here changes the committed scope.
 */
export function FollowUpSection({
    onAsk,
    questions,
    safeProse,
}: {
    onAsk: (question: string) => void;
    questions: readonly string[];
    safeProse: SafeProse;
}) {
    return (
        <section
            className="space-y-2 border-t border-(--border) pt-4"
            aria-label="Suggested follow-up questions"
        >
            <p className="text-label-caps text-(--text-muted)">Ask next</p>
            <div className="flex flex-wrap gap-2">
                {questions.map((question) => (
                    <button
                        key={question}
                        type="button"
                        onClick={() => onAsk(question)}
                        className="rounded-(--radius-pill) border border-(--border) px-3 py-1.5 text-left text-xs text-(--text-secondary) hover:border-(--accent)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                    >
                        {safeProse(question)}
                    </button>
                ))}
            </div>
        </section>
    );
}

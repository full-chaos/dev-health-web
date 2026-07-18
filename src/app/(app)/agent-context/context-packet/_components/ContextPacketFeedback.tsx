"use client";

import { useState } from "react";
import { CTA_LABELS } from "@/lib/design/cta";

const FEEDBACK_LABELS = [
    CTA_LABELS.markContextIncorrect,
    CTA_LABELS.markContextStale,
    CTA_LABELS.markContextIrrelevant,
] as const;

export function ContextPacketFeedback() {
    const [feedback, setFeedback] = useState<(typeof FEEDBACK_LABELS)[number] | null>(null);

    return (
        <section
            aria-label="Context Fabric feedback"
            className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4"
        >
            <h2 className="text-h3 font-semibold text-foreground">Is this context useful?</h2>
            <p className="mt-1 text-sm text-(--ink-muted)">
                Feedback stays in this browser session and is not sent or stored.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                {FEEDBACK_LABELS.map((label) => (
                    <button
                        key={label}
                        type="button"
                        aria-pressed={feedback === label}
                        onClick={() => setFeedback(label)}
                        className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-(--card-70) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                    >
                        {label}
                    </button>
                ))}
            </div>
            {feedback ? (
                <p role="status" className="mt-3 text-sm text-(--ink-muted)">
                    Feedback recorded for this session only.
                </p>
            ) : null}
        </section>
    );
}

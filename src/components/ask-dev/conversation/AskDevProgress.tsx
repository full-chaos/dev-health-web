"use client";

import { Check, Circle, LoaderCircle, Minus } from "lucide-react";
import { useEffect, useState } from "react";

import type { StageProgress } from "./conversationStore";
import { INVESTIGATION_STAGES, type InvestigationStage } from "./transport";

/**
 * The streaming state of a turn (plan §2.7.8, CHAOS-11929): the stage checklist and the elapsed
 * time. It shows progress only, never answer content: no claim, coverage or score comes before a
 * validated `result` (checks 11, 12). The run's Cancel is the composer's Stop (CHAOS-11928).
 */

/** One line per ACR stage, in the stream's one order. */
export const STAGE_COPY = {
    interpreting: "Reading the question",
    resolving_subjects: "Finding what the question is about",
    reading_facts: "Reading stored facts",
    synthesizing: "Drafting the answer",
    validating: "Checking the answer",
} as const satisfies Record<InvestigationStage, string>;

export type StageRowState = "done" | "active" | "skipped" | "pending";

export const PROGRESS_COPY = {
    steps: "Investigation steps",
    elapsed: "Elapsed",
    state: {
        done: "done",
        active: "in progress",
        skipped: "skipped",
        pending: "not started",
    },
} as const satisfies {
    steps: string;
    elapsed: string;
    state: Record<StageRowState, string>;
};

/**
 * Each stage's row. A stage the stream completed is done. A started stage is active while it is the
 * last one named, and done once a later one began. A stage never named is skipped when a later one
 * was named (ACR may skip stages), else not started yet.
 */
export function stageRows(
    stages: StageProgress,
): { stage: InvestigationStage; state: StageRowState }[] {
    let lastNamed = -1;
    INVESTIGATION_STAGES.forEach((stage, index) => {
        if (stages[stage] !== undefined) lastNamed = index;
    });
    return INVESTIGATION_STAGES.map((stage, index) => {
        const reached = stages[stage];
        const later = index < lastNamed;
        if (reached === "completed") return { stage, state: "done" };
        if (reached === "started") return { stage, state: later ? "done" : "active" };
        return { stage, state: later ? "skipped" : "pending" };
    });
}

/** `m:ss` (or `h:mm:ss`) of a non-negative duration. */
export function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours > 0
        ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}`
        : `${String(minutes)}:${seconds}`;
}

/** The time since `startedAt` (epoch ms), counted once a second. */
export function useElapsed(startedAt: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    return Math.max(0, now - startedAt);
}

/** The elapsed line. It is not announced each second: the transcript announces additions only. */
export function AskDevElapsed({ startedAt }: { startedAt: number }) {
    const elapsed = formatElapsed(useElapsed(startedAt));
    return (
        <p data-testid="ask-dev-elapsed" className="text-xs tabular-nums text-(--ink-muted)">
            {PROGRESS_COPY.elapsed} <span data-testid="ask-dev-elapsed-value">{elapsed}</span>
        </p>
    );
}

const ICON = "h-3.5 w-3.5 shrink-0";

function StageIcon({ state }: { state: StageRowState }) {
    switch (state) {
        case "done":
            return <Check aria-hidden="true" className={`${ICON} text-(--accent-2)`} />;
        case "active":
            return (
                <LoaderCircle
                    aria-hidden="true"
                    className={`${ICON} text-(--accent-2) motion-safe:animate-spin`}
                />
            );
        case "skipped":
            return <Minus aria-hidden="true" className={`${ICON} text-(--ink-muted)`} />;
        case "pending":
            return <Circle aria-hidden="true" className={`${ICON} text-(--ink-muted)`} />;
    }
}

/** The stage checklist of a running turn. */
export function AskDevStageChecklist({ stages }: { stages: StageProgress }) {
    return (
        <ol
            aria-label={PROGRESS_COPY.steps}
            data-testid="ask-dev-stages"
            className="space-y-1.5 text-sm"
        >
            {stageRows(stages).map(({ stage, state }) => (
                <li
                    key={stage}
                    data-testid="ask-dev-stage"
                    data-stage={stage}
                    data-state={state}
                    className={`flex items-center gap-2 ${
                        state === "active" ? "text-foreground" : "text-(--ink-muted)"
                    }`}
                >
                    <StageIcon state={state} />
                    <span className={state === "skipped" ? "line-through" : undefined}>
                        {STAGE_COPY[stage]}
                    </span>
                    <span className="sr-only">: {PROGRESS_COPY.state[state]}</span>
                </li>
            ))}
        </ol>
    );
}

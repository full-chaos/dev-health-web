"use client";

import type { ReactNode } from "react";

import { AskDevTurn, turnKey } from "./answer/AskDevTurn";
import { useTestModeTurns, type TestModeTurns } from "./answer/testModeAnswer";
import { AskDevComposer } from "./conversation/AskDevComposer";
import {
    useAskDevConversation,
    useAskDevNotSaved,
    type AskDevConversation,
} from "./conversation/AskDevConversationContext";
import { AskDevConversationTurn } from "./conversation/AskDevConversationTurn";
import { carryOfChoice } from "./conversation/conversationStore";
import { AskDevContextChips } from "./pageContext/AskDevContextChips";
import { pageHintsOf, useAskDevPageProposal } from "./pageContext/AskDevPageContext";

/**
 * The conversation of this tab, as the panel and the full page `/dev` both draw it (CHAOS-11934):
 * the transcript and the composer read the one store above them, so moving between the two shows
 * the same turns and the same run, and sends nothing.
 */
export const TRANSCRIPT_COPY = {
    empty: "Your conversation will appear here.",
    /** Plan §2.5: a reload loses the conversation until Phase 4 (E6) stores it. */
    notSaved: "This conversation was not saved yet.",
    notSavedHint: "Reloading the page started a new one. Ask again to continue.",
} as const;

/** The transcript region; a screen reader hears each added turn. */
function TranscriptLog({ children }: { children: ReactNode }) {
    return (
        <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Conversation"
            data-testid="ask-dev-transcript"
            className="space-y-6 text-sm text-(--ink-muted)"
        >
            {children}
        </div>
    );
}

/** The empty transcript: the plain prompt, or the notice that a reload lost the conversation. */
function EmptyTranscript() {
    const notSaved = useAskDevNotSaved();
    if (!notSaved) return <p>{TRANSCRIPT_COPY.empty}</p>;
    return (
        <div className="space-y-1" data-testid="ask-dev-not-saved">
            <p className="font-medium text-foreground">{TRANSCRIPT_COPY.notSaved}</p>
            <p>{TRANSCRIPT_COPY.notSavedHint}</p>
        </div>
    );
}

/**
 * The store's conversation (CHAOS-11928): every turn in order, the empty state without any. Only the
 * last turn is live, and only while no run is in flight; every earlier turn is read-only, so an old
 * receipt cannot be sent.
 */
function ConversationTranscript({ live }: { live: AskDevConversation }) {
    const { store, snapshot } = live;
    const { turns } = snapshot;
    // CHAOS-3584: every next question from the live turn carries the page context the chips show
    // (codex r2 on #1645): a clarification choice and a narrower re-ask as well as the composer.
    const { refs } = useAskDevPageProposal();
    const pageHints = pageHintsOf(refs);
    return (
        <TranscriptLog>
            {turns.length === 0 ? (
                <EmptyTranscript />
            ) : (
                turns.map((turn, index) => {
                    const usable = index === turns.length - 1 && !snapshot.inFlight;
                    return (
                        <AskDevConversationTurn
                            key={`turn-${String(turn.id)}`}
                            turn={turn}
                            onConfirm={
                                usable
                                    ? (choice) =>
                                          store.submit(turn.question, {
                                              ...carryOfChoice(choice),
                                              pageHints,
                                          })
                                    : undefined
                            }
                            onReask={
                                usable
                                    ? (reask) => store.submit(reask.question, { pageHints })
                                    : undefined
                            }
                            onRetry={usable ? () => store.retry(turn.id) : undefined}
                        />
                    );
                })
            )}
        </TranscriptLog>
    );
}

/**
 * Test mode with no scripted transport: the turns a Playwright run put into session storage
 * (CHAOS-11930, CHAOS-3440), in order. Only the last turn is live.
 */
function TestModeTranscript({ conversation }: { conversation: TestModeTurns }) {
    const { turns, onConfirm, onReask } = conversation;
    return (
        <TranscriptLog>
            {turns.length === 0 ? (
                <p>{TRANSCRIPT_COPY.empty}</p>
            ) : (
                turns.map((turn, index) => {
                    const live = index === turns.length - 1;
                    return (
                        <AskDevTurn
                            key={turnKey(turn)}
                            turn={turn}
                            onConfirm={live ? onConfirm : undefined}
                            onReask={live ? onReask : undefined}
                        />
                    );
                })
            )}
        </TranscriptLog>
    );
}

/** The transcript: the store's turns, or the test-mode turns when there is no transport. */
export function AskDevTranscript() {
    const testModeTurns = useTestModeTurns();
    const live = useAskDevConversation();
    return live ? (
        <ConversationTranscript live={live} />
    ) : (
        <TestModeTranscript conversation={testModeTurns} />
    );
}

/** The composer of the store; nothing without a transport (T14, CHAOS-12104, not wired). */
export function AskDevComposerSlot() {
    const live = useAskDevConversation();
    // CHAOS-3584: the page context the user left in place goes with the next question as hints.
    const { refs } = useAskDevPageProposal();
    if (!live) return null;
    return (
        <div className="space-y-2">
            <AskDevContextChips />
            <AskDevComposer
                inFlight={live.snapshot.inFlight}
                ready={live.snapshot.ready}
                onSubmit={(question) =>
                    live.store.submit(question, { pageHints: pageHintsOf(refs) })
                }
                onCancel={() => live.store.cancel()}
            />
        </div>
    );
}

/** Whether a composer is drawn (the panel pins it under the transcript only then). */
export function useHasComposer(): boolean {
    return useAskDevConversation() !== null;
}

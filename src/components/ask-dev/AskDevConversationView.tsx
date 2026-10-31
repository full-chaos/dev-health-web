"use client";

import type { ReactNode } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

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
    /** CHAOS-11956 (E6 design v5 §4): the conversation's own states. */
    loading: "Loading this conversation…",
    /** ACR's 404 is the same for every cause (INV-1), so this says no cause. */
    unavailable: "This conversation is not available.",
    unavailableHint: "Start a new conversation, or open another one from the history.",
    readFailed: "This conversation could not be read.",
    earlierFailed: "Earlier turns could not be loaded.",
    /** The composer while the conversation cannot take a question. */
    lockedRestoring: "Loading the conversation…",
    lockedReadOnly: "Start a new conversation to ask a question.",
} as const;

const SECONDARY_BUTTON =
    "inline-flex items-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-50";

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

/** The neutral read-only state of a conversation ACR does not serve, or that could not be read. */
function ConversationNotShown({ live }: { live: AskDevConversation }) {
    const { store, snapshot } = live;
    const failed = snapshot.thread.kind === "read_failed";
    return (
        <div
            className="space-y-3"
            data-testid={
                failed ? "ask-dev-conversation-read-failed" : "ask-dev-conversation-unavailable"
            }
        >
            <p className="font-medium text-foreground">
                {failed ? TRANSCRIPT_COPY.readFailed : TRANSCRIPT_COPY.unavailable}
            </p>
            {failed ? null : <p>{TRANSCRIPT_COPY.unavailableHint}</p>}
            <div className="flex flex-wrap gap-2">
                {failed ? (
                    <button
                        type="button"
                        data-testid="ask-dev-conversation-retry"
                        onClick={() => store.retryThreadRead()}
                        className={SECONDARY_BUTTON}
                    >
                        {CTA_LABELS.tryAgain}
                    </button>
                ) : null}
                <button
                    type="button"
                    data-testid="ask-dev-conversation-new"
                    onClick={() => store.newConversation()}
                    className={SECONDARY_BUTTON}
                >
                    {CTA_LABELS.askDevNewConversation}
                </button>
            </div>
        </div>
    );
}

/** "Show earlier turns" above the oldest turn shown, while ACR has earlier ones. */
function EarlierTurns({ live }: { live: AskDevConversation }) {
    const { store, snapshot } = live;
    const { thread } = snapshot;
    if (thread.kind !== "loaded" || thread.earlier === "none") return null;
    return (
        <div className="space-y-2" data-testid="ask-dev-earlier-turns">
            {thread.earlier === "failed" ? <p>{TRANSCRIPT_COPY.earlierFailed}</p> : null}
            <button
                type="button"
                data-testid="ask-dev-show-earlier"
                disabled={thread.earlier === "loading"}
                onClick={() => store.loadEarlierTurns()}
                className={SECONDARY_BUTTON}
            >
                {CTA_LABELS.askDevShowEarlierTurns}
            </button>
        </div>
    );
}

/**
 * The store's conversation (CHAOS-11928, CHAOS-11956): every turn in the served order, the empty
 * state without any. Only the last turn of the current thread is live, and only while no run is in
 * flight and the conversation can take a question; every earlier turn is read-only, so an old
 * receipt cannot be sent. A restored turn whose answer read failed offers "Load again" (a GET).
 */
function ConversationTranscript({ live }: { live: AskDevConversation }) {
    const { store, snapshot } = live;
    const { turns, thread } = snapshot;
    // CHAOS-3584: every next question from the live turn carries the page context the chips show
    // (codex r2 on #1645): a clarification choice and a narrower re-ask as well as the composer.
    const { refs } = useAskDevPageProposal();
    const pageHints = pageHintsOf(refs);
    if (thread.kind === "unavailable" || thread.kind === "read_failed") {
        return (
            <TranscriptLog>
                <ConversationNotShown live={live} />
            </TranscriptLog>
        );
    }
    const open = thread.kind === "new" || thread.kind === "loaded";
    return (
        <TranscriptLog>
            <EarlierTurns live={live} />
            {turns.length === 0 ? (
                thread.kind === "restoring" ? (
                    <p data-testid="ask-dev-conversation-loading">{TRANSCRIPT_COPY.loading}</p>
                ) : (
                    <EmptyTranscript />
                )
            ) : (
                turns.map((turn, index) => {
                    const usable =
                        index === turns.length - 1 &&
                        open &&
                        !snapshot.inFlight &&
                        !snapshot.replaying &&
                        turn.threadId === snapshot.threadId;
                    // A question ACR did not record is never sent again (E6 design v5 §3.2).
                    const question = turn.question;
                    return (
                        <AskDevConversationTurn
                            key={`turn-${turn.submissionId}`}
                            turn={turn}
                            onConfirm={
                                usable && question !== null
                                    ? (choice) =>
                                          store.submit(question, {
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
                            onReload={
                                turn.origin === "restored"
                                    ? () => store.reloadTurn(turn.id)
                                    : undefined
                            }
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

/** Why the composer takes no question now, or `undefined` when it does. */
function lockedReason({ snapshot }: AskDevConversation): string | undefined {
    if (snapshot.replaying && snapshot.thread.kind === "loaded")
        return TRANSCRIPT_COPY.lockedRestoring;
    switch (snapshot.thread.kind) {
        case "restoring":
            return TRANSCRIPT_COPY.lockedRestoring;
        case "unavailable":
        case "read_failed":
            return TRANSCRIPT_COPY.lockedReadOnly;
        default:
            return undefined;
    }
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
                // A draft belongs to one conversation of one (org, principal): every selection
                // change and every partition clear bumps `selection`, and a new key drops the
                // draft, so it is never sent into another conversation or org (codex r2 on #1648).
                key={`composer-${String(live.snapshot.selection)}`}
                inFlight={live.snapshot.inFlight}
                ready={live.snapshot.ready}
                locked={lockedReason(live)}
                onSubmit={(question) =>
                    live.store.submit(question, { pageHints: pageHintsOf(refs) })
                }
                // An observed run (a restored turn still running) has no Stop in this tab yet.
                onCancel={live.snapshot.stoppable ? () => live.store.cancel() : undefined}
            />
        </div>
    );
}

/** Whether a composer is drawn (the panel pins it under the transcript only then). */
export function useHasComposer(): boolean {
    return useAskDevConversation() !== null;
}

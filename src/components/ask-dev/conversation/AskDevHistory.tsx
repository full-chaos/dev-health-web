"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { CTA_LABELS } from "@/lib/design/cta";

import { useAskDevConversation, type AskDevConversation } from "./AskDevConversationContext";
import type { ThreadSummaryView } from "./transport";

/**
 * The history of the signed-in (org, principal)'s conversations (CHAOS-11956, E6 design v5 §4.3).
 * The panel and the full page draw this one list from the one store, so a delete in one is gone in
 * the other. A row is titled by its first question when ACR serves one (CHAOS-12238): inert text,
 * one line, the full text on hover or focus, then the date and the question count. With none (a
 * legacy turn, or ACR's switch off) or only blanks, the row keeps its date-and-count name: a row is
 * never blank. The question is never logged and never reported.
 */
export const HISTORY_COPY = {
    title: "Conversations",
    loading: "Loading conversations…",
    empty: "No conversations yet.",
    readFailed: "History could not be read.",
    moreFailed: "More conversations could not be loaded.",
    current: "Current",
    confirm: "Delete this conversation? This cannot be undone.",
    /** Delete is not Stop (E6 design v5 §4.3): ACR keeps a running question going. */
    confirmRunning: "This does not stop the running question.",
    deleteFailed: "This conversation was not deleted. Try again.",
} as const;

const SECONDARY_BUTTON =
    "inline-flex items-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-50";

const ICON_BUTTON =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-50";

const LINK_BUTTON =
    "min-w-0 flex-1 rounded-(--radius-sm) px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)";

/** "<date> · <n> questions": when the conversation last moved, and how many questions it holds. */
export function historyRowMeta(row: ThreadSummaryView): string {
    const when = new Date(row.lastTurnAt);
    const date = Number.isNaN(when.getTime())
        ? row.lastTurnAt
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
              when,
          );
    const count = `${String(row.turnCount)} ${row.turnCount === 1 ? "question" : "questions"}`;
    return `${date} · ${count}`;
}

/** "Conversation of <date> · <n> questions": the name of a row with no first question. */
export function historyRowLabel(row: ThreadSummaryView): string {
    return `Conversation of ${historyRowMeta(row)}`;
}

/** The row's title: its first question, or `null` when ACR served none or only blanks. */
export function historyRowTitle(row: ThreadSummaryView): string | null {
    return row.firstQuestion !== null && row.firstQuestion.trim() !== "" ? row.firstQuestion : null;
}

function HistoryRow({
    live,
    row,
    onSelect,
}: {
    live: AskDevConversation;
    row: ThreadSummaryView;
    onSelect: (threadId: string) => void;
}) {
    const { store, snapshot } = live;
    const [confirming, setConfirming] = useState(false);
    const current = row.threadId === snapshot.threadId;
    const deleting = snapshot.history.deleting.includes(row.threadId);
    const failed = snapshot.history.deleteFailed === row.threadId;
    const title = historyRowTitle(row);
    const currentMark = current ? (
        <span className="ml-2 text-xs font-semibold text-(--ink-muted)">
            {HISTORY_COPY.current}
        </span>
    ) : null;
    return (
        <li
            className="space-y-2 rounded-(--radius-sm) border border-(--card-stroke) p-2"
            data-testid="ask-dev-history-row"
            data-thread-id={row.threadId}
            data-current={current ? "true" : undefined}
        >
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    className={`group ${LINK_BUTTON}`}
                    data-testid="ask-dev-history-open"
                    aria-current={current ? "true" : undefined}
                    onClick={() => onSelect(row.threadId)}
                >
                    {title === null ? (
                        <>
                            {historyRowLabel(row)}
                            {currentMark}
                        </>
                    ) : (
                        <>
                            {/* Inert text, one line; the full question on hover or focus. */}
                            <span
                                className="block truncate group-hover:whitespace-normal group-hover:break-words group-focus-visible:whitespace-normal group-focus-visible:break-words"
                                data-testid="ask-dev-history-question"
                                title={title}
                            >
                                {title}
                            </span>
                            <span
                                className="block text-xs text-(--ink-muted)"
                                data-testid="ask-dev-history-meta"
                            >
                                {historyRowMeta(row)}
                                {currentMark}
                            </span>
                        </>
                    )}
                </button>
                {confirming ? null : (
                    <button
                        type="button"
                        className={ICON_BUTTON}
                        data-testid="ask-dev-history-delete"
                        aria-label={CTA_LABELS.askDevDeleteConversation}
                        title={CTA_LABELS.askDevDeleteConversation}
                        disabled={deleting}
                        onClick={() => setConfirming(true)}
                    >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}
            </div>
            {confirming ? (
                <div className="space-y-2 text-sm" data-testid="ask-dev-history-confirm">
                    <p className="text-foreground">{HISTORY_COPY.confirm}</p>
                    {current && snapshot.inFlight ? (
                        <p data-testid="ask-dev-history-confirm-running">
                            {HISTORY_COPY.confirmRunning}
                        </p>
                    ) : null}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            data-testid="ask-dev-history-confirm-delete"
                            onClick={() => {
                                setConfirming(false);
                                store.deleteThread(row.threadId);
                            }}
                        >
                            {CTA_LABELS.confirmDelete}
                        </button>
                        <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            data-testid="ask-dev-history-confirm-cancel"
                            onClick={() => setConfirming(false)}
                        >
                            {CTA_LABELS.cancel}
                        </button>
                    </div>
                </div>
            ) : null}
            {failed ? (
                <p className="text-sm" data-testid="ask-dev-history-delete-failed">
                    {HISTORY_COPY.deleteFailed}
                </p>
            ) : null}
        </li>
    );
}

/**
 * The history list. It reads the first page when it is shown and when the current conversation
 * changes (a new one appears once ACR admitted it). `onSelect` opens a row: the caller decides
 * where (the panel switches back to the conversation; `/dev` names it in its URL).
 */
export function AskDevHistory({ onSelect }: { onSelect: (threadId: string) => void }) {
    const live = useAskDevConversation();
    const store = live?.store;
    const threadId = live?.snapshot.threadId ?? null;
    const ready = live?.snapshot.ready ?? false;
    useEffect(() => {
        if (ready) store?.loadHistory();
    }, [store, ready, threadId]);
    if (!live) return null;
    const { history } = live.snapshot;
    return (
        <section className="space-y-3 text-sm text-(--ink-muted)" data-testid="ask-dev-history">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{HISTORY_COPY.title}</h3>
                <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    data-testid="ask-dev-history-new"
                    onClick={() => live.store.newConversation()}
                >
                    {CTA_LABELS.askDevNewConversation}
                </button>
            </div>
            {history.status === "read_failed" ? (
                <div className="space-y-2" data-testid="ask-dev-history-read-failed">
                    <p>{HISTORY_COPY.readFailed}</p>
                    <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        data-testid="ask-dev-history-retry"
                        onClick={() => live.store.loadHistory()}
                    >
                        {CTA_LABELS.tryAgain}
                    </button>
                </div>
            ) : null}
            {history.threads.length === 0 ? (
                history.status === "loading" || history.status === "idle" ? (
                    <p data-testid="ask-dev-history-loading">{HISTORY_COPY.loading}</p>
                ) : history.status === "ready" ? (
                    <p data-testid="ask-dev-history-empty">{HISTORY_COPY.empty}</p>
                ) : null
            ) : (
                <ul className="space-y-2" data-testid="ask-dev-history-list">
                    {history.threads.map((row) => (
                        <HistoryRow key={row.threadId} live={live} row={row} onSelect={onSelect} />
                    ))}
                </ul>
            )}
            {history.moreFailed ? <p>{HISTORY_COPY.moreFailed}</p> : null}
            {history.nextCursor !== null ? (
                <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    data-testid="ask-dev-history-more"
                    disabled={history.loadingMore}
                    onClick={() => live.store.loadMoreHistory()}
                >
                    {CTA_LABELS.askDevShowMoreConversations}
                </button>
            ) : null}
        </section>
    );
}

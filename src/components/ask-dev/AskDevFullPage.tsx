"use client";

import { Suspense, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Minimize2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { ASK_DEV_FULL_PAGE_PATH, isAskDevEnabled } from "@/lib/ask-dev/surface";
import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevComposerSlot, AskDevTranscript, useHasComposer } from "./AskDevConversationView";
import { useAskDevShell } from "./AskDevShellContext";
import { useAskDevConversation } from "./conversation/AskDevConversationContext";
import { AskDevHistory } from "./conversation/AskDevHistory";

export const FULL_PAGE_COPY = {
    title: "Ask Dev",
    conversation: "Conversation",
    subtitle: "The same conversation as the panel, with room for wide answers.",
    notAvailable: "Ask Dev is not available for this organization.",
} as const;

/** `/dev?thread=<id>`: the conversation the full page names (E6 design v5 §4.1). */
export function fullPageThreadPath(threadId: string | null): string {
    return threadId === null
        ? ASK_DEV_FULL_PAGE_PATH
        : `${ASK_DEV_FULL_PAGE_PATH}?thread=${encodeURIComponent(threadId)}`;
}

/**
 * Keeps `/dev?thread=` and the store's selection in step (E6 design v5 §4.1):
 *
 * - A URL that names a thread (a load, back, forward) selects it, once the partition is known.
 *   Selecting the thread already shown is a no-op in the store.
 * - Only a local selection (a history row, a new conversation, the first submit, a delete) writes
 *   the URL: an incoming selection never writes it, so back and forward are not undone.
 * - Bare `/dev` (Expand pushes it) keeps the store's conversation and names it in the URL.
 */
function ThreadUrlSync() {
    const live = useAskDevConversation();
    const router = useRouter();
    const urlThread = useSearchParams().get("thread");
    // The URL value already handled: only a CHANGE of it is an incoming selection.
    const handled = useRef<string | null | undefined>(undefined);
    const store = live?.store;
    const ready = live?.snapshot.ready ?? false;
    const threadId = live?.snapshot.threadId ?? null;
    const source = live?.snapshot.selectionSource;
    const selection = live?.snapshot.selection;

    useEffect(() => {
        if (store === undefined || !ready || handled.current === urlThread) return;
        handled.current = urlThread;
        if (urlThread !== null) store.selectThread(urlThread, "incoming");
    }, [store, ready, urlThread]);

    useEffect(() => {
        if (store === undefined || !ready) return;
        // The store's selection NOW, not this render's: the incoming effect above may just have
        // selected the URL's thread (back, forward), and writing the old one would undo it.
        const current = store.getSnapshot();
        const local = current.selectionSource === "local" && current.threadId !== urlThread;
        const bare =
            current.selectionSource !== "local" && urlThread === null && current.threadId !== null;
        if (!local && !bare) return;
        handled.current = current.threadId;
        const target = fullPageThreadPath(current.threadId);
        // Moving between two conversations is a step back can undo; anything else replaces.
        if (local && urlThread !== null && current.threadId !== null) router.push(target);
        else router.replace(target);
    }, [store, ready, threadId, source, selection, urlThread, router]);
    return null;
}

/**
 * The history on the full page: a side column from `lg` up, a disclosure below it (E6 design v5
 * §4.3). A row selects its conversation locally, so the URL names it.
 */
function FullPageHistory() {
    const live = useAskDevConversation();
    const wide = useSyncExternalStore(subscribeWide, readWide, () => true);
    if (!live) return null;
    const select = (threadId: string) => live.store.selectThread(threadId, "local");
    // One list at a time: two would each read the first page.
    return wide ? (
        <aside data-testid="ask-dev-page-history">
            <AskDevHistory onSelect={select} />
        </aside>
    ) : (
        <details data-testid="ask-dev-page-history-disclosure">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
                {CTA_LABELS.askDevHistory}
            </summary>
            <div className="pt-3">
                <AskDevHistory onSelect={select} />
            </div>
        </details>
    );
}

/** The `lg` breakpoint: from here up the history is a side column. */
const WIDE_QUERY = "(min-width: 1024px)";

function subscribeWide(onChange: () => void): () => void {
    const query = window.matchMedia?.(WIDE_QUERY);
    query?.addEventListener("change", onChange);
    return () => query?.removeEventListener("change", onChange);
}
const readWide = (): boolean => window.matchMedia?.(WIDE_QUERY).matches ?? true;

/**
 * The full page `/dev` (CHAOS-11934). The transcript and the composer are the panel's own (one
 * store above both), so Expand and Minimize move the view, never the run: no request is sent again.
 * Without both Ask Dev entitlements it says so and draws no conversation.
 */
export function AskDevFullPage() {
    const { features } = useAdminTier();
    const { minimize } = useAskDevShell();
    const enabled = isAskDevEnabled(features);
    // No transport (T14, CHAOS-12104, not wired): no composer, and nothing is sent.
    const hasComposer = useHasComposer();
    const conversationId = useId();

    return (
        <div
            className="flex min-w-0 flex-1 flex-col gap-6 text-foreground"
            data-testid="ask-dev-page"
        >
            <PageHeader
                title={FULL_PAGE_COPY.title}
                subtitle={enabled ? FULL_PAGE_COPY.subtitle : undefined}
                actions={
                    enabled ? (
                        <button
                            type="button"
                            onClick={minimize}
                            data-testid="ask-dev-minimize"
                            className="inline-flex items-center gap-2 rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                        >
                            <Minimize2 aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.askDevMinimize}
                        </button>
                    ) : null
                }
            />
            {enabled ? (
                <section
                    aria-labelledby={conversationId}
                    data-testid="ask-dev-page-conversation"
                    className={`mx-auto flex w-full flex-1 flex-col gap-6 ${hasComposer ? "max-w-4xl lg:max-w-6xl" : "max-w-4xl"}`}
                >
                    {/* The panel's title is the h2 its answers' h3 parts sit under; here this is. */}
                    <h2 id={conversationId} className="sr-only">
                        {FULL_PAGE_COPY.conversation}
                    </h2>
                    {hasComposer ? (
                        <Suspense fallback={null}>
                            <ThreadUrlSync />
                        </Suspense>
                    ) : null}
                    <div
                        className={
                            hasComposer
                                ? "flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]"
                                : "flex flex-1 flex-col gap-6"
                        }
                    >
                        {hasComposer ? <FullPageHistory /> : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-6">
                            <AskDevTranscript />
                            {hasComposer ? (
                                <div className="sticky bottom-0 border-t border-(--card-stroke) bg-(--surface) py-4">
                                    <AskDevComposerSlot />
                                </div>
                            ) : null}
                        </div>
                    </div>
                </section>
            ) : (
                <p className="text-sm text-(--ink-muted)" data-testid="ask-dev-page-not-available">
                    {FULL_PAGE_COPY.notAvailable}
                </p>
            )}
        </div>
    );
}

"use client";

import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { AskDevChat } from "@full-chaos/ask-dev/render";
import "@full-chaos/ask-dev/ask-dev.css";
import { Minimize2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/shell/PageHeader";
import { Notice } from "@/components/ui/Notice";
import { ASK_DEV_FULL_PAGE_PATH } from "@/lib/ask-dev/surface";
import { CTA_LABELS } from "@/lib/design/cta";

import { useAskDevShell } from "./AskDevShellContext";
import { useAskDevChatSource } from "./conversation/chatSource";
import { useAskDevConversation } from "./conversation/AskDevConversationContext";
import { useAskDevAvailability } from "./useAskDevAvailability";

export const FULL_PAGE_COPY = {
    title: "Ask Dev",
    subtitle: "The same conversation as the panel, with room for wide answers.",
    notAvailable: "Ask Dev is not available for this organization.",
    impersonatingTitle: "Ask Dev is not available while impersonating",
    impersonatingText: "Stop impersonating to use Ask Dev.",
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
 * The render scrolls inside itself, so it needs a definite height: all the viewport has left from
 * this element down. The top is measured, not assumed, because a banner, the mobile bar and a page
 * header that wraps all move it. `100dvh` then follows the viewport by itself. `AppShell` pads
 * `<main>` with `pb-20`, and the frame's `-mb-20` takes that back, so nothing scrolls the window.
 * The frame also clips: the `sr-only` text of a long answer is out of flow, and would otherwise
 * stretch the document below the transcript that scrolls.
 */
function useHeightLeft() {
    const frame = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = frame.current;
        if (element === null) return;
        const measure = () => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            element.style.height = `calc(100dvh - ${String(top)}px)`;
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        return () => observer.disconnect();
    }, []);
    return frame;
}

/** Ask-dev's own render over web's store. Nothing of the conversation is drawn on this side. */
function AskDevConversationFrame() {
    const source = useAskDevChatSource();
    const frame = useHeightLeft();
    return (
        <div
            ref={frame}
            data-testid="ask-dev-page-conversation"
            className="-mb-20 flex min-h-0 min-w-0 overflow-hidden"
        >
            <Suspense fallback={null}>
                <ThreadUrlSync />
            </Suspense>
            {source === null ? null : <AskDevChat source={source} />}
        </div>
    );
}

/**
 * The full page `/dev` (CHAOS-11934): web's frame around ask-dev's own render (CHAOS-12383). One
 * store sits above it and the panel, so Expand and Minimize move the view, never the run: no
 * request is sent again. Without both Ask Dev entitlements it says so and draws no conversation.
 * While impersonating with the browser ACR client on (CHAOS-12306) it draws a notice instead, and
 * while that client waits for the first session read it draws neither.
 */
export function AskDevFullPage() {
    const availability = useAskDevAvailability();
    const { minimize } = useAskDevShell();
    const enabled = availability === "on";

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
                <AskDevConversationFrame />
            ) : availability === "impersonating" ? (
                <Notice
                    title={FULL_PAGE_COPY.impersonatingTitle}
                    titleAs="h2"
                    data-testid="ask-dev-page-impersonating"
                >
                    {FULL_PAGE_COPY.impersonatingText}
                </Notice>
            ) : availability === "off" ? (
                <p className="text-sm text-(--ink-muted)" data-testid="ask-dev-page-not-available">
                    {FULL_PAGE_COPY.notAvailable}
                </p>
            ) : null}
        </div>
    );
}

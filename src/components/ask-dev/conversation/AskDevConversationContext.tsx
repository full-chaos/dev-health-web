"use client";

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";

import { clearAcrTokensInAllTabs } from "@/lib/ask-dev/acr-auth";
import { browserAcrClientConfig } from "@/lib/ask-dev/acr-browser-config";
import { ASK_DEV_FULL_PAGE_PATH } from "@/lib/ask-dev/surface";

import { ConversationStore, THREAD_HINT_KEY, type ConversationSnapshot } from "./conversationStore";
import { FeedbackStore } from "./feedbackStore";
import { partitionTag } from "./keys";
import { testModeTransport } from "./testModeTransport";
import { acrBrowserTransport } from "@/lib/ask-dev/acr-transport";

import type { AskDevTransport } from "./transport";

const noSubscription = () => () => undefined;
const noSnapshot = () => null;

/**
 * The conversation store of this tab, above the panel: closing or minimizing the panel keeps the
 * conversation and its run (plan §2.5; zero new POST). `null` when there is no transport (T14,
 * CHAOS-12104, is not wired yet): the panel then draws no composer and sends nothing.
 */
const ConversationContext = createContext<ConversationStore | null>(null);

/**
 * The answer feedback of this tab (CHAOS-11958), beside the conversation store and bound to the same
 * (org, principal): both surfaces show one state per result. `null` when there is no transport.
 */
const FeedbackContext = createContext<FeedbackStore | null>(null);

/**
 * The session's (org, principal) key, as `partitionKey` reads it this render: the feedback controls
 * show an entry only when the feedback store is bound to it (codex r1 on #1658).
 */
const SessionPartitionContext = createContext<string | null | undefined>(undefined);

/**
 * CHAOS-11934 (plan §2.5): conversations live in this tab's memory until Phase 4 (E6) stores them,
 * so a reload loses one. This session-storage marker lets the reloaded tab say so: it holds a tag
 * of the (org, principal) whose conversation had a turn, never a question, an answer or an id.
 */
export const UNSAVED_CONVERSATION_KEY = "ask-dev:unsaved-conversation";

/** True when this tab lost a conversation of this (org, principal) to a reload. */
const NotSavedContext = createContext(false);

export { partitionTag };

function readMarker(): string | null {
    try {
        return window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY);
    } catch {
        return null;
    }
}

function readHintPresent(): boolean {
    try {
        return window.sessionStorage.getItem(THREAD_HINT_KEY) !== null;
    } catch {
        return false;
    }
}

/**
 * The full page names a conversation in its URL (`/dev?thread=`): the URL wins over the restore
 * hint there (E6 design v5 §4.1), so the provider leaves the selection to the page.
 */
function urlNamesThread(): boolean {
    return (
        window.location.pathname === ASK_DEV_FULL_PAGE_PATH &&
        new URLSearchParams(window.location.search).get("thread") !== null
    );
}

function writeMarker(tag: string): void {
    try {
        window.sessionStorage.setItem(UNSAVED_CONVERSATION_KEY, tag);
    } catch {
        // No storage (a private window, blocked site data): a reload then shows no notice.
    }
}

type SessionStatus = ReturnType<typeof useSession>["status"];

/**
 * The (org, principal) a conversation belongs to: the effective org, the signed-in user and, while
 * impersonating, the impersonated user. `null` when signed out; `undefined` while the session is
 * loading (a refetch is not a sign-out, so it changes nothing).
 */
export function partitionKey(
    session: Session | null,
    status: SessionStatus,
): string | null | undefined {
    if (status === "loading") return undefined;
    const user = session?.user;
    if (status !== "authenticated" || !user?.id || !user.org_id) return null;
    const impersonated = user.is_impersonating ? (user.impersonated_user_id ?? "unknown") : "";
    return [user.org_id, user.id, impersonated].join("\u0000");
}

export function AskDevConversationProvider({
    children,
    transport,
}: {
    children: ReactNode;
    /** For tests; the product uses the live transport, or the test-mode one in test mode. */
    transport?: AskDevTransport | null;
}) {
    // The context value is fixed from the first render on. A value that changed right after
    // hydration would reach every Suspense boundary still hydrating under the shell, switch it to
    // client rendering and drop a click made in that window (the launcher, CI on #1632). Only the
    // consuming hook below differs between server and client.
    const [{ store, feedback }] = useState(() => {
        const chosen =
            transport === undefined ? (acrBrowserTransport() ?? testModeTransport()) : transport;
        // CHAOS-12306: an org switch, an impersonation start or end, or a sign-out clears every
        // tab's ACR tokens. c4's binding (user id, org id) does not see an impersonation of a
        // user of the same org. Only with the browser ACR client on: off, nothing changes.
        const acrClient = browserAcrClientConfig() !== undefined;
        return chosen === null
            ? { store: null, feedback: null }
            : {
                  store: new ConversationStore({
                      transport: chosen,
                      ...(acrClient ? { onPartitionChanged: () => clearAcrTokensInAllTabs() } : {}),
                  }),
                  feedback: new FeedbackStore({ transport: chosen }),
              };
    });
    const { data: session, status } = useSession();
    const partition = partitionKey(session, status);
    const impersonating = session?.user?.is_impersonating === true;
    const bound = useRef(false);

    useEffect(() => {
        if (store === null || partition === undefined) return;
        store.setPartition(partition);
        // A page that loads while impersonating binds once with no change, so the store's hook does
        // not run: an impersonating session holds no ACR token, so clear here (codex r1 on #1680).
        // Later changes are the store's hook. Only with the browser ACR client on.
        if (!bound.current) {
            bound.current = true;
            if (impersonating && browserAcrClientConfig() !== undefined) clearAcrTokensInAllTabs();
        }
        // The same key, in the same step: feedback of another (org, principal) is never shown.
        feedback?.setPartition(partition);
        // CHAOS-11956: with the partition known, a reload restores this tab's conversation from
        // its hint (never before: the hint names its partition, and ACR authorizes the read).
        if (!urlNamesThread()) store.restoreFromHint();
    }, [store, feedback, partition, impersonating]);
    // Leaving the shell (sign-out, another route group) ends the run with it.
    useEffect(() => () => store?.clear("unmounted"), [store]);
    useEffect(() => () => feedback?.reset(), [feedback]);

    // The marker as this page load found it (the server and hydration render none). Read once: a
    // marker this tab writes later is for the next reload, not this one.
    const [markerAtLoad] = useState(() => (typeof window === "undefined" ? null : readMarker()));
    // A restore hint at load means the conversation was saved: no "not saved" notice then.
    const [hintAtLoad] = useState(() =>
        typeof window === "undefined" ? false : readHintPresent(),
    );
    const loadedMarker = useSyncExternalStore(
        noSubscription,
        () => markerAtLoad,
        () => null,
    );
    const snapshot = useSyncExternalStore(
        store?.subscribe ?? noSubscription,
        store?.getSnapshot ?? noSnapshot,
        noSnapshot,
    );
    const turns = snapshot?.turns.length ?? 0;
    // The partition these turns belong to, from the same snapshot: on an org switch the session is
    // already the new one while the store still holds the old one's turns (codex r1 on #1642).
    const owner = snapshot?.partition ?? null;
    const ownerTag = owner === null ? null : partitionTag(owner);
    useEffect(() => {
        if (ownerTag !== null && turns > 0) writeMarker(ownerTag);
    }, [ownerTag, turns]);
    // The notice is for the signed-in (org, principal): its marker, and no conversation now.
    const tag = typeof partition === "string" ? partitionTag(partition) : null;
    const notSaved =
        store !== null &&
        tag !== null &&
        turns === 0 &&
        loadedMarker === tag &&
        !hintAtLoad &&
        snapshot?.thread.kind === "new";

    return (
        <ConversationContext.Provider value={store}>
            <FeedbackContext.Provider value={feedback}>
                <SessionPartitionContext.Provider value={partition}>
                    <NotSavedContext.Provider value={notSaved}>{children}</NotSavedContext.Provider>
                </SessionPartitionContext.Provider>
            </FeedbackContext.Provider>
        </ConversationContext.Provider>
    );
}

/**
 * True when this tab had a conversation of the signed-in (org, principal) before a reload, and has
 * none now: the conversation was not saved (Phase 4 adds history).
 */
export function useAskDevNotSaved(): boolean {
    return useContext(NotSavedContext);
}

export type AskDevConversation = {
    readonly store: ConversationStore;
    readonly snapshot: ConversationSnapshot;
};

/** The store and its current snapshot, or `null` when there is no transport. */
export function useAskDevConversation(): AskDevConversation | null {
    const store = useContext(ConversationContext);
    const snapshot = useSyncExternalStore(
        store?.subscribe ?? noSubscription,
        store?.getSnapshot ?? noSnapshot,
        // The server renders no conversation, and hydration renders exactly that; the consumer
        // takes the store right after, so no tree is regenerated (codex r1 on #1632).
        noSnapshot,
    );
    return store === null || snapshot === null ? null : { store, snapshot };
}

/** The feedback store of this tab, or `null` when there is no transport (CHAOS-11958). */
export function useAskDevFeedbackStore(): FeedbackStore | null {
    return useContext(FeedbackContext);
}

/** The session's (org, principal) key this render; `undefined` while the session loads. */
export function useAskDevSessionPartition(): string | null | undefined {
    return useContext(SessionPartitionContext);
}

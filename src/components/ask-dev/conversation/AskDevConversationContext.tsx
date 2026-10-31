"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import type { Session } from "next-auth";
import { useSession } from "next-auth/react";

import { ConversationStore, type ConversationSnapshot } from "./conversationStore";
import { testModeTransport } from "./testModeTransport";
import { ACR_BROWSER_TRANSPORT, type AskDevTransport } from "./transport";

const noSubscription = () => () => undefined;
const noSnapshot = () => null;

/**
 * The conversation store of this tab, above the panel: closing or minimizing the panel keeps the
 * conversation and its run (plan §2.5; zero new POST). `null` when there is no transport (T14,
 * CHAOS-12104, is not wired yet): the panel then draws no composer and sends nothing.
 */
const ConversationContext = createContext<ConversationStore | null>(null);

/**
 * CHAOS-11934 (plan §2.5): conversations live in this tab's memory until Phase 4 (E6) stores them,
 * so a reload loses one. This session-storage marker lets the reloaded tab say so: it holds a tag
 * of the (org, principal) whose conversation had a turn, never a question, an answer or an id.
 */
export const UNSAVED_CONVERSATION_KEY = "ask-dev:unsaved-conversation";

/** True when this tab lost a conversation of this (org, principal) to a reload. */
const NotSavedContext = createContext(false);

/** A short, stable tag of a partition key (FNV-1a, 32 bits): it names no org or user. */
export function partitionTag(key: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < key.length; index++) {
        hash ^= key.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

function readMarker(): string | null {
    try {
        return window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY);
    } catch {
        return null;
    }
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
    const [store] = useState(() => {
        const chosen =
            transport === undefined ? (ACR_BROWSER_TRANSPORT ?? testModeTransport()) : transport;
        return chosen === null ? null : new ConversationStore({ transport: chosen });
    });
    const { data: session, status } = useSession();
    const partition = partitionKey(session, status);

    useEffect(() => {
        if (store !== null && partition !== undefined) store.setPartition(partition);
    }, [store, partition]);
    // Leaving the shell (sign-out, another route group) ends the run with it.
    useEffect(() => () => store?.clear("unmounted"), [store]);

    // The marker as this page load found it (the server and hydration render none). Read once: a
    // marker this tab writes later is for the next reload, not this one.
    const [markerAtLoad] = useState(() => (typeof window === "undefined" ? null : readMarker()));
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
    const notSaved = store !== null && tag !== null && turns === 0 && loadedMarker === tag;

    return (
        <ConversationContext.Provider value={store}>
            <NotSavedContext.Provider value={notSaved}>{children}</NotSavedContext.Provider>
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

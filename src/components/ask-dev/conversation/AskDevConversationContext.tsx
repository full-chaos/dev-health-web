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

    return <ConversationContext.Provider value={store}>{children}</ConversationContext.Provider>;
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

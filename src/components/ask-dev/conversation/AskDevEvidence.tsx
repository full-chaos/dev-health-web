"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
    ChatEvidenceBody,
    type ChatEvidenceDetail,
    type ChatEvidenceRef,
    type ChatEvidenceSource,
    type ChatEvidenceState,
} from "@full-chaos/ask-dev/render";

import { useEvidenceDrawerIfMounted } from "@/components/evidence/EvidenceDrawerProvider";

import { useAskDevShell } from "../AskDevShellContext";
import {
    authorizationFailureOf,
    noRepositoryInScope,
    type ConversationStore,
} from "./conversationStore";
import { TransportRefusal, type EvidenceView } from "./transport";

const detailOf = (view: EvidenceView): ChatEvidenceDetail => ({
    refId: view.refId,
    citation: view.citation,
    observedAt: view.observedAt,
    structuredFields: view.structuredFields,
    ...(view.excerpt === undefined ? {} : { excerpt: view.excerpt }),
});

/**
 * What one read answered. `availability` is an open vocabulary with no served label: it selects a
 * state and never prints. A value with no state of its own shows what ACR served. ACR answers
 * `deleted` and `unauthorized` as its 404, so they read as that 404 if they ever arrive here.
 */
export function evidenceStateOf(view: EvidenceView | null): ChatEvidenceState {
    if (view === null) return { kind: "not_found" };
    switch (view.availability) {
        case "deleted":
        case "unauthorized":
            return { kind: "not_found" };
        case "stale":
            return { kind: "stale", detail: detailOf(view) };
        case "redacted":
            return {
                kind: "redacted",
                detail: detailOf(view),
                ...(view.redactionReason === undefined ? {} : { reason: view.redactionReason }),
            };
        default:
            return { kind: "ready", detail: detailOf(view) };
    }
}

export type EvidenceAnswer = {
    readonly state: ChatEvidenceState;
    /** "Try again" is offered: only `unavailable` draws it. A click reads, and authorizes, once. */
    readonly retry: boolean;
};

const UNAVAILABLE: ChatEvidenceState = { kind: "unavailable" };

/** What a read that threw means. ACR's own `retryable` says whether another read can help. */
export function evidenceFailureOf(error: unknown): EvidenceAnswer {
    const access = authorizationFailureOf(error);
    if (access === "impersonating" || access === "not_entitled") {
        return { state: { kind: "denied" }, retry: false };
    }
    // On its way to the normal sign-in: nothing to try here.
    if (access === "session_ended") return { state: UNAVAILABLE, retry: false };
    if (access !== undefined) return { state: UNAVAILABLE, retry: true };
    if (noRepositoryInScope(error)) return { state: { kind: "no_repository" }, retry: false };
    if (error instanceof TransportRefusal) {
        if (error.status === 403) return { state: { kind: "denied" }, retry: false };
        return { state: UNAVAILABLE, retry: error.error.error.retryable };
    }
    return { state: UNAVAILABLE, retry: true };
}

export type AskDevEvidenceProps = {
    readonly store: ConversationStore;
    readonly evidence: ChatEvidenceRef;
    /** The store's generation at the open: an org switch makes this subject another org's. */
    readonly generation: number;
    readonly onOrganizationChanged: () => void;
};

/**
 * The drawer's body for one evidence reference (CHAOS-12105): web reads, with its own credential,
 * and ask-dev's `ChatEvidenceBody` draws the state. It is mounted by the open, so a click is one
 * read. Closing the drawer aborts the read.
 */
export function AskDevEvidence({
    store,
    evidence,
    generation,
    onOrganizationChanged,
}: AskDevEvidenceProps) {
    const current = useSyncExternalStore(
        store.subscribe,
        () => store.getSnapshot().generation,
        () => generation,
    );
    const stale = current !== generation;
    const [attempt, setAttempt] = useState(0);
    const [answer, setAnswer] = useState<(EvidenceAnswer & { attempt: number }) | null>(null);
    useEffect(() => {
        if (stale) {
            onOrganizationChanged();
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        store.readEvidence({ refId: evidence.refId, resultId: evidence.resultId, signal }).then(
            (view) => setAnswer({ attempt, state: evidenceStateOf(view), retry: false }),
            (error: unknown) => {
                // Its own abort is no failure: StrictMode's first read ends so, and the second runs.
                if (!signal.aborted) setAnswer({ attempt, ...evidenceFailureOf(error) });
            },
        );
        return () => controller.abort();
    }, [store, evidence, attempt, stale, onOrganizationChanged]);
    const again = useCallback(() => setAttempt((value) => value + 1), []);
    // Another org's evidence never stays on screen, not for one paint.
    if (stale) return null;
    const shown = answer?.attempt === attempt ? answer : null;
    return (
        <ChatEvidenceBody
            state={shown?.state ?? { kind: "loading" }}
            onRetry={shown?.retry === true ? again : undefined}
        />
    );
}

/**
 * Opens one reference in the app's one evidence drawer. One right drawer at a time, so the drawer
 * takes the edge from the panel. The conversation stays in the store, and closing the drawer brings
 * the panel back. A peer drawer that takes the edge keeps it.
 */
export function useAskDevEvidenceOpener(
    store: ConversationStore | undefined,
): ChatEvidenceSource["open"] {
    const drawer = useEvidenceDrawerIfMounted();
    const { open: panelOpen, setOpen } = useAskDevShell();
    return useCallback(
        (evidence: ChatEvidenceRef) => {
            if (store === undefined || drawer === null) return;
            let organizationChanged = false;
            drawer.open({
                title: evidence.label,
                content: (
                    <AskDevEvidence
                        store={store}
                        evidence={evidence}
                        generation={store.getSnapshot().generation}
                        onOrganizationChanged={() => {
                            organizationChanged = true;
                            drawer.close();
                        }}
                    />
                ),
                ...(panelOpen
                    ? {
                          onDismiss: () => {
                              if (!organizationChanged) setOpen(true);
                          },
                      }
                    : {}),
            });
        },
        [drawer, store, panelOpen, setOpen],
    );
}

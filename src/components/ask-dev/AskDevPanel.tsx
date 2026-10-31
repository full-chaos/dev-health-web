"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { Drawer } from "@/components/ui/Drawer";
import { CTA_LABELS } from "@/lib/design/cta";
import { isAskDevEnabled, isAskDevExcludedPath } from "@/lib/ask-dev/surface";

import { AskDevTurn, turnKey } from "./answer/AskDevTurn";
import { useTestModeTurns, type TestModeTurns } from "./answer/testModeAnswer";
import { ASK_DEV_PANEL_ID } from "./askDevPanelId";
import { useAskDevShell } from "./AskDevShellContext";
import { AskDevComposer } from "./conversation/AskDevComposer";
import {
    useAskDevConversation,
    type AskDevConversation,
} from "./conversation/AskDevConversationContext";
import { AskDevConversationTurn } from "./conversation/AskDevConversationTurn";
import { carryOfChoice } from "./conversation/conversationStore";

/** The `md` breakpoint, as the shell uses it: from here up the panel is a right region. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
    const query = window.matchMedia?.(DESKTOP_QUERY);
    query?.addEventListener("change", onChange);
    return () => query?.removeEventListener("change", onChange);
}
const readDesktop = (): boolean => window.matchMedia?.(DESKTOP_QUERY).matches ?? true;

const TITLE = "Ask Dev";

type Conversation = TestModeTurns;

const EMPTY_TRANSCRIPT = "Your conversation will appear here.";

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

/**
 * The store's conversation (CHAOS-11928): every turn in order, the empty state without any. Only the
 * last turn is live, and only while no run is in flight; every earlier turn is read-only, so an old
 * receipt cannot be sent.
 */
function ConversationTranscript({ live }: { live: AskDevConversation }) {
    const { store, snapshot } = live;
    const { turns } = snapshot;
    return (
        <TranscriptLog>
            {turns.length === 0 ? (
                <p>{EMPTY_TRANSCRIPT}</p>
            ) : (
                turns.map((turn, index) => {
                    const usable = index === turns.length - 1 && !snapshot.inFlight;
                    return (
                        <AskDevConversationTurn
                            key={`turn-${String(turn.id)}`}
                            turn={turn}
                            onConfirm={
                                usable
                                    ? (choice) => store.submit(turn.question, carryOfChoice(choice))
                                    : undefined
                            }
                            onReask={usable ? (reask) => store.submit(reask.question) : undefined}
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
function Transcript({ conversation }: { conversation: Conversation }) {
    const { turns, onConfirm, onReask } = conversation;
    return (
        <TranscriptLog>
            {turns.length === 0 ? (
                <p>{EMPTY_TRANSCRIPT}</p>
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

/**
 * The desktop panel: a non-modal region on the right. The page behind it stays usable, so there is
 * no backdrop, no scroll lock and no Tab trap. Focus moves into it when it opens; Escape and the
 * Close button close it and return focus to the launcher.
 */
function DesktopPanel({
    onClose,
    children,
    footer,
}: {
    onClose: () => void;
    children: ReactNode;
    /** The composer, pinned under the scrolling transcript. */
    footer: ReactNode;
}) {
    const titleId = useId();
    const panelRef = useRef<HTMLElement>(null);
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        panelRef.current?.focus();
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            // A modal dialog or drawer on top owns Escape.
            if (document.querySelector('[aria-modal="true"]')) return;
            event.preventDefault();
            closeRef.current();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    return (
        <aside
            id={ASK_DEV_PANEL_ID}
            ref={panelRef}
            tabIndex={-1}
            aria-labelledby={titleId}
            data-testid="ask-dev-panel"
            data-mode="panel"
            className="sticky top-0 flex h-dvh w-104 shrink-0 flex-col border-l border-(--border) bg-(--surface) focus:outline-none"
        >
            <div className="flex items-center gap-3 border-b border-(--card-stroke) px-5 py-4">
                <h2 id={titleId} className="min-w-0 flex-1 text-h3 font-semibold text-foreground">
                    {TITLE}
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={CTA_LABELS.close}
                    data-testid="ask-dev-panel-close"
                    className="inline-flex h-8.75 w-8.75 shrink-0 items-center justify-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer ? <div className="border-t border-(--card-stroke) p-4">{footer}</div> : null}
        </aside>
    );
}

/**
 * The Ask Dev surface. From `md` up it is the right region (`DesktopPanel`); below `md` it is a
 * full-height modal sheet: the shared `Drawer` gives it the focus trap, Escape, the backdrop, the
 * scroll lock and the focus return. It draws nothing when closed, when the organization has no
 * Ask Dev entitlement or on an excluded route. Mounting it sends no request.
 */
export function AskDevPanel() {
    const { open, close } = useAskDevShell();
    const { features } = useAdminTier();
    const pathname = usePathname() ?? "";
    const desktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => true);
    const testModeTurns = useTestModeTurns();
    const live = useAskDevConversation();

    if (!open || !isAskDevEnabled(features) || isAskDevExcludedPath(pathname)) return null;
    // No transport (T14, CHAOS-12104, not wired): no composer, and nothing is sent.
    const transcript = live ? (
        <ConversationTranscript live={live} />
    ) : (
        <Transcript conversation={testModeTurns} />
    );
    const composer = live ? (
        <AskDevComposer
            inFlight={live.snapshot.inFlight}
            ready={live.snapshot.ready}
            onSubmit={(question) => live.store.submit(question)}
            onCancel={() => live.store.cancel()}
        />
    ) : null;
    if (desktop) {
        return (
            <DesktopPanel onClose={close} footer={composer}>
                {transcript}
            </DesktopPanel>
        );
    }
    return (
        <Drawer
            open
            onCloseAction={close}
            title={TITLE}
            data-testid="ask-dev-sheet"
            panelId={ASK_DEV_PANEL_ID}
            // Ask Dev claims the right edge itself (`AskDevShellProvider`).
            claimsRightEdge={false}
        >
            <div className="space-y-6">
                {transcript}
                {composer}
            </div>
        </Drawer>
    );
}

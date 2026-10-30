"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
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

/**
 * The conversation. Streamed answers will be appended here; a screen reader hears each addition.
 * It renders the turns it is given in order (CHAOS-11930, CHAOS-3440), and the empty state without
 * any. Only the last turn is live; every earlier turn is read-only, so an old receipt cannot be
 * sent. The conversation store (CHAOS-11928) becomes the turn source; until then only test mode
 * supplies turns (`useTestModeTurns`).
 */
function Transcript({ conversation }: { conversation: Conversation }) {
    const { turns, onConfirm, onReask } = conversation;
    return (
        <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Conversation"
            data-testid="ask-dev-transcript"
            className="space-y-6 text-sm text-(--ink-muted)"
        >
            {turns.length === 0 ? (
                <p>Your conversation will appear here.</p>
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
        </div>
    );
}

/**
 * The desktop panel: a non-modal region on the right. The page behind it stays usable, so there is
 * no backdrop, no scroll lock and no Tab trap. Focus moves into it when it opens; Escape and the
 * Close button close it and return focus to the launcher.
 */
function DesktopPanel({
    onClose,
    conversation,
}: {
    onClose: () => void;
    conversation: Conversation;
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
            <div className="flex-1 overflow-y-auto p-5">
                <Transcript conversation={conversation} />
            </div>
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
    const conversation = useTestModeTurns();

    if (!open || !isAskDevEnabled(features) || isAskDevExcludedPath(pathname)) return null;
    if (desktop) return <DesktopPanel onClose={close} conversation={conversation} />;
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
            <Transcript conversation={conversation} />
        </Drawer>
    );
}

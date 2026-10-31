"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { Drawer } from "@/components/ui/Drawer";
import { CTA_LABELS } from "@/lib/design/cta";
import { isAskDevEnabled, isAskDevPanelPath } from "@/lib/ask-dev/surface";

import { ASK_DEV_PANEL_ID } from "./askDevPanelId";
import { AskDevComposerSlot, AskDevTranscript, useHasComposer } from "./AskDevConversationView";
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

/**
 * The desktop panel: a non-modal region on the right. The page behind it stays usable, so there is
 * no backdrop, no scroll lock and no Tab trap. Focus moves into it when it opens; Escape and the
 * Close button close it and return focus to the launcher.
 */
const ICON_BUTTON =
    "inline-flex h-8.75 w-8.75 shrink-0 items-center justify-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)";

/**
 * CHAOS-11934: opens the same conversation on the full page `/dev`. Only the route changes: the
 * store is above both, so a running investigation goes on and nothing is sent again.
 */
function ExpandButton({ withText = false }: { withText?: boolean }) {
    const { expand } = useAskDevShell();
    return (
        <button
            type="button"
            onClick={expand}
            aria-label={withText ? undefined : CTA_LABELS.askDevExpand}
            data-testid="ask-dev-expand"
            className={
                withText
                    ? "inline-flex items-center gap-2 rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                    : ICON_BUTTON
            }
        >
            <Maximize2 aria-hidden="true" className="h-4 w-4" />
            {withText ? CTA_LABELS.askDevExpand : null}
        </button>
    );
}

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
                <ExpandButton />
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={CTA_LABELS.close}
                    data-testid="ask-dev-panel-close"
                    className={ICON_BUTTON}
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
    const hasComposer = useHasComposer();

    if (!open || !isAskDevEnabled(features) || !isAskDevPanelPath(pathname)) return null;
    // No transport (T14, CHAOS-12104, not wired): no composer, and nothing is sent.
    const composer = hasComposer ? <AskDevComposerSlot /> : null;
    if (desktop) {
        return (
            <DesktopPanel onClose={close} footer={composer}>
                <AskDevTranscript />
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
            // The sheet header has only Close: the full page link sits in its action row.
            footer={<ExpandButton withText />}
        >
            <div className="space-y-6">
                <AskDevTranscript />
                {composer}
            </div>
        </Drawer>
    );
}

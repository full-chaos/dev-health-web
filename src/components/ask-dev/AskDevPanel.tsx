"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { Maximize2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { Drawer } from "@/components/ui/Drawer";
import { CTA_LABELS } from "@/lib/design/cta";
import { isAskDevPanelPath } from "@/lib/ask-dev/surface";
import { logger } from "@/lib/logger";

import { ASK_DEV_PANEL_ID } from "./askDevPanelId";
import type { AskDevRenderProps } from "./AskDevRender";
import { useAskDevShell } from "./AskDevShellContext";
import { useAskDevAvailability } from "./useAskDevAvailability";

/** The `md` breakpoint, as the shell uses it: from here up the panel is a right region. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
    const query = window.matchMedia?.(DESKTOP_QUERY);
    query?.addEventListener("change", onChange);
    return () => query?.removeEventListener("change", onChange);
}
const readDesktop = (): boolean => window.matchMedia?.(DESKTOP_QUERY).matches ?? true;

const TITLE = "Ask Dev";

export const RENDER_LOAD_COPY = {
    loading: "Loading Ask Dev…",
    failed: "Ask Dev could not load. Reload the page to try again.",
} as const;

/**
 * The render arrives after the panel on a first open, and its composer takes focus as it mounts.
 * Its arrival must not move focus: not from the panel, the sheet's Close, or wherever the viewer
 * went while it loaded.
 */
function keepFocus(focusBefore: Element | null) {
    if (focusBefore instanceof HTMLElement) focusBefore.focus();
}

function RenderLoading() {
    return (
        <p
            role="status"
            data-testid="ask-dev-render-loading"
            className="m-auto p-5 text-sm text-(--ink-muted)"
        >
            {RENDER_LOAD_COPY.loading}
        </p>
    );
}

function RenderFailed() {
    return (
        <p
            role="alert"
            data-testid="ask-dev-render-failed"
            className="m-auto p-5 text-sm text-foreground"
        >
            {RENDER_LOAD_COPY.failed}
        </p>
    );
}

/**
 * The render loads on the first open (CHAOS-12450), so a page that never opens the panel does not
 * pay for it. A chunk that fails to load (a deploy, a dropped network) says so in the panel: thrown,
 * it would reach the page's error boundary and take the page down with it.
 */
const AskDevRender = dynamic<AskDevRenderProps>(
    () =>
        import("./AskDevRender")
            .then((module) => module.AskDevRender)
            .catch((error: unknown) => {
                logger.warn({ err: error }, "ask dev render did not load");
                return RenderFailed;
            }),
    { ssr: false, loading: RenderLoading },
);

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

function DesktopPanel({ onClose }: { onClose: () => void }) {
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
            <div className="flex min-h-0 flex-1">
                <AskDevRender onMounted={keepFocus} />
            </div>
        </aside>
    );
}

/**
 * The Ask Dev surface. From `md` up it is the right region (`DesktopPanel`); below `md` it is a
 * full-height modal sheet: the shared `Drawer` gives it the focus trap, Escape, the backdrop, the
 * scroll lock and the focus return. It draws nothing when closed, when the organization has no
 * Ask Dev entitlement, while impersonating with the browser ACR client on (CHAOS-12306) or on an
 * excluded route. Mounting it sends no request.
 */
export function AskDevPanel() {
    const { open, close } = useAskDevShell();
    const availability = useAskDevAvailability();
    const pathname = usePathname() ?? "";
    const desktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => true);

    if (!open || availability !== "on" || !isAskDevPanelPath(pathname)) return null;
    if (desktop) return <DesktopPanel onClose={close} />;
    return (
        <Drawer
            open
            onCloseAction={close}
            title={TITLE}
            data-testid="ask-dev-sheet"
            panelId={ASK_DEV_PANEL_ID}
            // Ask Dev claims the right edge itself (`AskDevShellProvider`).
            claimsRightEdge={false}
            fillBody
            // The sheet header has only Close: the full page link sits in its action row.
            footer={<ExpandButton withText />}
        >
            <AskDevRender onMounted={keepFocus} />
        </Drawer>
    );
}

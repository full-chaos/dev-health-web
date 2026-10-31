"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { ASK_DEV_PANEL_ID } from "./askDevPanelId";
import { ASK_DEV_FULL_PAGE_PATH, isAskDevEnabled, isAskDevPanelPath } from "@/lib/ask-dev/surface";
import { useRightDrawerClaim } from "@/lib/shell/useRightDrawerClaim";

type AskDevShellValue = {
    /** The Ask Dev panel is open. Opening only changes this flag: it sends no request. */
    readonly open: boolean;
    /** Opens or closes the panel. Opening takes the right edge from any other right drawer. */
    readonly setOpen: (next: boolean) => void;
    /** Closes the panel and returns focus to the launcher that is visible. */
    readonly close: () => void;
    /**
     * CHAOS-11934: shows the same conversation on the full page `/dev`. Only the route changes: the
     * conversation store lives above both, so a running investigation goes on and nothing is sent.
     */
    readonly expand: () => void;
    /** Leaves `/dev` for the page the panel was expanded from, and opens the panel there. */
    readonly minimize: () => void;
};

/** Where Minimize goes when the full page was not opened from the panel (a link, a reload). */
export const MINIMIZE_FALLBACK_PATH = "/dashboard";

const AskDevShellContext = createContext<AskDevShellValue>({
    open: false,
    setOpen: () => undefined,
    close: () => undefined,
    expand: () => undefined,
    minimize: () => undefined,
});

/** The Ask Dev key: Cmd+J on macOS, Ctrl+J elsewhere (either works anywhere in the shell). */
export const isAskDevKey = (event: KeyboardEvent) =>
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "j";

/** A field that owns the keystroke: a text input, a select, a textarea or an editable region. */
function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        target.closest('[contenteditable]:not([contenteditable="false"])') !== null ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    );
}

/** The launcher of the bar that is shown at this breakpoint (the other bar is `display: none`). */
function visibleLauncher(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>("[data-ask-dev-launcher]");
    return Array.from(all).find((node) => node.getClientRects().length > 0) ?? null;
}

/** Holds the one open/closed state that the launcher and the panel share. */
export function AskDevShellProvider({ children }: { children: ReactNode }) {
    const [open, setOpenState] = useState(false);
    const pathname = usePathname() ?? "";
    const { features } = useAdminTier();

    // The panel is open only where Ask Dev is allowed. A client navigation to an excluded route, or
    // an entitlement that turns off, closes it for good: coming back does not reopen it by itself.
    // (Set during render, as the evidence drawer does: no effect, no extra paint.)
    const eligible = isAskDevEnabled(features) && isAskDevPanelPath(pathname);
    if (open && !eligible) setOpenState(false);

    // Another right drawer took the edge: close without moving focus (that drawer has it).
    const closeFromPeer = useCallback(() => setOpenState(false), []);

    // The panel holds the right edge exactly while it is open (CHAOS-12207). Held by an effect, as
    // the shared `Drawer` holds it: an effect that runs again (StrictMode under `next dev`, an open
    // that lands while the shell is still hydrating) claims it again, where an imperative claim in
    // `setOpen` was released by the mount effects' re-run and left the panel open with no claim.
    // Closing, an excluded route or a lost entitlement (both close it during render, above) and
    // leaving the shell release it.
    useRightDrawerClaim("ask-dev", open, closeFromPeer);

    const setOpen = useCallback((next: boolean) => setOpenState(next), []);
    const close = useCallback(() => {
        setOpen(false);
        // After the panel unmounts: its own focus is gone, the launcher is the way back.
        queueMicrotask(() => visibleLauncher()?.focus());
    }, [setOpen]);

    // Cmd/Ctrl+J toggles the panel, only where the launcher would be drawn (same gate). Not in a field,
    // and not while another modal owns the keyboard. The browser default (downloads, address bar) is
    // suppressed only when the shortcut acts.
    useEffect(() => {
        if (!eligible) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !isAskDevKey(event)) return;
            if (isEditableTarget(event.target)) return;
            // Another modal owns the keyboard. The Ask Dev sheet (below `md` the panel is a modal
            // `Drawer`) is not "another": the shortcut must be able to close it.
            const others = document.querySelectorAll(
                `[role="dialog"][aria-modal="true"]:not(#${ASK_DEV_PANEL_ID})`,
            );
            if (others.length > 0) return;
            event.preventDefault();
            if (open) close();
            else setOpen(true);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [eligible, open, close, setOpen]);

    const router = useRouter();
    // The page the panel was expanded from (path and query), for Minimize.
    const returnTo = useRef<string | null>(null);
    // Minimize asked for the panel; it opens once the route it went to allows it.
    const [openOnArrival, setOpenOnArrival] = useState(false);

    const expand = useCallback(() => {
        returnTo.current = `${window.location.pathname}${window.location.search}`;
        setOpen(false);
        router.push(ASK_DEV_FULL_PAGE_PATH);
    }, [router, setOpen]);

    const minimize = useCallback(() => {
        setOpenOnArrival(true);
        router.push(returnTo.current ?? MINIMIZE_FALLBACK_PATH);
    }, [router]);

    // Set during render, as the eligibility close above: no effect, no extra paint. The open panel
    // then holds the right edge through `useRightDrawerClaim` above (CHAOS-12207).
    if (openOnArrival && eligible) {
        setOpenOnArrival(false);
        setOpenState(true);
    }

    const value = useMemo(
        () => ({ open, setOpen, close, expand, minimize }),
        [open, setOpen, close, expand, minimize],
    );
    return <AskDevShellContext.Provider value={value}>{children}</AskDevShellContext.Provider>;
}

export function useAskDevShell(): AskDevShellValue {
    return useContext(AskDevShellContext);
}

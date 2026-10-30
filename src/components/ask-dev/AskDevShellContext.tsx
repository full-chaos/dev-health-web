"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { ASK_DEV_PANEL_ID } from "./askDevPanelId";
import { isAskDevEnabled, isAskDevExcludedPath } from "@/lib/ask-dev/surface";
import { claimRightDrawer, releaseRightDrawer } from "@/lib/shell/rightDrawer";

type AskDevShellValue = {
    /** The Ask Dev panel is open. Opening only changes this flag: it sends no request. */
    readonly open: boolean;
    /** Opens or closes the panel. Opening takes the right edge from any other right drawer. */
    readonly setOpen: (next: boolean) => void;
    /** Closes the panel and returns focus to the launcher that is visible. */
    readonly close: () => void;
};

const AskDevShellContext = createContext<AskDevShellValue>({
    open: false,
    setOpen: () => undefined,
    close: () => undefined,
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
    const eligible = isAskDevEnabled(features) && !isAskDevExcludedPath(pathname);
    if (open && !eligible) setOpenState(false);
    // ...and gives the right edge back (a claim must not outlive the panel it belongs to).
    useEffect(() => {
        if (!eligible) releaseRightDrawer("ask-dev");
    }, [eligible]);
    // Leaving the shell (sign-out, another route group) drops the claim and its stale callback.
    useEffect(() => () => releaseRightDrawer("ask-dev"), []);

    // Another right drawer took the edge: close without moving focus (that drawer has it).
    const closeFromPeer = useCallback(() => setOpenState(false), []);

    const setOpen = useCallback(
        (next: boolean) => {
            setOpenState(next);
            if (next) claimRightDrawer("ask-dev", closeFromPeer);
            else releaseRightDrawer("ask-dev");
        },
        [closeFromPeer],
    );
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

    const value = useMemo(() => ({ open, setOpen, close }), [open, setOpen, close]);
    return <AskDevShellContext.Provider value={value}>{children}</AskDevShellContext.Provider>;
}

export function useAskDevShell(): AskDevShellValue {
    return useContext(AskDevShellContext);
}

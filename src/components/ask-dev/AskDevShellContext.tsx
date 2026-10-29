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
    if (open && (!isAskDevEnabled(features) || isAskDevExcludedPath(pathname))) {
        setOpenState(false);
    }
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

    const value = useMemo(() => ({ open, setOpen, close }), [open, setOpen, close]);
    return <AskDevShellContext.Provider value={value}>{children}</AskDevShellContext.Provider>;
}

export function useAskDevShell(): AskDevShellValue {
    return useContext(AskDevShellContext);
}

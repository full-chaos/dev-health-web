"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type AskDevShellValue = {
    /** The Ask Dev panel is open. Opening only changes this flag: it sends no request. */
    readonly open: boolean;
    readonly setOpen: (next: boolean) => void;
};

const AskDevShellContext = createContext<AskDevShellValue>({
    open: false,
    setOpen: () => undefined,
});

/** Holds the one open/closed state that the launcher and the panel share. */
export function AskDevShellProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const value = useMemo(() => ({ open, setOpen }), [open]);
    return <AskDevShellContext.Provider value={value}>{children}</AskDevShellContext.Provider>;
}

export function useAskDevShell(): AskDevShellValue {
    return useContext(AskDevShellContext);
}

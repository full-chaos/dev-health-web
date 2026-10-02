"use client";

import { createContext, useContext, type ReactNode } from "react";

const ShellContext = createContext(false);

/** Marks the subtree as rendered inside the shared app shell. */
export function ShellProvider({ children }: { children: ReactNode }) {
    return <ShellContext.Provider value={true}>{children}</ShellContext.Provider>;
}

/**
 * True inside the shared app shell. Page-level navigation (`PrimaryNav`) reads
 * this and renders nothing, so a page in the shell cannot show a second
 * navigation.
 */
export function useInShell(): boolean {
    return useContext(ShellContext);
}

"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";

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

/** `undefined`: not loaded yet, or outside the shell. `null`: not known. */
type ShellOrganization = ActiveOrganizationData | null | undefined;

const ShellOrganizationContext = createContext<ShellOrganization>(undefined);

/** Shares the active organization the sidebar card loaded with the page. */
export function ShellOrganizationProvider({
    value,
    children,
}: {
    value: ShellOrganization;
    children: ReactNode;
}) {
    return (
        <ShellOrganizationContext.Provider value={value}>
            {children}
        </ShellOrganizationContext.Provider>
    );
}

/**
 * The active organization as the shell's organization card knows it, so a page
 * surface (the scope bar) does not ask for it a second time.
 */
export function useShellOrganization(): ShellOrganization {
    return useContext(ShellOrganizationContext);
}

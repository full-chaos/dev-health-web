"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";

/** `undefined`: not loaded yet, or outside the shell. `null`: not known. */
type ShellOrganization = ActiveOrganizationData | null | undefined;

const ShellOrganizationContext = createContext<ShellOrganization>(undefined);

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

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
 *
 * The server never knows it: the card loads it in the browser. A consumer can
 * hydrate after the answer is there (a streamed Suspense boundary on a slow
 * client), so the hydration render gets `undefined`, as the server render did.
 */
export function useShellOrganization(): ShellOrganization {
    const organization = useContext(ShellOrganizationContext);
    const hydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return hydrated ? organization : undefined;
}

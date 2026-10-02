"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";
import { CTA_LABELS } from "@/lib/design/cta";

import { ShellMobileBar } from "./ShellMobileBar";
import { ShellOrganizationProvider } from "./ShellContext";
import { ShellSidebar } from "./ShellSidebar";
import { shellStatusFromOrganization, type ShellStatus } from "./ShellStatusChip";
import { ShellTopBar } from "./ShellTopBar";

type AppShellProps = {
    /** Full-width banners (impersonation, trial). Always first, above the chrome. */
    banners?: ReactNode;
    /** Slot for the light / dark toggle in the top bar. */
    themeToggle?: ReactNode;
    children: ReactNode;
};

/**
 * The frame of every authed page: skip link, sidebar, top bar and the one `<main>`
 * landmark. Every authed route renders inside it, including a route the registry
 * (`shellRoutes.ts`) does not name (a not-found page, an error): the registry now
 * only carries per-route link behaviour (role, filter param), not a chrome switch.
 */
export function AppShell({ banners, themeToggle, children }: AppShellProps) {
    const pathname = usePathname();
    // The organization card owns the request. The top bar chip and the scope bar
    // show its answer: `undefined` while it loads, `null` when it is not known.
    const [organization, setOrganization] = useState<ActiveOrganizationData | null | undefined>(
        undefined,
    );
    const handleActiveOrganizationChange = useCallback((next: ActiveOrganizationData | null) => {
        setOrganization(next);
    }, []);
    // Below `md` the navigation is a slide-over. It is open for the path it was opened on, so a
    // navigation closes it without an effect; the menu button lives in the mobile bar.
    const [navOpenedAt, setNavOpenedAt] = useState<string | null>(null);
    const mobileOpen = navOpenedAt !== null && navOpenedAt === pathname;
    const menuControlRef = useRef<HTMLButtonElement>(null);
    const closeMobileNav = useCallback(() => setNavOpenedAt(null), []);
    useEffect(() => {
        // Growing past `md` while it is open: the sidebar is a static column again.
        const query = window.matchMedia?.("(min-width: 768px)");
        if (!query) return;
        const onChange = (event: MediaQueryListEvent) => {
            if (event.matches) setNavOpenedAt(null);
        };
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);
    const dataStatus: ShellStatus =
        organization === undefined
            ? { kind: "loading" }
            : shellStatusFromOrganization(organization);

    return (
        <>
            <a
                href="#main-content"
                className="sr-only rounded-(--radius-sm) bg-(--surface) px-4 py-2 text-sm font-medium text-(--text-primary) focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
            >
                {CTA_LABELS.skipToMainContent}
            </a>
            {/* Prototype `body::before`: a 2px orange-to-teal line along the top edge. z-35: over the sticky top bar (z-30), under the mobile
            slide-over and its backdrop (z-40/50), drawers and dialogs (z-50), so it never covers them. Fixed, so it adds no scroll offset. */}
            <div
                aria-hidden="true"
                data-testid="shell-ribbon"
                className="pointer-events-none fixed inset-x-0 top-0 z-35 h-0.5 bg-(image:--ribbon)"
            />
            {banners}
            <ShellMobileBar
                open={mobileOpen}
                onToggle={() => setNavOpenedAt(mobileOpen ? null : pathname)}
                controlRef={menuControlRef}
            />
            <div className="flex flex-col md:flex-row" data-testid="app-shell">
                <ShellSidebar
                    organization={organization}
                    onActiveOrganizationChange={handleActiveOrganizationChange}
                    mobileOpen={mobileOpen}
                    onMobileClose={closeMobileNav}
                    mobileControlRef={menuControlRef}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <ShellTopBar status={dataStatus} themeToggle={themeToggle} />
                    <main
                        id="main-content"
                        tabIndex={-1}
                        className="flex min-w-0 flex-1 flex-col px-4 pb-20 pt-6 focus:outline-none sm:px-6 md:px-8 md:pt-8"
                    >
                        <ShellOrganizationProvider value={organization}>
                            {children}
                        </ShellOrganizationProvider>
                    </main>
                </div>
            </div>
        </>
    );
}

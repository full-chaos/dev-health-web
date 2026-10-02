"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";
import { CTA_LABELS } from "@/lib/design/cta";

import { LegacyAccountBar } from "./LegacyAccountBar";
import { ShellMobileBar } from "./ShellMobileBar";
import { ShellOrganizationProvider } from "./ShellContext";
import { ShellSidebar } from "./ShellSidebar";
import { shellStatusFromOrganization, type ShellStatus } from "./ShellStatusChip";
import { ShellTopBar } from "./ShellTopBar";
import { isShellRoute } from "./shellRoutes";

type AppShellProps = {
    /** Full-width banners (impersonation, trial). Always first, above the chrome. */
    banners?: ReactNode;
    /** Slot for the light / dark toggle in the top bar. */
    themeToggle?: ReactNode;
    children: ReactNode;
};

/**
 * The frame of every authed page.
 *
 * The route registry (`shellRoutes.ts`) is the single switch:
 * - a registered route gets the shared app shell: skip link, sidebar, top bar
 *   and the one `<main>` landmark;
 * - every other route gets the legacy chrome without a change (the account bar,
 *   then the page, which renders its own navigation and `<main>`).
 *
 * The choice is made on the client from the pathname, because a layout does not
 * re-render on a client navigation.
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

    if (!isShellRoute(pathname)) {
        return (
            <>
                {banners}
                <LegacyAccountBar />
                {children}
            </>
        );
    }

    return (
        <>
            <a
                href="#main-content"
                className="sr-only rounded-(--radius-sm) bg-(--surface) px-4 py-2 text-sm font-medium text-(--text-primary) focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
            >
                {CTA_LABELS.skipToMainContent}
            </a>
            {banners}
            <ShellMobileBar
                open={mobileOpen}
                onToggle={() => setNavOpenedAt(mobileOpen ? null : pathname)}
                controlRef={menuControlRef}
            />
            <div className="flex flex-col md:flex-row" data-testid="app-shell">
                <ShellSidebar
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
                        className="flex min-w-0 flex-1 flex-col px-4 pb-20 pt-6 focus:outline-none sm:px-6 md:pt-8"
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

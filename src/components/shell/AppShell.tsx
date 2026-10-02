"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";
import { CTA_LABELS } from "@/lib/design/cta";

import { LegacyAccountBar } from "./LegacyAccountBar";
import { ShellProvider } from "./ShellContext";
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
    // The organization card owns the request; the top bar chip shows its answer.
    const [dataStatus, setDataStatus] = useState<ShellStatus>({ kind: "loading" });
    const handleActiveOrganizationChange = useCallback(
        (organization: ActiveOrganizationData | null) => {
            setDataStatus(shellStatusFromOrganization(organization));
        },
        [],
    );

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
        <ShellProvider>
            <a
                href="#main-content"
                className="sr-only rounded-(--radius-sm) bg-(--surface) px-4 py-2 text-sm font-medium text-(--text-primary) focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
            >
                {CTA_LABELS.skipToMainContent}
            </a>
            {banners}
            <div className="md:hidden">
                <LegacyAccountBar />
            </div>
            <div className="flex flex-col md:flex-row" data-testid="app-shell">
                <ShellSidebar onActiveOrganizationChange={handleActiveOrganizationChange} />
                <div className="flex min-w-0 flex-1 flex-col">
                    <ShellTopBar status={dataStatus} themeToggle={themeToggle} />
                    <main
                        id="main-content"
                        tabIndex={-1}
                        className="flex min-w-0 flex-1 flex-col px-4 pb-20 pt-6 focus:outline-none sm:px-6 md:pt-8"
                    >
                        {children}
                    </main>
                </div>
            </div>
        </ShellProvider>
    );
}

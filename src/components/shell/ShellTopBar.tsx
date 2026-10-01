"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { navTrailForPathname } from "@/lib/navigation/areas";

import { shellHref } from "./shellHref";
import { ShellStatusChip, type ShellStatus } from "./ShellStatusChip";
import { useShellNavParams } from "./useShellNavParams";

type ShellTopBarProps = {
    /** Data state of the active organization, from the organization card. */
    status: ShellStatus;
    /** Slot for the light / dark toggle. Empty until the toggle is mounted. */
    themeToggle?: ReactNode;
};

/**
 * The location trail with the user's state on its links. A crumb link is the
 * page's return path (it replaces the in-page "Back to {area}" link), so it
 * carries what that link carried: the filter (`f`), `role`, `lens` and `origin`.
 */
function ShellTrail({ pathname }: { pathname: string }) {
    const params = useShellNavParams(pathname);
    const trail = navTrailForPathname(pathname).map((crumb) =>
        crumb.href
            ? { ...crumb, href: shellHref(crumb.href, params, { withOrigin: true }) }
            : crumb,
    );
    return <Breadcrumbs items={trail} />;
}

/**
 * Top bar of the shared app shell: the location trail from the nav config (A6:
 * breadcrumb label = sidebar label), the data-freshness chip, and a slot for the
 * theme toggle. Shown from the `md` breakpoint up; below it the legacy account
 * bar is the top chrome.
 */
export function ShellTopBar({ status, themeToggle }: ShellTopBarProps) {
    const pathname = usePathname() ?? "";

    return (
        <header
            data-testid="shell-top-bar"
            className="sticky top-0 z-30 hidden min-h-14 items-center gap-4 border-b border-(--border) bg-(--surface) px-6 md:flex"
        >
            <div className="min-w-0 flex-1">
                {/* The links read the live query string; the bare trail is the fallback. */}
                <Suspense fallback={<Breadcrumbs items={navTrailForPathname(pathname)} />}>
                    <ShellTrail pathname={pathname} />
                </Suspense>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <ShellStatusChip status={status} />
                <div data-slot="theme-toggle" className="flex items-center empty:hidden">
                    {themeToggle}
                </div>
            </div>
        </header>
    );
}

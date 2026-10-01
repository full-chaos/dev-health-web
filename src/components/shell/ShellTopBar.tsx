"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { navTrailForPathname } from "@/lib/navigation/areas";

import { ShellStatusChip, type ShellStatus } from "./ShellStatusChip";

type ShellTopBarProps = {
    /** Data state of the active organization, from the organization card. */
    status: ShellStatus;
    /** Slot for the light / dark toggle. Empty until the toggle is mounted. */
    themeToggle?: ReactNode;
};

/**
 * Top bar of the shared app shell: the location trail from the nav config (A6:
 * breadcrumb label = sidebar label), the data-freshness chip, and a slot for the
 * theme toggle. Shown from the `md` breakpoint up; below it the legacy account
 * bar is the top chrome.
 */
export function ShellTopBar({ status, themeToggle }: ShellTopBarProps) {
    const pathname = usePathname() ?? "";
    const trail = navTrailForPathname(pathname);

    return (
        <header
            data-testid="shell-top-bar"
            className="sticky top-0 z-30 hidden min-h-14 items-center gap-4 border-b border-(--border) bg-(--surface) px-6 md:flex"
        >
            <div className="min-w-0 flex-1">
                <Breadcrumbs items={trail} />
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

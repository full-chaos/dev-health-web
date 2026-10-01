"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useRef, useState } from "react";

import fcLogo from "@/assets/fc-logo.png";
import { UserMenu } from "@/components/auth/UserMenu";
import { OrgSwitcher, type ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";
import { CTA_LABELS } from "@/lib/design/cta";

import { ShellNav } from "./ShellNav";

/**
 * Sidebar of the shared app shell: brand, organization card, navigation and the
 * account block.
 *
 * From `md` up it is a fixed-height column. Below `md` it keeps the behaviour
 * the page-level navigation had: an inline "Show navigation" panel above the
 * content (Escape closes it and returns focus to the control). Brand and account
 * are in the account bar at that size, so they are hidden here.
 */
type ShellSidebarProps = {
    /** Receives the active organization's data state from the organization card. */
    onActiveOrganizationChange?: (organization: ActiveOrganizationData | null) => void;
};

export function ShellSidebar({ onActiveOrganizationChange }: ShellSidebarProps) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const mobileNavControlRef = useRef<HTMLButtonElement>(null);

    const closeMobileNavigation = () => {
        setMobileOpen(false);
        mobileNavControlRef.current?.focus();
    };

    return (
        <aside
            data-testid="shell-sidebar"
            className="w-full px-4 pt-4 md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-(--border) md:bg-(--surface) md:p-0"
            onKeyDown={(event) => {
                if (event.key === "Escape" && mobileOpen) {
                    event.preventDefault();
                    closeMobileNavigation();
                }
            }}
        >
            <button
                type="button"
                ref={mobileNavControlRef}
                aria-expanded={mobileOpen}
                aria-controls="primary-navigation-panel"
                onClick={() => setMobileOpen((open) => !open)}
                className="w-full rounded-(--radius-sm) border border-(--card-stroke) bg-(--card-80) px-4 py-3 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50 md:hidden"
            >
                {mobileOpen ? "Hide navigation" : "Show navigation"}
            </button>
            <div
                id="primary-navigation-panel"
                className={`${mobileOpen ? "mt-3 flex" : "hidden"} max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto rounded-(--radius-md) border border-(--border) bg-(--surface) p-4 md:mt-0 md:flex md:h-full md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:px-3 md:py-5`}
            >
                <div className="hidden items-center gap-2 px-2 md:flex">
                    <Link
                        href="/dashboard"
                        aria-label={CTA_LABELS.devHealthCockpit}
                        className="flex min-w-0 items-center gap-2 rounded-(--radius-sm) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60"
                    >
                        <Image
                            src={fcLogo}
                            alt="Full Chaos Dev Health logo"
                            width={32}
                            height={32}
                            sizes="32px"
                            className="h-8 w-auto"
                            priority
                        />
                        <span className="flex min-w-0 flex-col leading-tight">
                            <span className="text-h3 font-semibold text-(--text-primary)">
                                Full Chaos
                            </span>
                            <span className="text-label-caps uppercase text-(--text-muted)">
                                Dev Health
                            </span>
                        </span>
                    </Link>
                </div>

                <OrgSwitcher
                    variant="card"
                    onActiveOrganizationChange={onActiveOrganizationChange}
                />

                <div className="min-h-0 md:flex-1 md:overflow-y-auto">
                    {/* The links read the live query string (filter, role, lens). */}
                    <Suspense fallback={null}>
                        <ShellNav />
                    </Suspense>
                </div>

                <div className="hidden border-t border-(--border) pt-3 md:block">
                    <UserMenu placement="sidebar" />
                </div>
            </div>
        </aside>
    );
}

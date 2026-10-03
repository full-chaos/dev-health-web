"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useRef, type RefObject } from "react";

import fcLogo from "@/assets/fc-logo-96.png";
import { UserMenu } from "@/components/auth/UserMenu";
import {
    OrgSwitcher,
    describeOrganizationData,
    type ActiveOrganizationData,
} from "@/components/navigation/OrgSwitcher";
import { useModalFocus } from "@/lib/a11y/useModalFocus";
import { CTA_LABELS } from "@/lib/design/cta";

import { ShellNav } from "./ShellNav";

/**
 * Sidebar of the shared app shell: brand, organization card, navigation and the
 * account block.
 *
 * From `md` up it is a fixed-height column. Below `md` it is a slide-over
 * (concept `.app-sidebar.open`): off canvas until the menu button of the mobile
 * bar opens it from the left, `w-(--shell-sidebar-w)` wide (the desktop sidebar width, which is the
 * concept's `--sidebarW`), over a backdrop. While open it is a modal dialog:
 * focus moves in, Tab stays inside, Escape or a backdrop click closes it, focus
 * returns to the menu button, a link click closes it and the page behind does
 * not scroll. Brand and account are in the mobile bar at that size, so they are
 * hidden here.
 */
type ShellSidebarProps = {
    /** The active organization the card loaded (`undefined`: loading, `null`: not known). */
    organization?: ActiveOrganizationData | null;
    /** Receives the active organization's data state from the organization card. */
    onActiveOrganizationChange?: (organization: ActiveOrganizationData | null) => void;
    /** Below `md`: the slide-over is open. The shell owns the state (the button is in the mobile bar). */
    mobileOpen?: boolean;
    onMobileClose?: () => void;
    /** The menu button, for returning focus on close. */
    mobileControlRef?: RefObject<HTMLButtonElement | null>;
};

export function ShellSidebar({
    organization,
    onActiveOrganizationChange,
    mobileOpen = false,
    onMobileClose,
    mobileControlRef,
}: ShellSidebarProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const close = () => onMobileClose?.();

    const onKeyDown = useModalFocus({
        open: mobileOpen,
        panelRef,
        returnFocusRef: mobileControlRef,
        onEscape: close,
    });

    // The page behind the slide-over does not scroll.
    useEffect(() => {
        if (!mobileOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [mobileOpen]);

    return (
        <aside
            data-testid="shell-sidebar"
            className="md:sticky md:top-0 md:h-dvh md:w-(--shell-sidebar-w) md:shrink-0 md:border-r md:border-(--border) md:bg-(--sidebar)"
        >
            {mobileOpen && (
                <div
                    aria-hidden="true"
                    data-testid="shell-nav-backdrop"
                    onClick={close}
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                />
            )}
            <div
                id="primary-navigation-panel"
                ref={panelRef}
                tabIndex={-1}
                {...(mobileOpen
                    ? { role: "dialog", "aria-modal": true, "aria-label": "Navigation" }
                    : {})}
                onKeyDown={onKeyDown}
                onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a[href]")) close();
                }}
                className={`flex flex-col gap-4 overflow-y-auto border-r border-(--border) bg-(--sidebar) p-4 focus:outline-none max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-(--shell-sidebar-w) max-md:max-w-[86vw] max-md:shadow-xl max-md:transition-[transform,visibility] max-md:duration-200 motion-reduce:transition-none ${
                    mobileOpen
                        ? "max-md:visible max-md:translate-x-0"
                        : "max-md:invisible max-md:-translate-x-full"
                } md:flex md:h-full md:max-h-none md:overflow-visible md:border-0 md:px-3 md:py-5`}
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
                            width={35}
                            height={32}
                            unoptimized
                            className="h-8 w-auto"
                            priority
                        />
                        <span className="flex min-w-0 flex-col leading-tight">
                            <span className="text-[1.0625rem] font-bold tracking-tight text-(--text-primary)">
                                Full Chaos
                            </span>
                            <span className="mt-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.17em] text-(--text-muted)">
                                Dev Health
                            </span>
                        </span>
                    </Link>
                </div>

                <OrgSwitcher onActiveOrganizationChange={onActiveOrganizationChange} />

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {/* The links read the live query string (filter, role, lens). */}
                    <Suspense fallback={null}>
                        <ShellNav part="main" />
                    </Suspense>
                </div>

                {/* Reports and Admin: held at the bottom, above the account block, outside the scroll region. */}
                <div data-testid="shell-utility-nav" className="shrink-0">
                    <Suspense fallback={null}>
                        <ShellNav part="utility" />
                    </Suspense>
                </div>

                <div className="hidden border-t border-(--border) pt-3 md:block">
                    <UserMenu placement="sidebar" detail={describeOrganizationData(organization)} />
                </div>
            </div>
        </aside>
    );
}

"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { RefObject } from "react";

import fcLogo from "@/assets/fc-logo.svg";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { CTA_LABELS } from "@/lib/design/cta";

type ShellMobileBarProps = {
    /** The slide-over navigation is open. */
    open: boolean;
    onToggle: () => void;
    /** The menu button; the navigation returns focus to it when it closes. */
    controlRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Top bar of a shell route below the `md` breakpoint (the desktop top bar is hidden there):
 * the menu button that opens the slide-over navigation (concept `.mobile-menu`), the brand,
 * the light / dark toggle and the account menu.
 * It is the top bar of every authed route.
 */
export function ShellMobileBar({ open, onToggle, controlRef }: ShellMobileBarProps) {
    return (
        <header
            data-testid="shell-mobile-bar"
            className="relative z-30 border-b border-(--border) bg-(--surface) md:hidden"
        >
            <div className="flex min-h-14 items-center gap-3 px-4 py-2">
                <button
                    type="button"
                    ref={controlRef}
                    aria-expanded={open}
                    aria-controls="primary-navigation-panel"
                    aria-label={open ? "Hide navigation" : "Show navigation"}
                    onClick={onToggle}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--card-stroke) bg-(--card-80) text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                >
                    <Menu aria-hidden="true" className="h-4 w-4" />
                </button>
                <Link
                    href="/dashboard"
                    aria-label={CTA_LABELS.devHealthCockpit}
                    className="flex min-w-0 items-center gap-2 rounded-md"
                >
                    <Image
                        src={fcLogo}
                        alt="Full Chaos Dev Health logo"
                        width={33}
                        height={32}
                        className="h-8 w-auto"
                        priority
                    />
                    <span className="hidden truncate text-sm font-semibold tracking-tight text-(--text-primary) sm:inline">
                        Full Chaos Dev Health
                    </span>
                </Link>
                <div className="ml-auto flex items-center gap-3">
                    <ThemeToggle />
                    <UserMenu />
                </div>
            </div>
        </header>
    );
}

"use client";

import { useSession, signOut } from "next-auth/react";
import { Building2, LogOut, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { BugReportButton } from "@/components/feedback/BugReportButton";
import { CTA_LABELS } from "@/lib/design/cta";

type UserMenuProps = {
    /**
     * `bar` is the account bar (menu opens downward, right-aligned). `sidebar` is
     * the account block of the shared app shell (full width, menu opens upward).
     */
    placement?: "bar" | "sidebar";
    /** Sidebar only: the line under the account name (the active organization's data state). */
    detail?: string | null;
};

export function UserMenu({ placement = "bar", detail }: UserMenuProps = {}) {
    const inSidebar = placement === "sidebar";
    // Both placements can be mounted at once (the shell shows one per breakpoint),
    // so each needs its own menu id.
    const menuId = inSidebar ? "account-options-sidebar" : "account-options";
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (status === "loading") {
        return <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--card-stroke)]" />;
    }

    if (!session) {
        return (
            <Link
                href="/auth/signin"
                className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--accent)] transition-colors"
            >
                {CTA_LABELS.signIn}
            </Link>
        );
    }

    return (
        <div
            className={inSidebar ? "relative flex w-full" : "relative flex max-w-full justify-end"}
            ref={menuRef}
        >
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-controls={menuId}
                aria-expanded={isOpen}
                aria-label={CTA_LABELS.accountOptions}
                className={`flex items-center gap-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50 ${
                    inSidebar
                        ? "w-full min-w-0 rounded-(--radius-sm) px-2 py-1 text-left hover:bg-(--surface2)"
                        : "rounded-(--radius-pill) border border-(--card-stroke) bg-(--card) px-3 py-1.5 hover:bg-(--card-80)"
                }`}
            >
                <div
                    className={`flex items-center justify-center rounded-(--radius-pill) text-xs ${
                        inSidebar
                            ? "size-7 shrink-0 bg-(image:--ember) font-bold text-(--on-ember)"
                            : "h-6 w-6 bg-(--accent) font-bold text-white"
                    }`}
                >
                    {session.user?.email?.[0]?.toUpperCase() || "U"}
                </div>
                {inSidebar ? (
                    <span className="flex min-w-0 flex-col">
                        <span className="sr-only">Account</span>
                        <strong className="truncate text-[0.6875rem] font-bold text-foreground">
                            {session.user?.email?.split("@")[0]}
                        </strong>
                        {detail ? (
                            <small
                                data-testid="account-detail"
                                className="truncate text-[0.625rem] text-(--text-muted)"
                            >
                                {detail}
                            </small>
                        ) : null}
                    </span>
                ) : (
                    <>
                        <span className="font-medium text-foreground">Account</span>
                        <span className="hidden text-(--ink-muted) sm:block">
                            {session.user?.email?.split("@")[0]}
                        </span>
                    </>
                )}
            </button>

            {isOpen && (
                <div
                    className={`absolute z-50 rounded-(--radius-sm) border border-(--card-stroke) bg-(--card) shadow-(--elevation-card) ${
                        inSidebar ? "bottom-full left-0 mb-2 w-full" : "right-0 top-full mt-2 w-48"
                    }`}
                    id={menuId}
                >
                    <div className="py-1">
                        <div className="border-b border-(--card-stroke) px-4 py-2 text-xs text-(--ink-muted)">
                            Signed in as
                            <br />
                            <span className="block truncate font-medium text-foreground">
                                {session.user?.email}
                            </span>
                        </div>
                        {session.user?.is_superuser && (
                            <Link
                                href="/superadmin"
                                className="flex items-center gap-2 px-4 py-2 text-sm text-(--info) hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                                onClick={() => setIsOpen(false)}
                            >
                                <ShieldCheck
                                    aria-hidden="true"
                                    className="h-4 w-4 shrink-0 text-(--ink-muted)"
                                />
                                {CTA_LABELS.platformAdmin}
                            </Link>
                        )}
                        <Link
                            href="/settings"
                            className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                            onClick={() => setIsOpen(false)}
                        >
                            <Settings2
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 text-(--ink-muted)"
                            />
                            {CTA_LABELS.preferences}
                        </Link>
                        <Link
                            href="/org/admin"
                            className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                            onClick={() => setIsOpen(false)}
                        >
                            <Building2
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 text-(--ink-muted)"
                            />
                            {CTA_LABELS.adminPanel}
                        </Link>
                        <div role="separator" className="border-t border-(--card-stroke)" />
                        <BugReportButton />
                        <button
                            type="button"
                            onClick={() => signOut()}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-foreground hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                        >
                            <LogOut
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 text-(--ink-muted)"
                            />
                            {CTA_LABELS.signOut}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

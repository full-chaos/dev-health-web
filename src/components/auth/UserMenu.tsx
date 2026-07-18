"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { CTA_LABELS } from "@/lib/design/cta";

export function UserMenu() {
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
        <div className="relative flex max-w-full justify-end" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-controls="account-options"
                aria-expanded={isOpen}
                aria-label={CTA_LABELS.accountOptions}
                className="flex items-center gap-2 rounded-(--radius-pill) border border-(--card-stroke) bg-(--card) px-3 py-1.5 text-sm transition hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
            >
                <div className="flex h-6 w-6 items-center justify-center rounded-(--radius-pill) bg-(--accent) text-xs font-bold text-white">
                    {session.user?.email?.[0]?.toUpperCase() || "U"}
                </div>
                <span className="font-medium text-foreground">Account</span>
                <span className="hidden text-(--ink-muted) sm:block">
                    {session.user?.email?.split("@")[0]}
                </span>
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 top-full z-50 mt-2 w-48 rounded-(--radius-sm) border border-(--card-stroke) bg-(--card) shadow-lg"
                    id="account-options"
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
                                className="block px-4 py-2 text-sm text-purple-400 hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                                onClick={() => setIsOpen(false)}
                            >
                                {CTA_LABELS.platformAdmin}
                            </Link>
                        )}
                        <Link
                            href="/settings"
                            className="block px-4 py-2 text-sm text-foreground hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                            onClick={() => setIsOpen(false)}
                        >
                            {CTA_LABELS.preferences}
                        </Link>
                        <Link
                            href="/org/admin"
                            className="block px-4 py-2 text-sm text-foreground hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                            onClick={() => setIsOpen(false)}
                        >
                            {CTA_LABELS.adminPanel}
                        </Link>
                        <div className="border-t border-(--card-stroke)">
                            <button
                                type="button"
                                onClick={() => signOut()}
                                className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                            >
                                {CTA_LABELS.signOut}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AuthTabsProps = {
    signInHref?: string;
    signUpHref?: string;
};

export function AuthTabs({
    signInHref = "/auth/signin",
    signUpHref = "/auth/signup",
}: AuthTabsProps) {
    const pathname = usePathname();
    const isSignIn = pathname === "/auth/signin";

    return (
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            <Link
                href={signInHref}
                className={`flex-1 py-3 text-center font-medium text-sm transition-colors ${
                    isSignIn
                        ? "bg-[var(--accent)] text-white"
                        : "bg-transparent text-[var(--foreground)] hover:bg-[var(--card-stroke)]/20"
                }`}
            >
                Sign in
            </Link>
            <Link
                href={signUpHref}
                className={`flex-1 py-3 text-center font-medium text-sm transition-colors ${
                    !isSignIn
                        ? "bg-[var(--accent)] text-white"
                        : "bg-transparent text-[var(--foreground)] hover:bg-[var(--card-stroke)]/20"
                }`}
            >
                Create account
            </Link>
        </div>
    );
}

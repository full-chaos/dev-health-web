"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CTA_LABELS } from "@/lib/design/cta";

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
        <div className="flex rounded-lg border border-[var(--card-stroke)] overflow-hidden">
            <Link
                href={signInHref}
                className={`flex-1 py-3 text-center font-medium text-sm transition-colors ${
                    isSignIn
                        ? "bg-[var(--accent)] text-white"
                        : "bg-transparent text-[var(--foreground)] hover:bg-[var(--card-stroke)]/20"
                }`}
            >
                {CTA_LABELS.signIn}
            </Link>
            <Link
                href={signUpHref}
                className={`flex-1 py-3 text-center font-medium text-sm transition-colors ${
                    !isSignIn
                        ? "bg-[var(--accent)] text-white"
                        : "bg-transparent text-[var(--foreground)] hover:bg-[var(--card-stroke)]/20"
                }`}
            >
                {CTA_LABELS.createAccount}
            </Link>
        </div>
    );
}

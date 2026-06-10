"use client";

import { AuthTabs } from "./AuthTabs";
import { SocialLoginButtons } from "./SocialLoginButtons";

type AuthCardProps = {
    children: React.ReactNode;
    signInHref?: string;
    signUpHref?: string;
    providers?: string[];
};

export function AuthCard({ children, signInHref, signUpHref, providers = [] }: AuthCardProps) {
    return (
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8 shadow-lg space-y-6">
            <AuthTabs signInHref={signInHref} signUpHref={signUpHref} />

            <SocialLoginButtons providers={providers} />

            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--card-stroke)]" />
                <span className="text-sm text-[var(--ink-muted)]">continue with email</span>
                <div className="h-px flex-1 bg-[var(--card-stroke)]" />
            </div>

            {children}
        </div>
    );
}

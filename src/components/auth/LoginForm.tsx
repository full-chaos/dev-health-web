"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { safePostLoginRedirect } from "@/lib/post-login-redirect";

type LoginFormProps = {
    plan?: string;
    trialIntent?: boolean;
    callbackUrl?: string;
};

async function getSessionWithRetry(attempts = 2, delayMs = 150) {
    for (let i = 0; i < attempts; i++) {
        const session = await getSession();
        if (session) return session;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
}

export function LoginForm({ plan, trialIntent = false, callbackUrl }: LoginFormProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [verifyEmail, setVerifyEmail] = useState(false);
    const isTeamTrialIntent = trialIntent && plan?.toLowerCase() === "team";
    const postLoginTarget = safePostLoginRedirect(callbackUrl);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                if (result.code === "email_verification_required") {
                    setVerifyEmail(true);
                } else if (result.code === "account_locked") {
                    toast.error(
                        "Too many failed login attempts. Your account is temporarily locked. Please try again later.",
                    );
                } else if (result.code === "rate_limited") {
                    toast.error("Too many login attempts. Please try again later.");
                } else {
                    toast.error("Invalid email or password");
                }
            } else {
                // getSession can return null if the auth cookie set by signIn hasn't
                // propagated to the browser cookie jar yet; a single retry absorbs
                // that race before we decide the destination.
                const session = await getSessionWithRetry();
                const destination = session?.user?.needs_onboarding
                    ? isTeamTrialIntent
                        ? "/auth/onboard?plan=team&trial=true"
                        : "/auth/onboard"
                    : (postLoginTarget ?? "/dashboard");
                // Hard navigation (not router.push) guarantees the new auth cookie
                // is attached to the request for `destination`. Soft App Router
                // navigation is racy immediately after signIn in e2e environments.
                window.location.assign(destination);
            }
        } catch {
            toast.error("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const submitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing || loading) return;

        const form = e.currentTarget.form;
        if (!form) return;

        e.preventDefault();
        form.requestSubmit();
    };

    const inputClass =
        "w-full rounded-lg border border-[var(--card-stroke)] bg-[var(--background)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-shadow";

    return (
        <>
            {verifyEmail && (
                <div className="mb-4 p-3 text-sm text-amber-400 bg-amber-950/50 rounded-md border border-amber-800">
                    <p className="font-medium">Please verify your email</p>
                    <p className="mt-1 text-amber-400/80">
                        Check your inbox for a verification link before signing in.
                    </p>
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                    <label
                        htmlFor="email"
                        className="block text-base font-medium text-[var(--foreground)]"
                    >
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={submitOnEnter}
                        required
                        className={inputClass}
                        placeholder="name@example.com"
                    />
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="password"
                        className="block text-base font-medium text-[var(--foreground)]"
                    >
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={submitOnEnter}
                        required
                        className={inputClass}
                    />
                </div>

                <div className="text-right">
                    <Link
                        href="/auth/forgot-password"
                        className="text-sm text-[var(--accent)] hover:underline"
                    >
                        Forgot password?
                    </Link>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg border border-[var(--card-stroke)] bg-transparent py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-stroke)]/20 transition-colors disabled:opacity-50"
                >
                    {loading ? "Signing in..." : "Sign in"}
                </button>
            </form>
        </>
    );
}

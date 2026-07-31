"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resolveOrigin } from "@/lib/origin";
import { extractErrorMessage } from "@/lib/errorMessages";
import { appendCallbackUrl, safePostLoginRedirect } from "@/lib/post-login-redirect";
import { CTA_LABELS } from "@/lib/design/cta";
import { PasswordStrength } from "./PasswordStrength";

type SignupFormProps = {
    plan?: string;
    trialIntent?: boolean;
    callbackUrl?: string;
};

export function SignupForm({ plan, trialIntent = false, callbackUrl }: SignupFormProps) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [loading, setLoading] = useState(false);

    const normalizedPlan = plan?.toLowerCase();
    const isTeamTrialIntent = trialIntent && normalizedPlan === "team";
    const postLoginTarget = safePostLoginRedirect(callbackUrl);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }

        if (!agreedToTerms) {
            toast.error("Please agree to the Terms of Service and Privacy Policy");
            return;
        }

        setLoading(true);

        try {
            const backendUrl = resolveOrigin();
            const res = await fetch(`${backendUrl}/api/v1/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: fullName || undefined,
                }),
            });

            if (!res.ok) {
                if (res.status === 429) {
                    toast.error("Too many registration attempts. Please try again later.");
                    return;
                }
                try {
                    const data = await res.json();
                    toast.error(extractErrorMessage(data.detail, "Registration failed"));
                } catch {
                    toast.error("Registration failed");
                }
                return;
            }

            router.push(
                appendCallbackUrl(
                    isTeamTrialIntent
                        ? "/auth/signin?registered=true&plan=team&trial=true"
                        : "/auth/signin?registered=true",
                    postLoginTarget,
                ),
            );
        } catch {
            toast.error("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const inputClass =
        "w-full rounded-lg border border-[var(--card-stroke)] bg-[var(--background)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-shadow";

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
                <label
                    htmlFor="fullName"
                    className="block text-base font-medium text-[var(--foreground)]"
                >
                    Display name
                </label>
                <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                    placeholder="John Doe"
                />
            </div>

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
                    required
                    minLength={8}
                    maxLength={128}
                    className={inputClass}
                />
            </div>

            <PasswordStrength password={password} />

            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--card-stroke)] accent-[var(--accent)]"
                />
                <span className="text-sm text-[var(--foreground)]">
                    I agree to the{" "}
                    <a href="/marketing/terms" className="text-[var(--accent)] hover:underline">
                        {CTA_LABELS.termsOfService}
                    </a>{" "}
                    and{" "}
                    <a href="/marketing/privacy" className="text-[var(--accent)] hover:underline">
                        {CTA_LABELS.privacyPolicy}
                    </a>
                </span>
            </label>

            <button
                type="submit"
                disabled={loading || !agreedToTerms}
                className="w-full rounded-lg border border-[var(--card-stroke)] bg-transparent py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-stroke)]/20 transition-colors disabled:opacity-50"
            >
                {loading ? "Creating account..." : "Create account"}
            </button>
        </form>
    );
}

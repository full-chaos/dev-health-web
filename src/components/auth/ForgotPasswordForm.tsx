"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { resolveOrigin } from "@/lib/origin";
import { extractErrorMessage } from "@/lib/errorMessages";

export function ForgotPasswordForm() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const backendUrl = resolveOrigin();
            const response = await fetch(`${backendUrl}/api/v1/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            if (response.status === 429) {
                toast.error("Too many requests...");
                return;
            }

            if (response.ok) {
                setIsSuccess(true);
            } else {
                const data = await response.json().catch(() => ({}));
                toast.error(extractErrorMessage(data?.detail, "Failed to send reset link"));
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="space-y-6">
                <div className="p-3 text-sm text-green-400 bg-green-950/50 rounded-md border border-green-800 text-center">
                    If an account exists with that email, a password reset link has been sent.
                </div>
                <div className="text-center">
                    <Link
                        href="/auth/signin?from=reset"
                        className="text-sm font-medium text-[var(--accent)] hover:opacity-90"
                    >
                        Back to Sign in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Email address
                </label>
                <div className="mt-2">
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        disabled={isLoading}
                    />
                </div>
            </div>

            <div>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2 px-4 bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                >
                    {isLoading ? "Sending..." : "Send reset link"}
                </button>
            </div>

            <div className="text-center mt-4">
                <Link
                    href="/auth/signin"
                    className="text-sm font-medium text-[var(--foreground)] hover:underline"
                >
                    Remember your password?
                </Link>
            </div>
        </form>
    );
}

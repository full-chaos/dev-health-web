"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { resolveOrigin } from "@/lib/origin";
import { extractErrorMessage } from "@/lib/errorMessages";

interface ResetPasswordFormProps {
    token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        if (newPassword.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }

        if (newPassword.length > 128) {
            toast.error("Password must be at most 128 characters");
            return;
        }

        if (!/[a-zA-Z]/.test(newPassword)) {
            toast.error("Password must contain at least one letter");
            return;
        }

        if (!/[0-9]/.test(newPassword)) {
            toast.error("Password must contain at least one number");
            return;
        }

        setIsLoading(true);

        try {
            const backendUrl = resolveOrigin();
            const response = await fetch(`${backendUrl}/api/v1/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, new_password: newPassword }),
            });

            if (response.ok) {
                setIsSuccess(true);
            } else if (response.status === 400) {
                toast.error("Invalid or expired token");
            } else {
                const data = await response.json().catch(() => ({}));
                toast.error(extractErrorMessage(data?.detail, "Failed to reset password"));
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
                    Your password has been reset successfully.
                </div>
                <div className="text-center">
                    <Link
                        href="/auth/signin"
                        className="text-sm font-medium text-[var(--accent)] hover:opacity-90"
                    >
                        Sign in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label
                    htmlFor="new_password"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    New password
                </label>
                <div className="mt-2">
                    <input
                        id="new_password"
                        name="new_password"
                        type="password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        disabled={isLoading}
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="confirm_password"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Confirm new password
                </label>
                <div className="mt-2">
                    <input
                        id="confirm_password"
                        name="confirm_password"
                        type="password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
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
                    {isLoading ? "Resetting..." : "Reset password"}
                </button>
            </div>
        </form>
    );
}

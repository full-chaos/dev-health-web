"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { SettingsSection } from "./SettingsSection";

type Notice = { kind: "ok" | "error"; text: string; violations?: string[] };

const inputClass =
    "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent-2)";

/**
 * Change the signed-in user's own password. The server refuses a wrong current password, enforces
 * the password policy and signs every other session out; the session adopts the fresh token pair
 * through a sealed handoff the page cannot read (CHAOS-12088). Nothing typed here is stored,
 * logged or shown back.
 */
export function ChangePasswordSettings() {
    const { update } = useSession();
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const current = String(data.get("current_password") ?? "");
        const next = String(data.get("new_password") ?? "");
        const confirm = String(data.get("confirm_password") ?? "");

        if (next !== confirm) {
            setNotice({ kind: "error", text: "The new passwords do not match." });
            return;
        }
        if (next.length < 8 || next.length > 128) {
            setNotice({ kind: "error", text: "The new password must be 8 to 128 characters." });
            return;
        }

        setPending(true);
        setNotice(null);
        try {
            const response = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: current, new_password: next }),
            });
            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                violations?: string[];
                sessionHandoff?: string;
            };
            if (!response.ok) {
                setNotice({
                    kind: "error",
                    text: body.error ?? "The password could not be changed.",
                    violations: body.violations,
                });
                return;
            }
            // A sealed handoff of the fresh token pair: the page passes it on and cannot read it.
            await update({ sessionHandoff: body.sessionHandoff });
            form.reset();
            setNotice({
                kind: "ok",
                text: "Password changed. Your other sessions were signed out.",
            });
        } catch {
            setNotice({ kind: "error", text: "The password could not be changed." });
        } finally {
            setPending(false);
        }
    }

    return (
        <SettingsSection
            title="Password"
            description="Change the password you use to sign in. Your other sessions are signed out."
        >
            <form
                onSubmit={onSubmit}
                className="max-w-md space-y-4"
                data-testid="change-password-form"
                autoComplete="off"
            >
                <div className="space-y-1">
                    <label htmlFor="current_password" className="text-sm font-medium">
                        Current password
                    </label>
                    <input
                        id="current_password"
                        name="current_password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className={inputClass}
                    />
                </div>
                <div className="space-y-1">
                    <label htmlFor="new_password" className="text-sm font-medium">
                        New password
                    </label>
                    <input
                        id="new_password"
                        name="new_password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        className={inputClass}
                    />
                </div>
                <div className="space-y-1">
                    <label htmlFor="confirm_password" className="text-sm font-medium">
                        Confirm new password
                    </label>
                    <input
                        id="confirm_password"
                        name="confirm_password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        className={inputClass}
                    />
                </div>
                <div aria-live="polite" data-testid="change-password-notice">
                    {notice ? (
                        <div
                            className={`text-sm ${notice.kind === "ok" ? "text-(--positive)" : "text-(--negative)"}`}
                        >
                            <p>{notice.text}</p>
                            {notice.violations && notice.violations.length > 0 ? (
                                <ul className="mt-1 list-disc pl-5">
                                    {notice.violations.map((violation) => (
                                        <li key={violation}>{violation}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                >
                    {pending ? "Changing password..." : "Change password"}
                </button>
            </form>
        </SettingsSection>
    );
}

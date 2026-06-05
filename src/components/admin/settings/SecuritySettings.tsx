"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { SettingsSection } from "./SettingsSection";
import { getSecuritySettings, updateSecuritySetting } from "@/lib/admin/server";
import type { Setting } from "@/lib/admin/types";

const SESSION_TIMEOUT_OPTIONS = [
    { value: "15", label: "15 minutes" },
    { value: "30", label: "30 minutes" },
    { value: "60", label: "1 hour" },
    { value: "240", label: "4 hours" },
];

const DEFAULT_SESSION_TIMEOUT = "30";

function findSetting(settings: Setting[], key: string): string | null {
    const match = settings.find((s) => s.key === key);
    return match?.value ?? null;
}

export function SecuritySettings() {
    const [isPending, startTransition] = useTransition();
    const [loaded, setLoaded] = useState(false);
    // TODO: 2FA enforcement — see CHAOS-555 and CHAOS-528 epic

    const [sessionTimeout, setSessionTimeout] = useState(DEFAULT_SESSION_TIMEOUT);

    useEffect(() => {
        let active = true;

        const load = async () => {
            const result = await getSecuritySettings();
            if (!active) return;

            if (result.data) {
                const timeout = findSetting(result.data, "session_timeout");
                if (timeout) setSessionTimeout(timeout);
            }
            setLoaded(true);
        };

        load();
        return () => {
            active = false;
        };
    }, []);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        startTransition(async () => {
            const results = await Promise.allSettled([
                updateSecuritySetting("session_timeout", sessionTimeout),
            ]);

            const errors = results
                .map((r) => (r.status === "fulfilled" ? r.value : { error: "Request failed" }))
                .filter((r) => r.error)
                .map((r) => r.error);

            if (errors.length > 0) {
                toast.error(errors.join("; "));
            } else {
                toast.success("Security settings saved successfully");
            }
        });
    };

    return (
        <SettingsSection
            title="Security"
            description="Configure security settings for your organization."
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="sessionTimeout"
                        className="block text-sm font-medium text-(--foreground)"
                    >
                        Session Timeout
                    </label>
                    <select
                        id="sessionTimeout"
                        name="sessionTimeout"
                        value={sessionTimeout}
                        onChange={(e) => setSessionTimeout(e.target.value)}
                        disabled={isPending || !loaded}
                        className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
                    >
                        {SESSION_TIMEOUT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isPending || !loaded}
                        className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 disabled:opacity-50"
                    >
                        {isPending ? "Saving..." : "Save Security Settings"}
                    </button>
                </div>
            </form>
        </SettingsSection>
    );
}

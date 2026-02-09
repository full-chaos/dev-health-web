"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [sessionTimeout, setSessionTimeout] = useState(DEFAULT_SESSION_TIMEOUT);
  const [enforce2fa, setEnforce2fa] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const result = await getSecuritySettings();
      if (!active) return;

      if (result.data) {
        const timeout = findSetting(result.data, "session_timeout");
        if (timeout) setSessionTimeout(timeout);
        const twoFa = findSetting(result.data, "enforce_2fa");
        if (twoFa !== null) setEnforce2fa(twoFa === "true");
      }
      setLoaded(true);
    };

    load();
    return () => { active = false; };
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const results = await Promise.allSettled([
        updateSecuritySetting("session_timeout", sessionTimeout),
        updateSecuritySetting("enforce_2fa", String(enforce2fa)),
      ]);

      const errors = results
        .map((r) => (r.status === "fulfilled" ? r.value : { error: "Request failed" }))
        .filter((r) => r.error)
        .map((r) => r.error);

      if (errors.length > 0) {
        setMessage({ type: "error", text: errors.join("; ") });
      } else {
        setMessage({ type: "success", text: "Security settings saved successfully" });
      }
    });
  };

  return (
    <SettingsSection
      title="Security"
      description="Configure security settings for your organization."
    >
      {message && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            message.type === "success"
              ? "bg-green-500/10 text-green-600"
              : "bg-red-500/10 text-red-500"
          }`}
        >
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="sessionTimeout" className="block text-sm font-medium text-(--foreground)">
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
        <div className="flex items-center">
          <input
            id="2fa"
            name="2fa"
            type="checkbox"
            checked={enforce2fa}
            onChange={(e) => setEnforce2fa(e.target.checked)}
            disabled={isPending || !loaded}
            className="h-4 w-4 rounded border-(--card-stroke) text-(--accent) focus:ring-(--accent)"
          />
          <label htmlFor="2fa" className="ml-2 block text-sm text-(--foreground)">
            Enforce Two-Factor Authentication (2FA)
          </label>
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

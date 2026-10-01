"use client";

import { useSyncExternalStore } from "react";
import { SettingsSection } from "./SettingsSection";
import { CTA_LABELS } from "@/lib/design/cta";
import { isServer, getLocalStorage, getWindow } from "@/lib/env";
import { isTelemetryOptedOut, setTelemetryOptOut } from "@/lib/telemetry/config";

type Theme = "light" | "dark";
type Listener = () => void;

const listeners = new Set<Listener>();

const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const notify = () => {
    listeners.forEach((listener) => {
        listener();
    });
};

const getStoredTheme = (): Theme | null => {
    const stored = getLocalStorage()?.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
};

const getSystemTheme = (): Theme => {
    const win = getWindow();
    if (!win) return "light";
    return win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: Theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("theme", theme);
    notify();
};

const getThemeSnapshot = (): Theme => {
    if (isServer) return "light";
    const stored = getStoredTheme();
    if (stored) return stored;
    const fromDataset = document.documentElement.dataset.theme;
    if (fromDataset === "light" || fromDataset === "dark") return fromDataset;
    return getSystemTheme();
};

const getThemeServerSnapshot = (): Theme => "light";
const getTelemetrySnapshot = (): boolean => (isServer ? false : isTelemetryOptedOut());
const getTelemetryServerSnapshot = (): boolean => false;

export function PreferencesSettings() {
    const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);
    const telemetryOptedOut = useSyncExternalStore(
        subscribe,
        getTelemetrySnapshot,
        getTelemetryServerSnapshot,
    );

    const applyTelemetryOptOut = (optedOut: boolean) => {
        setTelemetryOptOut(optedOut);
        notify();
    };

    return (
        <SettingsSection
            title="Preferences"
            description="Customize your display settings. These preferences are stored locally in your browser."
        >
            <div className="space-y-6">
                <div>
                    <p className="block text-sm font-medium text-(--foreground) mb-2">Theme</p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => applyTheme("light")}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                theme === "light"
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            <span className="block text-lg mb-1">☀️</span>
                            {CTA_LABELS.lightTheme}
                        </button>
                        <button
                            type="button"
                            onClick={() => applyTheme("dark")}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                theme === "dark"
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            <span className="block text-lg mb-1">🌙</span>
                            {CTA_LABELS.darkTheme}
                        </button>
                    </div>
                </div>

                <div>
                    <p className="block text-sm font-medium text-(--foreground) mb-2">
                        Product telemetry
                    </p>
                    <p className="mb-3 text-sm text-(--ink-muted)">
                        Privacy-safe product events help improve Dev Health. We collect route
                        patterns, stable feature IDs, counts, and chart actions only — no names,
                        emails, query strings, or user-entered text. Browser Do Not Track is
                        respected.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            aria-pressed={!telemetryOptedOut}
                            onClick={() => applyTelemetryOptOut(false)}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                !telemetryOptedOut
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            {CTA_LABELS.enabled}
                        </button>
                        <button
                            type="button"
                            aria-pressed={telemetryOptedOut}
                            onClick={() => applyTelemetryOptOut(true)}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                telemetryOptedOut
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            {CTA_LABELS.disabled}
                        </button>
                    </div>
                </div>
            </div>
        </SettingsSection>
    );
}

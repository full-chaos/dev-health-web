"use client";

import { useEffect, useSyncExternalStore } from "react";
import { SettingsSection } from "./SettingsSection";
import { CTA_LABELS } from "@/lib/design/cta";
import { isServer } from "@/lib/env";
import {
    applyPreference,
    followSystemTheme,
    getPreferenceServerSnapshot,
    getPreferenceSnapshot,
    getThemeSnapshot,
    subscribeTheme,
    type ThemePreference,
} from "@/lib/themePreference";
import { isTelemetryOptedOut, setTelemetryOptOut } from "@/lib/telemetry/config";

type Listener = () => void;

const telemetryListeners = new Set<Listener>();

const subscribeTelemetry = (listener: Listener) => {
    telemetryListeners.add(listener);
    return () => telemetryListeners.delete(listener);
};

const notifyTelemetry = () => {
    telemetryListeners.forEach((listener) => {
        listener();
    });
};

const getTelemetrySnapshot = (): boolean => (isServer ? false : isTelemetryOptedOut());
const getTelemetryServerSnapshot = (): boolean => false;

export function PreferencesSettings() {
    // The choice that is stored; with nothing stored the page shows the theme it draws (the default).
    const stored = useSyncExternalStore(
        subscribeTheme,
        getPreferenceSnapshot,
        getPreferenceServerSnapshot,
    );
    const drawn = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "dark" as const);
    const choice: ThemePreference = stored ?? drawn;

    // "System" is followed live while this page is open (the top-bar toggle does it on every page).
    useEffect(() => followSystemTheme(), [stored]);

    const telemetryOptedOut = useSyncExternalStore(
        subscribeTelemetry,
        getTelemetrySnapshot,
        getTelemetryServerSnapshot,
    );

    const applyTelemetryOptOut = (optedOut: boolean) => {
        setTelemetryOptOut(optedOut);
        notifyTelemetry();
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
                            aria-pressed={choice === "light"}
                            onClick={() => applyPreference("light")}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                choice === "light"
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            <span className="block text-lg mb-1">☀️</span>
                            {CTA_LABELS.lightTheme}
                        </button>
                        <button
                            type="button"
                            aria-pressed={choice === "dark"}
                            onClick={() => applyPreference("dark")}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                choice === "dark"
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            <span className="block text-lg mb-1">🌙</span>
                            {CTA_LABELS.darkTheme}
                        </button>
                        <button
                            type="button"
                            aria-pressed={choice === "system"}
                            onClick={() => applyPreference("system")}
                            className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                                choice === "system"
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent-text)"
                                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                            }`}
                        >
                            <span className="block text-lg mb-1">🖥️</span>
                            {CTA_LABELS.systemTheme}
                        </button>
                    </div>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        The theme switch in the top bar changes the same setting.
                    </p>
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

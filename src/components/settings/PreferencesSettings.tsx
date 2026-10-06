"use client";

import { useEffect, useSyncExternalStore } from "react";
import { SettingsSection } from "./SettingsSection";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
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

const optOutListeners = new Set<Listener>();

const subscribeTelemetry = (listener: Listener) => {
    optOutListeners.add(listener);
    return () => optOutListeners.delete(listener);
};

const notifyTelemetry = () => {
    optOutListeners.forEach((listener) => {
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
                    <SegmentedControl<ThemePreference>
                        ariaLabel="Theme"
                        testId="theme-segments"
                        value={choice}
                        onChange={applyPreference}
                        options={[
                            { id: "light", label: CTA_LABELS.lightTheme },
                            { id: "dark", label: CTA_LABELS.darkTheme },
                            { id: "system", label: CTA_LABELS.systemTheme },
                        ]}
                    />
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        The theme switch in the top bar changes the same setting.
                    </p>
                </div>

                <div>
                    <p className="block text-sm font-medium text-(--foreground) mb-2">
                        Product telemetry
                    </p>
                    <p className="mb-3 max-w-3xl text-sm text-(--ink-muted)">
                        Privacy-safe product events help improve Dev Health. We collect route
                        patterns, stable feature IDs, counts, and chart actions only — no names,
                        emails, query strings, or user-entered text. Browser Do Not Track is
                        respected.
                    </p>
                    <SegmentedControl<"enabled" | "disabled">
                        ariaLabel="Product telemetry"
                        testId="telemetry-segments"
                        value={telemetryOptedOut ? "disabled" : "enabled"}
                        onChange={(next) => applyTelemetryOptOut(next === "disabled")}
                        options={[
                            { id: "enabled", label: CTA_LABELS.enabled },
                            { id: "disabled", label: CTA_LABELS.disabled },
                        ]}
                    />
                </div>
            </div>
        </SettingsSection>
    );
}

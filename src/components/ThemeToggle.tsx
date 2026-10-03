"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    applyPreference,
    followSystemTheme,
    getStoredPreference,
    getThemeServerSnapshot,
    getThemeSnapshot,
    resolveTheme,
    subscribeTheme,
} from "@/lib/themePreference";

export function ThemeToggle() {
    const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);

    useEffect(() => {
        const stored = getStoredPreference();
        // A stored light or dark is applied again on mount (as before); "system" is followed live.
        if (stored === "system") return followSystemTheme();
        if (stored && document.documentElement.dataset.theme !== resolveTheme(stored)) {
            applyPreference(stored);
        }
    }, []);

    const isLight = theme === "light";
    // The icon and the label name the theme a click switches TO (prototype app.js:41).
    const Icon = isLight ? Moon : Sun;

    return (
        <button
            type="button"
            aria-label={isLight ? CTA_LABELS.themeSwitchToDark : CTA_LABELS.themeSwitchToLight}
            data-testid="theme-toggle"
            data-theme-current={theme}
            onClick={() => applyPreference(isLight ? "dark" : "light")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--card-stroke) bg-(--card-70) text-foreground transition-colors hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            <Icon aria-hidden="true" strokeWidth={1.65} className="size-4.5" />
        </button>
    );
}

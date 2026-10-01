"use client";

import { useEffect, useSyncExternalStore } from "react";
import { isServer, getLocalStorage } from "@/lib/env";

type Theme = "light" | "dark";
/** Dark is the default theme; `public/theme-init.js` and the root layout agree. */
const DEFAULT_THEME: Theme = "dark";
type Listener = () => void;

const listeners = new Set<Listener>();

const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const notify = () => {
    listeners.forEach((listener) => listener());
};

const getStoredTheme = (): Theme | null => {
    const stored = getLocalStorage()?.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : null;
};

const applyTheme = (theme: Theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
        localStorage.setItem("theme", theme);
    } catch {
        /* storage unavailable: the choice lasts for this page view only */
    }
    notify();
};

const getThemeSnapshot = (): Theme => {
    if (isServer) {
        return DEFAULT_THEME;
    }
    const stored = getStoredTheme();
    if (stored) {
        return stored;
    }
    const fromDataset = document.documentElement.dataset.theme;
    if (fromDataset === "light" || fromDataset === "dark") {
        return fromDataset;
    }
    return DEFAULT_THEME;
};

const getThemeServerSnapshot = (): Theme => DEFAULT_THEME;

export function ThemeToggle() {
    const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);

    useEffect(() => {
        const storedTheme = getStoredTheme();
        if (storedTheme && document.documentElement.dataset.theme !== storedTheme) {
            applyTheme(storedTheme);
        }
    }, []);

    const isLight = theme === "light";

    return (
        <button
            type="button"
            aria-pressed={isLight}
            aria-label="Light theme"
            data-testid="theme-toggle"
            onClick={() => applyTheme(isLight ? "dark" : "light")}
            className="inline-flex h-8 items-center gap-2 rounded-full border border-(--card-stroke) bg-(--card-70) px-3 text-label-caps font-semibold uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--accent)" />
            <span aria-hidden="true">{isLight ? "Light" : "Dark"}</span>
        </button>
    );
}

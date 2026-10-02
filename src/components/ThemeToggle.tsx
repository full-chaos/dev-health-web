"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { isServer, getLocalStorage, getWindow } from "@/lib/env";

type Theme = "light" | "dark";
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

const getSystemTheme = (): Theme => {
    const win = getWindow();
    if (!win) {
        return "light";
    }
    return win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: Theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("theme", theme);
    notify();
};

const getThemeSnapshot = (): Theme => {
    if (isServer) {
        return "light";
    }
    const stored = getStoredTheme();
    if (stored) {
        return stored;
    }
    const fromDataset = document.documentElement.dataset.theme;
    if (fromDataset === "light" || fromDataset === "dark") {
        return fromDataset;
    }
    return getSystemTheme();
};

const getThemeServerSnapshot = (): Theme => "light";

export function ThemeToggle() {
    const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);

    const [isCollapsed, setIsCollapsed] = useState(true);

    useEffect(() => {
        const storedTheme = getStoredTheme();
        if (storedTheme && document.documentElement.dataset.theme !== storedTheme) {
            applyTheme(storedTheme);
        }
    }, []);

    const handleToggle = () => {
        if (isServer) {
            return;
        }
        const nextTheme = theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    };

    return (
        <div
            className={`group inline-flex items-center gap-2 rounded-full border border-(--card-stroke) bg-(--card-80) p-1 text-label-caps font-semibold uppercase tracking-[0.2em] text-(--ink-muted) shadow-[0_12px_30px_-20px_rgba(0,0,0,0.45)] transition-all duration-300 ${
                isCollapsed ? "w-10 overflow-hidden" : "px-3 py-2"
            }`}
        >
            {!isCollapsed && (
                <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-(--accent) shadow-[0_0_12px_rgba(0,0,0,0.25)]" />
                    <button
                        type="button"
                        onClick={handleToggle}
                        aria-label="Toggle light/dark"
                        className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-1 text-label-caps font-semibold uppercase tracking-[0.2em] text-foreground transition hover:-translate-y-0.5"
                    >
                        {theme === "dark" ? "Dark" : "Light"}
                    </button>
                </>
            )}
            <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-(--card-70) ${
                    isCollapsed ? "mx-auto" : ""
                }`}
                aria-label={isCollapsed ? "Expand settings" : "Collapse settings"}
            >
                <span
                    className={`transform transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                >
                    ◀
                </span>
            </button>
        </div>
    );
}

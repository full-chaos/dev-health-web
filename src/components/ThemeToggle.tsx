"use client";

import type { ChangeEvent } from "react";
import { useEffect, useSyncExternalStore, useState } from "react";
import { isServer, getLocalStorage, getWindow } from "@/lib/env";

type Theme = "light" | "dark";
type Palette =
    | "material"
    | "echarts"
    | "fullchaos"
    | "fullchaos-cosmic-train"
    | "fullchaos-infinity-knot"
    | "fullchaos-infinity-knot-redux"
    | "flat";
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

const normalizePalette = (value: string | null): Palette | null => {
    if (value === "tailwind") {
        return "echarts";
    }
    return value === "material" ||
        value === "echarts" ||
        value === "fullchaos" ||
        value === "fullchaos-cosmic-train" ||
        value === "fullchaos-infinity-knot" ||
        value === "fullchaos-infinity-knot-redux" ||
        value === "flat"
        ? value
        : null;
};

const getStoredPalette = (): Palette | null => {
    const stored = getLocalStorage()?.getItem("palette") ?? null;
    return normalizePalette(stored);
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

const applyPalette = (palette: Palette) => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem("palette", palette);
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

const getPaletteSnapshot = (): Palette => {
    if (isServer) {
        return "fullchaos-infinity-knot-redux";
    }
    const stored = getStoredPalette();
    if (stored) {
        return stored;
    }
    const fromDataset = document.documentElement.dataset.palette ?? null;
    const normalized = normalizePalette(fromDataset);
    if (normalized) {
        return normalized;
    }
    return "fullchaos-infinity-knot-redux";
};

const getThemeServerSnapshot = (): Theme => "light";
const getPaletteServerSnapshot = (): Palette => "fullchaos-infinity-knot-redux";

export function ThemeToggle() {
    const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);
    const palette = useSyncExternalStore(subscribe, getPaletteSnapshot, getPaletteServerSnapshot);

    const [isCollapsed, setIsCollapsed] = useState(true);

    useEffect(() => {
        const storedTheme = getStoredTheme();
        if (storedTheme && document.documentElement.dataset.theme !== storedTheme) {
            applyTheme(storedTheme);
        }
        const storedPalette = getStoredPalette();
        if (storedPalette && document.documentElement.dataset.palette !== storedPalette) {
            applyPalette(storedPalette);
        }
    }, []);

    const handleToggle = () => {
        if (isServer) {
            return;
        }
        const nextTheme = theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
    };

    const handlePaletteChange = (event: ChangeEvent<HTMLSelectElement>) => {
        if (isServer) {
            return;
        }
        const nextPalette = event.target.value as Palette;
        applyPalette(nextPalette);
    };

    return (
        <div
            className={`group inline-flex items-center gap-2 rounded-full border border-(--border) bg-(--card-80) p-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted) shadow-[0_12px_30px_-20px_rgba(0,0,0,0.45)] transition-all duration-300 ${
                isCollapsed ? "w-10 overflow-hidden" : "px-3 py-2"
            }`}
        >
            {!isCollapsed && (
                <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-(--accent) shadow-[0_0_12px_rgba(0,0,0,0.25)]" />
                    <select
                        aria-label="Theme palette"
                        value={palette}
                        onChange={handlePaletteChange}
                        className="bg-transparent text-[11px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted) focus:text-foreground focus:outline-none"
                    >
                        <option value="material">Material</option>
                        <option value="echarts">ECharts</option>
                        <option value="fullchaos">Full Chaos</option>
                        <option value="fullchaos-cosmic-train">Fullchaos Cosmic Train</option>
                        <option value="fullchaos-infinity-knot">Fullchaos Infinity Knot</option>
                        <option value="fullchaos-infinity-knot-redux">Infinity Knot Redux</option>
                        <option value="flat">Flat UI</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleToggle}
                        aria-label="Toggle light/dark"
                        className="rounded-full border border-(--border) bg-(--card-70) px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:-translate-y-0.5"
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

import { useSyncExternalStore } from "react";
import { isServer } from "@/lib/env";

export const chartColors = [
    "#1b7ace",
    "#33429a",
    "#802099",
    "#007b6f",
    "#3c9040",
    "#70a13b",
    "#e09721",
    "#e27e00",
    "#dc491b",
    "#ce3330",
];

export const fallbackTheme = {
    text: "#1c1b1f",
    grid: "#e7e0ec",
    muted: "#49454f",
    background: "#ffffff",
    stroke: "#e7e0ec",
    accent1: "#3b82f6",
    accent2: "#8b5cf6",
    accent3: "#ef4444",
};

export type ChartTheme = typeof fallbackTheme;

/**
 * Status, investment-theme and quadrant-zone roles of the `infinity` palette.
 * Charts read these through `useChartTokens`; chart modules never hold a color
 * literal. Fallbacks (server render, no stylesheet) are the infinity dark values.
 */
export const fallbackTokens = {
    positive: "#63cfa6",
    caution: "#f2b84b",
    negative: "#ff8266",
    info: "#4fd3df",
    accentHighlight: "#ffab66",
    themeFeature: "#a64807",
    themeQuality: "#016e7f",
    themeRisk: "#885a00",
    themeMaintenance: "#cc1f00",
    themeOperational: "#086d86",
    /** Flame branch fills by branch order (`--flame-branch-1..5`). */
    flameBranch: ["#086d86", "#885a00", "#cc1f00", "#016e7f", "#a64807"] as readonly string[],
    zones: ["#11333c", "#13322a", "#33290f", "#3b1b15"] as readonly string[],
    /** One-hue sequential ramp, `--seq-0..5`, lightest-in-value first. */
    seq: ["#162d36", "#17566a", "#0b7691", "#0b97b6", "#22b9cd", "#8fe6ea"] as readonly string[],
};

export type ChartTokens = typeof fallbackTokens;

/**
 * Investment theme color, fixed by entity and never by rank:
 * Feature = flame, Quality = aqua, Risk = amber, Maintenance = scarlet, Operational = tide.
 * An unknown theme key returns `fallback`.
 */
export const investmentThemeColor = (
    themeKey: string,
    tokens: ChartTokens,
    fallback: string,
): string => {
    switch (themeKey) {
        case "feature_delivery":
            return tokens.themeFeature;
        case "quality":
            return tokens.themeQuality;
        case "risk":
            return tokens.themeRisk;
        case "maintenance":
            return tokens.themeMaintenance;
        case "operational":
            return tokens.themeOperational;
        default:
            return fallback;
    }
};

/**
 * The series color (`--chart-color-N`, N from 1) of each investment theme. A fill WITHOUT a label (a
 * meter bar, a rework bar) keeps the bright series color: the darker `--theme-*` fills are for tiles and
 * segments that carry a white label (CHAOS-8510), and a bar needs 3:1 against its track.
 */
const THEME_SERIES_INDEX: Record<string, number> = {
    feature_delivery: 5,
    quality: 4,
    risk: 2,
    maintenance: 3,
    operational: 1,
};

export const investmentSeriesColor = (
    themeKey: string,
    chartColors: readonly string[],
    fallback: string,
): string => {
    const n = THEME_SERIES_INDEX[themeKey];
    return n === undefined ? fallback : (chartColors[n - 1] ?? fallback);
};

const TOKEN_VARS = {
    positive: "--positive",
    caution: "--caution",
    negative: "--negative",
    info: "--info",
    accentHighlight: "--accent-highlight",
    themeFeature: "--theme-feature",
    themeQuality: "--theme-quality",
    themeRisk: "--theme-risk",
    themeMaintenance: "--theme-maintenance",
    themeOperational: "--theme-operational",
} as const;

const readTheme = (): ChartTheme => {
    if (isServer) {
        return fallbackTheme;
    }

    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--chart-text").trim() || fallbackTheme.text;
    const grid = styles.getPropertyValue("--chart-grid").trim() || fallbackTheme.grid;
    const muted = styles.getPropertyValue("--chart-muted").trim() || fallbackTheme.muted;

    const background = styles.getPropertyValue("--card").trim() || fallbackTheme.background;
    const stroke = styles.getPropertyValue("--card-stroke").trim() || fallbackTheme.stroke;
    const accent1 = styles.getPropertyValue("--accent-1").trim() || fallbackTheme.accent1;
    const accent2 = styles.getPropertyValue("--accent-2").trim() || fallbackTheme.accent2;
    const accent3 = styles.getPropertyValue("--accent-3").trim() || fallbackTheme.accent3;

    return { text, grid, muted, background, stroke, accent1, accent2, accent3 };
};

const readChartTokens = (): ChartTokens => {
    if (isServer) {
        return fallbackTokens;
    }

    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;
    const tokens = { ...fallbackTokens };
    for (const key of Object.keys(TOKEN_VARS) as (keyof typeof TOKEN_VARS)[]) {
        tokens[key] = read(TOKEN_VARS[key], fallbackTokens[key]);
    }
    tokens.flameBranch = fallbackTokens.flameBranch.map((fallback, index) =>
        read(`--flame-branch-${index + 1}`, fallback),
    );
    tokens.zones = fallbackTokens.zones.map((fallback, index) =>
        read(`--quadrant-zone-${index + 1}`, fallback),
    );
    tokens.seq = fallbackTokens.seq.map((fallback, index) => read(`--seq-${index}`, fallback));
    return tokens;
};

const readChartColors = (): string[] => {
    if (isServer) {
        return chartColors;
    }

    const styles = getComputedStyle(document.documentElement);
    return chartColors.map((fallback, index) => {
        const value = styles.getPropertyValue(`--chart-color-${index + 1}`).trim();
        return value || fallback;
    });
};

// Shared subscription store to avoid multiple MutationObservers
type ThemeStore = {
    theme: ChartTheme;
    colors: string[];
    tokens: ChartTokens;
};

let themeStore: ThemeStore = {
    theme: fallbackTheme,
    colors: chartColors,
    tokens: fallbackTokens,
};
// Export for testing
export const listeners = new Set<() => void>();
let cleanupFn: (() => void) | null = null;

// Export for testing
export const getCleanupFn = () => cleanupFn;

// Export for testing - allows resetting module state between tests
export const resetForTesting = () => {
    listeners.clear();
    if (cleanupFn) {
        cleanupFn();
    }
    cleanupFn = null;
    themeStore = { theme: fallbackTheme, colors: chartColors, tokens: fallbackTokens };
};

const notifyListeners = () => {
    listeners.forEach((listener) => listener());
};

// Export for testing
export const setupObservers = () => {
    if (isServer || cleanupFn) {
        return;
    }

    const updateStore = () => {
        themeStore = {
            theme: readTheme(),
            colors: readChartColors(),
            tokens: readChartTokens(),
        };
        notifyListeners();
    };

    // Initial read — only update store, don't notify since useSyncExternalStore
    // already reads the snapshot; notifying here causes a double render.
    themeStore = {
        theme: readTheme(),
        colors: readChartColors(),
        tokens: readChartTokens(),
    };

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(updateStore);

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-palette"],
    });

    media.addEventListener("change", updateStore);

    cleanupFn = () => {
        observer.disconnect();
        media.removeEventListener("change", updateStore);
        cleanupFn = null;
    };
};

// Export for testing
export const teardownObservers = () => {
    if (listeners.size === 0 && cleanupFn) {
        cleanupFn();
    }
};

// Export for testing
export const subscribeToTheme = (listener: () => void) => {
    listeners.add(listener);
    setupObservers();

    return () => {
        listeners.delete(listener);
        teardownObservers();
    };
};

// Export for testing
export const getThemeSnapshot = () => themeStore.theme;
// Export for testing
export const getColorsSnapshot = () => themeStore.colors;
// Export for testing
export const getTokensSnapshot = () => themeStore.tokens;
// Export for testing
export const getServerTheme = () => fallbackTheme;
// Export for testing
export const getServerColors = () => chartColors;
// Export for testing
export const getServerTokens = () => fallbackTokens;

export function useChartTheme() {
    return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerTheme);
}

export function useChartColors() {
    return useSyncExternalStore(subscribeToTheme, getColorsSnapshot, getServerColors);
}

export function useChartTokens() {
    return useSyncExternalStore(subscribeToTheme, getTokensSnapshot, getServerTokens);
}

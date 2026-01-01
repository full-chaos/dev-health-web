import { useSyncExternalStore } from "react";

export const chartColors = [
  "#1e88e5",
  "#3949ab",
  "#8e24aa",
  "#00897b",
  "#43a047",
  "#7cb342",
  "#f9a825",
  "#fb8c00",
  "#f4511e",
  "#e53935",
];

const fallbackTheme = {
  text: "#1c1b1f",
  grid: "#e7e0ec",
  muted: "#49454f",
  background: "#ffffff",
  stroke: "#e7e0ec",
  accent1: "#3b82f6",
  accent2: "#8b5cf6",
};

export type ChartTheme = typeof fallbackTheme;

const readTheme = (): ChartTheme => {
  if (typeof window === "undefined") {
    return fallbackTheme;
  }

  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue("--chart-text").trim() || fallbackTheme.text;
  const grid = styles.getPropertyValue("--chart-grid").trim() || fallbackTheme.grid;
  const muted =
    styles.getPropertyValue("--chart-muted").trim() || fallbackTheme.muted;

  const background = styles.getPropertyValue("--card").trim() || fallbackTheme.background;
  const stroke = styles.getPropertyValue("--card-stroke").trim() || fallbackTheme.stroke;
  const accent1 = styles.getPropertyValue("--accent-1").trim() || fallbackTheme.accent1;
  const accent2 = styles.getPropertyValue("--accent-2").trim() || fallbackTheme.accent2;

  return { text, grid, muted, background, stroke, accent1, accent2 };
};

const readChartColors = (): string[] => {
  if (typeof window === "undefined") {
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
};

let themeStore: ThemeStore = { theme: fallbackTheme, colors: chartColors };
const listeners = new Set<() => void>();
let cleanupFn: (() => void) | null = null;

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

const setupObservers = () => {
  if (typeof window === "undefined" || cleanupFn) {
    return;
  }

  const updateStore = () => {
    themeStore = { theme: readTheme(), colors: readChartColors() };
    notifyListeners();
  };

  // Initial read
  updateStore();

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(updateStore);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-palette"],
  });

  if (media.addEventListener) {
    media.addEventListener("change", updateStore);
  } else {
    media.addListener(updateStore);
  }

  cleanupFn = () => {
    observer.disconnect();
    if (media.removeEventListener) {
      media.removeEventListener("change", updateStore);
    } else {
      media.removeListener(updateStore);
    }
    cleanupFn = null;
  };
};

const teardownObservers = () => {
  if (listeners.size === 0 && cleanupFn) {
    cleanupFn();
  }
};

const subscribeToTheme = (listener: () => void) => {
  listeners.add(listener);
  setupObservers();

  return () => {
    listeners.delete(listener);
    teardownObservers();
  };
};

const getThemeSnapshot = () => themeStore.theme;
const getColorsSnapshot = () => themeStore.colors;
const getServerTheme = () => fallbackTheme;
const getServerColors = () => chartColors;

export function useChartTheme() {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerTheme);
}

export function useChartColors() {
  return useSyncExternalStore(subscribeToTheme, getColorsSnapshot, getServerColors);
}

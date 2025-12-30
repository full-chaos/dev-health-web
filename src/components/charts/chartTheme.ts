import { useEffect, useState } from "react";

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

export function useChartTheme() {
  const [theme, setTheme] = useState<ChartTheme>(fallbackTheme);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateTheme = () => {
      setTheme(readTheme());
    };

    updateTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media.addEventListener) {
      media.addEventListener("change", updateTheme);
      const observer = new MutationObserver(updateTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-palette"],
      });
      return () => {
        media.removeEventListener("change", updateTheme);
        observer.disconnect();
      };
    }
    media.addListener(updateTheme);
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });
    return () => {
      media.removeListener(updateTheme);
      observer.disconnect();
    };
  }, []);

  return theme;
}

export function useChartColors() {
  const [colors, setColors] = useState<string[]>(chartColors);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateColors = () => {
      setColors(readChartColors());
    };

    updateColors();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    if (media.addEventListener) {
      media.addEventListener("change", updateColors);
      const observer = new MutationObserver(updateColors);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "data-palette"],
      });
      return () => {
        media.removeEventListener("change", updateColors);
        observer.disconnect();
      };
    }
    media.addListener(updateColors);
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });
    return () => {
      media.removeListener(updateColors);
      observer.disconnect();
    };
  }, []);

  return colors;
}

import { useEffect, useState } from "react";

export const chartColors = [
  "#fe8019",
  "#b8bb26",
  "#83a598",
  "#fabd2f",
  "#d3869b",
  "#8ec07c",
  "#fb4934",
  "#928374",
  "#d65d0e",
  "#689d6a",
];

const fallbackTheme = {
  text: "#3c3836",
  grid: "#e3d5b2",
  muted: "#7c6f64",
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

  return { text, grid, muted };
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
        attributeFilter: ["data-theme"],
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
      attributeFilter: ["data-theme"],
    });
    return () => {
      media.removeListener(updateTheme);
      observer.disconnect();
    };
  }, []);

  return theme;
}

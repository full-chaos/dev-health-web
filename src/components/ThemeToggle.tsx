"use client";

import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
type Palette = "material" | "echarts" | "fullchaos" | "fullchaos-cosmic" | "flat";

const getStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : null;
};

const normalizePalette = (value: string | null): Palette | null => {
  if (value === "tailwind") {
    return "echarts";
  }
  return value === "material" ||
    value === "echarts" ||
    value === "fullchaos" ||
    value === "fullchaos-cosmic" ||
    value === "flat"
    ? value
    : null;
};

const getStoredPalette = (): Palette | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = localStorage.getItem("palette");
  return normalizePalette(stored);
};

const getSystemTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("theme", theme);
};

const applyPalette = (palette: Palette) => {
  document.documentElement.dataset.palette = palette;
  localStorage.setItem("palette", palette);
};

const getCurrentTheme = (): Theme => {
  if (typeof window === "undefined") {
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

const getCurrentPalette = (): Palette => {
  if (typeof window === "undefined") {
    return "material";
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
  return "material";
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [palette, setPalette] = useState<Palette>("material");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setTheme(getCurrentTheme());
    setPalette(getCurrentPalette());
  }, []);

  const handleToggle = () => {
    if (typeof window === "undefined") {
      return;
    }
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  const handlePaletteChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (typeof window === "undefined") {
      return;
    }
    const nextPalette = event.target.value as Palette;
    applyPalette(nextPalette);
    setPalette(nextPalette);
  };

  return (
    <div className="group inline-flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)] shadow-[0_12px_30px_-20px_rgba(0,0,0,0.45)]">
      <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_rgba(0,0,0,0.25)]" />
      <select
        aria-label="Theme palette"
        value={palette}
        onChange={handlePaletteChange}
        className="bg-transparent text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)] focus:text-[var(--foreground)] focus:outline-none"
      >
        <option value="material">Material</option>
        <option value="echarts">ECharts</option>
        <option value="fullchaos">Full Chaos</option>
        <option value="fullchaos-cosmic">Fullchaos Cosmic</option>
        <option value="flat">Flat UI</option>
      </select>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Toggle light/dark"
        className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground)] transition hover:-translate-y-0.5"
      >
        {theme === "dark" ? "Dark" : "Light"}
      </button>
    </div>
  );
}

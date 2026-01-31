"use client";

import { useSyncExternalStore } from "react";
import { SettingsSection } from "./SettingsSection";
import { isServer, getLocalStorage, getWindow } from "@/lib/env";

type Theme = "light" | "dark";
type Palette = "material" | "echarts" | "fullchaos" | "fullchaos-cosmic-train" | "flat";
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
  if (value === "tailwind") return "echarts";
  const valid: Palette[] = ["material", "echarts", "fullchaos", "fullchaos-cosmic-train", "flat"];
  return valid.includes(value as Palette) ? (value as Palette) : null;
};

const getStoredPalette = (): Palette | null => {
  const stored = getLocalStorage()?.getItem("palette") ?? null;
  return normalizePalette(stored);
};

const getSystemTheme = (): Theme => {
  const win = getWindow();
  if (!win) return "light";
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
  if (isServer) return "light";
  const stored = getStoredTheme();
  if (stored) return stored;
  const fromDataset = document.documentElement.dataset.theme;
  if (fromDataset === "light" || fromDataset === "dark") return fromDataset;
  return getSystemTheme();
};

const getPaletteSnapshot = (): Palette => {
  if (isServer) return "fullchaos";
  const stored = getStoredPalette();
  if (stored) return stored;
  const fromDataset = document.documentElement.dataset.palette ?? null;
  const normalized = normalizePalette(fromDataset);
  return normalized ?? "fullchaos";
};

const getThemeServerSnapshot = (): Theme => "light";
const getPaletteServerSnapshot = (): Palette => "fullchaos";

const PALETTES: { value: Palette; label: string }[] = [
  { value: "fullchaos", label: "Full Chaos" },
  { value: "fullchaos-cosmic-train", label: "Cosmic Train" },
  { value: "material", label: "Material" },
  { value: "echarts", label: "ECharts" },
  { value: "flat", label: "Flat UI" },
];

export function PreferencesSettings() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getThemeServerSnapshot);
  const palette = useSyncExternalStore(subscribe, getPaletteSnapshot, getPaletteServerSnapshot);

  return (
    <SettingsSection
      title="Preferences"
      description="Customize your display settings. These preferences are stored locally in your browser."
    >
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-(--foreground) mb-2">
            Theme
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => applyTheme("light")}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                theme === "light"
                  ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                  : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
              }`}
            >
              <span className="block text-lg mb-1">☀️</span>
              Light
            </button>
            <button
              type="button"
              onClick={() => applyTheme("dark")}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                theme === "dark"
                  ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                  : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
              }`}
            >
              <span className="block text-lg mb-1">🌙</span>
              Dark
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-(--foreground) mb-2">
            Color Palette
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PALETTES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => applyPalette(p.value)}
                className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  palette === p.value
                    ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                    : "border-(--card-stroke) bg-(--card-70) text-(--ink-muted) hover:border-(--accent)/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

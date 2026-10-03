// The theme preference: one store for the top-bar toggle and the Settings page (CHAOS-8244).
//
// Stored value (`localStorage.theme`): "light", "dark" or "system". Nothing stored = the product
// default, dark (`DEFAULT_THEME`). "system" follows `prefers-color-scheme` live. `public/theme-init.js`
// resolves the same values before first paint; keep the two in step.
import { getLocalStorage, getWindow, isServer } from "@/lib/env";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

/** Dark is the default theme; `public/theme-init.js` and the root layout agree. */
export const DEFAULT_THEME: Theme = "dark";
const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeTheme = (listener: Listener) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const notify = () => {
    listeners.forEach((listener) => listener());
};

/** The stored choice, or null when nothing (or something unknown) is stored. */
export const getStoredPreference = (): ThemePreference | null => {
    const stored = getLocalStorage()?.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : null;
};

/** The operating system's current choice. Light when it cannot be read. */
export const getSystemTheme = (): Theme => {
    const win = getWindow();
    if (!win || typeof win.matchMedia !== "function") return "light";
    return win.matchMedia(DARK_QUERY).matches ? "dark" : "light";
};

/** The theme to draw for a stored choice; null (nothing stored) is the product default. */
export const resolveTheme = (preference: ThemePreference | null): Theme =>
    preference === "system" ? getSystemTheme() : (preference ?? DEFAULT_THEME);

const paint = (theme: Theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
};

/** Store a choice (when storage allows) and draw it. */
export const applyPreference = (preference: ThemePreference) => {
    paint(resolveTheme(preference));
    try {
        localStorage.setItem(STORAGE_KEY, preference);
    } catch {
        /* storage unavailable: the choice lasts for this page view only */
    }
    notify();
};

/** The theme now drawn, for rendering: the stored choice resolved; else the page's own; else dark. */
export const getThemeSnapshot = (): Theme => {
    if (isServer) return DEFAULT_THEME;
    const stored = getStoredPreference();
    if (stored) return resolveTheme(stored);
    const fromDataset = document.documentElement.dataset.theme;
    return fromDataset === "light" || fromDataset === "dark" ? fromDataset : DEFAULT_THEME;
};

export const getThemeServerSnapshot = (): Theme => DEFAULT_THEME;

export const getPreferenceSnapshot = (): ThemePreference | null =>
    isServer ? null : getStoredPreference();

export const getPreferenceServerSnapshot = (): ThemePreference | null => null;

/**
 * While the stored choice is "system": draw the stored choice at once, and again whenever the
 * operating system changes. Returns the cleanup. Does nothing for "light", "dark" or nothing stored.
 */
export const followSystemTheme = (): (() => void) => {
    const win = getWindow();
    if (!win || getStoredPreference() !== "system") return () => {};
    paint(getSystemTheme());
    notify();
    const query = typeof win.matchMedia === "function" ? win.matchMedia(DARK_QUERY) : null;
    if (!query) return () => {};
    const onChange = () => {
        if (getStoredPreference() !== "system") return;
        paint(getSystemTheme());
        notify();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
};

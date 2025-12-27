"use client";

type Theme = "light" | "dark";

const getStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : null;
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

export function ThemeToggle() {
  const handleToggle = () => {
    if (typeof window === "undefined") {
      return;
    }
    const currentTheme = getCurrentTheme();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label="Toggle theme"
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)] shadow-[0_12px_30px_-20px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:text-[var(--foreground)]"
    >
      <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_rgba(0,0,0,0.25)]" />
      <span>Theme</span>
    </button>
  );
}

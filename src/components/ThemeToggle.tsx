"use client";

import { useEffect, useState } from "react";

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateTheme = () => {
      const stored = getStoredTheme();
      const nextTheme = stored ?? getSystemTheme();
      setTheme(nextTheme);
      if (stored) {
        document.documentElement.dataset.theme = stored;
        document.documentElement.style.colorScheme = stored;
      }
    };

    updateTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMedia = () => {
      if (!getStoredTheme()) {
        setTheme(getSystemTheme());
      }
    };
    if (media.addEventListener) {
      media.addEventListener("change", handleMedia);
    } else {
      media.addListener(handleMedia);
    }

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      if (media.addEventListener) {
        media.removeEventListener("change", handleMedia);
      } else {
        media.removeListener(handleMedia);
      }
      observer.disconnect();
    };
  }, []);

  const handleToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={theme === "dark"}
      aria-label="Toggle theme"
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-muted)] shadow-[0_12px_30px_-20px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:text-[var(--foreground)]"
    >
      <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_rgba(0,0,0,0.25)]" />
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

// Synchronous theme initialiser — runs before first paint to prevent FOUC.
// Infinity is the only palette: any stored palette (including removed legacy
// names) resolves to it. Reads the persisted theme from localStorage.
(function () {
  document.documentElement.dataset.palette = "infinity";
  try {
    var storedTheme = localStorage.getItem("theme");
    // "system" follows the operating system (resolved here before first paint, then followed live by
    // ThemeToggle). Nothing stored keeps the page's own default (dark).
    if (storedTheme === "system") {
      storedTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
      document.documentElement.style.colorScheme = storedTheme;
    }
  } catch { /* localStorage unavailable */ }
})();

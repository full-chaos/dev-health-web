// Synchronous theme initialiser — runs before first paint to prevent FOUC.
// Infinity is the only palette: any stored palette (including removed legacy
// names) resolves to it. Reads the persisted theme from localStorage.
(function () {
  document.documentElement.dataset.palette = "infinity";
  try {
    var storedTheme = localStorage.getItem("theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
      document.documentElement.style.colorScheme = storedTheme;
    }
  } catch { /* localStorage unavailable */ }
})();

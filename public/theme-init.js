// Synchronous theme initialiser — runs before first paint to prevent FOUC.
// Reads persisted theme/palette from localStorage and applies them to <html>.
(function () {
  try {
    var storedTheme = localStorage.getItem("theme");
    var storedPalette = localStorage.getItem("palette");
    var normalizedPalette =
      storedPalette === "tailwind" ? "echarts" : storedPalette;
    if (
      normalizedPalette === "material" ||
      normalizedPalette === "echarts" ||
      normalizedPalette === "fullchaos" ||
      normalizedPalette === "fullchaos-cosmic-train" ||
      normalizedPalette === "fullchaos-infinity-knot" ||
      normalizedPalette === "flat"
    ) {
      document.documentElement.dataset.palette = normalizedPalette;
    }
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
      document.documentElement.style.colorScheme = storedTheme;
    }
  } catch { /* localStorage unavailable */ }
})();

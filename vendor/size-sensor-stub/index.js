"use strict";
/**
 * Local stub for `size-sensor`, installed via npm `overrides` to neutralize
 * the upstream malware advisory GHSA-gx6x-v325-85g4. Exposes only the API
 * surface consumed by echarts-for-react (`bind` / `clear`) using the native
 * `ResizeObserver` available in all modern browsers and JSDOM via polyfill.
 *
 * No telemetry, no network, no eval. SSR-safe (returns early when the DOM is
 * unavailable).
 */

var observers =
  typeof WeakMap !== "undefined" ? new WeakMap() : null;

function bind(element, callback) {
  if (!element || typeof callback !== "function") return function () {};
  if (typeof ResizeObserver === "undefined") return function () {};
  var ro = new ResizeObserver(function () {
    try {
      callback(element);
    } catch (_err) {
      // Swallow callback errors to match size-sensor's tolerant behaviour.
    }
  });
  ro.observe(element);
  if (observers) observers.set(element, ro);
  return function () {
    clear(element);
  };
}

function clear(element) {
  if (!observers || !element) return;
  var ro = observers.get(element);
  if (ro) {
    try {
      ro.disconnect();
    } catch (_err) {
      // ignore
    }
    observers.delete(element);
  }
}

function getElementSize(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    return { width: 0, height: 0 };
  }
  var rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

exports.bind = bind;
exports.clear = clear;
exports.getElementSize = getElementSize;
exports.default = { bind: bind, clear: clear, getElementSize: getElementSize };

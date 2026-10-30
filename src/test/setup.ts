import "@testing-library/jest-dom";
import { JSDOM } from "jsdom";

// Node 26 ships a global `localStorage` accessor that yields `undefined` unless
// `--localstorage-file` is given. Vitest's jsdom environment does not overwrite
// an existing global, so `window.localStorage` is undefined and
// `window.localStorage.clear()` throws (CHAOS-12144). When the environment did
// not provide a complete Storage, install a real jsdom one. A no-op on Node
// versions whose jsdom environment already provides it (CI's Node 22).
function ensureWebStorage(name: "localStorage" | "sessionStorage"): void {
    if (typeof window === "undefined") return;
    let present = false;
    try {
        present = typeof window[name]?.clear === "function";
    } catch {
        present = false;
    }
    if (present) return;
    const { window: donor } = new JSDOM("", { url: "http://localhost/" });
    Object.defineProperty(window, name, { value: donor[name], configurable: true, writable: true });
    Object.defineProperty(globalThis, name, {
        value: donor[name],
        configurable: true,
        writable: true,
    });
}

ensureWebStorage("localStorage");
ensureWebStorage("sessionStorage");

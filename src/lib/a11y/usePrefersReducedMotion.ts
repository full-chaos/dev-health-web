"use client";

import { useSyncExternalStore } from "react";

/**
 * `true` while the reader asks for reduced motion (`prefers-reduced-motion: reduce`), following
 * changes live (CHAOS-11942, E8 design §7.1: Ask Dev charts turn animation off). `false` on the
 * server and where `matchMedia` is missing.
 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function query(): MediaQueryList | null {
    return typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? null
        : window.matchMedia(REDUCED_MOTION_QUERY);
}

function subscribe(onChange: () => void): () => void {
    const list = query();
    if (list === null) return () => undefined;
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
}

const snapshot = (): boolean => query()?.matches ?? false;
const serverSnapshot = (): boolean => false;

export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

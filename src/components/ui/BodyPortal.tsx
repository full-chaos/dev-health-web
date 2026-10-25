"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renders modal chrome at `document.body`. A `position: fixed` box is contained by the nearest
 * ancestor with a `backdrop-filter`, `transform` or `filter` (the sticky top bar blurs), which clips
 * a backdrop to that ancestor. Nothing on the server: the first client render matches it.
 */
export function usePortalMounted() {
    return useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    );
}

export function BodyPortal({ children }: { children: ReactNode }) {
    const mounted = usePortalMounted();
    return mounted ? createPortal(children, document.body) : null;
}

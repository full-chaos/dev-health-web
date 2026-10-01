"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const focusableIn = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

type UseModalFocusOptions = {
    open: boolean;
    /** The dialog element; focus is kept inside it. It should have `tabIndex={-1}`. */
    panelRef: RefObject<HTMLElement | null>;
    /** Gets focus when the dialog opens. Defaults to the panel itself. */
    initialFocusRef?: RefObject<HTMLElement | null>;
    /** Gets focus when the dialog closes. Defaults to the element that was focused on open. */
    returnFocusRef?: RefObject<HTMLElement | null>;
    /** Escape. Not called when an inner control already handled Escape (`event.defaultPrevented`). */
    onEscape: () => void;
};

/**
 * Modal focus behaviour shared by drawers and dialogs: focus moves in on open, Tab and Shift+Tab
 * stay inside, Escape closes (unless an inner menu took it first), and focus returns to the
 * opener on close. Returns the `onKeyDown` for the dialog element (the Tab trap).
 */
export function useModalFocus({
    open,
    panelRef,
    initialFocusRef,
    returnFocusRef,
    onEscape,
}: UseModalFocusOptions) {
    const escapeRef = useRef(onEscape);
    useEffect(() => {
        escapeRef.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        (initialFocusRef?.current ?? panelRef.current)?.focus();

        const onDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            event.preventDefault();
            escapeRef.current();
        };
        document.addEventListener("keydown", onDocumentKeyDown);

        return () => {
            document.removeEventListener("keydown", onDocumentKeyDown);
            // Read at close on purpose: the caller may point the ref at a node that mounted later.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const target = returnFocusRef?.current ?? opener;
            if (target && document.contains(target)) target.focus();
        };
        // The refs are stable objects; only `open` should restart this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
        if (event.key !== "Tab") return;
        const container = panelRef.current;
        if (!container) return;
        const focusable = focusableIn(container);
        if (focusable.length === 0) {
            event.preventDefault();
            container.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
            if (active === first || active === container) {
                event.preventDefault();
                last.focus();
            }
        } else if (active === last || active === container) {
            event.preventDefault();
            first.focus();
        }
    };
}

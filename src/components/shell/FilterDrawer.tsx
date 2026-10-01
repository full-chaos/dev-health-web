"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

type FilterDrawerProps = {
    /** Id of the panel; the Filters button points at it with `aria-controls`. */
    id: string;
    /**
     * `drawer`: a modal panel on the right (from the `md` breakpoint up).
     * `inline`: a panel under the bar, as the filter bar had it (below `md`).
     */
    mode: "drawer" | "inline";
    /** Close request from the Close button or the backdrop. */
    onClose: () => void;
    /** Escape. Defaults to `onClose`; the owner can close an inner menu first. */
    onEscape?: () => void;
    children: ReactNode;
};

/**
 * The advanced filters of the scope bar. Changes apply at once; there is no
 * Apply or Cancel.
 *
 * As a drawer it is a modal dialog: focus moves in on open, Tab and Shift+Tab
 * stay inside, and Escape, the Close button and the backdrop close it. The
 * owner returns focus to the Filters button.
 */
export function FilterDrawer({ id, mode, onClose, onEscape, children }: FilterDrawerProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const titleId = `${id}-title`;

    const escapeRef = useRef(onEscape ?? onClose);

    useEffect(() => {
        escapeRef.current = onEscape ?? onClose;
    }, [onClose, onEscape]);

    useEffect(() => {
        if (mode === "drawer") closeRef.current?.focus();
    }, [mode]);

    // A modal drawer closes on Escape wherever focus sits.
    useEffect(() => {
        if (mode !== "drawer") return;
        function handleDocumentKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            event.preventDefault();
            escapeRef.current();
        }
        document.addEventListener("keydown", handleDocumentKeyDown);
        return () => document.removeEventListener("keydown", handleDocumentKeyDown);
    }, [mode]);

    // Focus must not sit outside a modal drawer. When the focused control goes
    // away (an inner menu closes), focus comes back to the drawer.
    useEffect(() => {
        if (mode !== "drawer") return;
        const panel = panelRef.current;
        if (panel && !panel.contains(document.activeElement)) panel.focus();
    });

    function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            // The drawer handles Escape on the document; the inline panel here.
            if (mode === "drawer") return;
            event.preventDefault();
            event.stopPropagation();
            (onEscape ?? onClose)();
            return;
        }
        if (mode !== "drawer" || event.key !== "Tab") return;
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
    }

    const header = (
        <div className="flex items-start justify-between gap-4">
            <div>
                <h2 id={titleId} className="text-h3 font-semibold text-(--text-primary)">
                    {CTA_LABELS.filters}
                </h2>
                <p className="mt-1 text-xs text-(--text-secondary)">Changes apply at once.</p>
            </div>
            <button
                type="button"
                ref={closeRef}
                onClick={onClose}
                className="rounded-(--radius-sm) border border-(--border) px-3 py-1.5 text-xs font-medium text-(--text-primary) transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
            >
                {CTA_LABELS.close}
            </button>
        </div>
    );

    if (mode === "inline") {
        return (
            <div
                id={id}
                ref={panelRef}
                role="region"
                aria-labelledby={titleId}
                data-testid="filter-drawer"
                data-mode="inline"
                onKeyDown={handleKeyDown}
                className="mt-3 flex flex-col gap-4 border-t border-(--border) pt-3"
            >
                {header}
                {children}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                aria-hidden="true"
                data-testid="filter-drawer-backdrop"
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />
            <div
                id={id}
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                data-testid="filter-drawer"
                data-mode="drawer"
                onKeyDown={handleKeyDown}
                className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-(--border) bg-(--surface) p-5 shadow-(--elevation-drawer) focus:outline-none"
            >
                {header}
                {children}
            </div>
        </div>
    );
}

"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { useModalFocus } from "@/lib/a11y/useModalFocus";

type DialogProps = {
    open: boolean;
    onCloseAction: () => void;
    /** The accessible name (also shown as the heading unless `hideTitle`). */
    title: string;
    hideTitle?: boolean;
    /** Gets focus when the dialog opens. Defaults to the dialog itself. */
    initialFocusRef?: RefObject<HTMLElement | null>;
    "data-testid"?: string;
    children: ReactNode;
};

/**
 * A centered modal dialog (design-system Part E), the sibling of `Drawer`: same backdrop, same
 * focus behaviour (`useModalFocus`: focus in, Tab trap, Escape, focus returns to the opener) and
 * the page does not scroll behind it. A shell only; the caller renders the body.
 */
export function Dialog({
    open,
    onCloseAction,
    title,
    hideTitle = false,
    initialFocusRef,
    "data-testid": testId,
    children,
}: DialogProps) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    const onKeyDown = useModalFocus({
        open,
        panelRef,
        initialFocusRef,
        onEscape: onCloseAction,
    });

    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
            <div
                aria-hidden="true"
                data-testid="dialog-backdrop"
                className="absolute inset-0 bg-black/40"
                onClick={onCloseAction}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                data-testid={testId ?? "dialog"}
                onKeyDown={onKeyDown}
                className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-(--surface) shadow-(--elevation-drawer) focus:outline-none"
            >
                <h2
                    id={titleId}
                    className={hideTitle ? "sr-only" : "px-5 pt-4 text-h3 font-semibold"}
                >
                    {title}
                </h2>
                {children}
            </div>
        </div>
    );
}

"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { useModalFocus } from "@/lib/a11y/useModalFocus";
import { CTA_LABELS } from "@/lib/design/cta";

type DrawerProps = {
    open: boolean;
    onCloseAction: () => void;
    title: string;
    /** Small caps line above the title (for example "Evidence"). */
    eyebrow?: string;
    /** `default` 450px, `wide` 780px (for example a table or a PR explorer). Both capped at 94vw. */
    size?: "default" | "wide";
    /** Actions row at the bottom (for example "Open in Explore"). */
    footer?: ReactNode;
    /** Gets focus on close. Defaults to the element that was focused when the drawer opened. */
    returnFocusRef?: RefObject<HTMLElement | null>;
    "data-testid"?: string;
    children: ReactNode;
};

/**
 * The shared right-hand drawer (design-system Part E). A shell only: it fetches nothing and holds
 * no evidence logic; the caller renders the body. Modal dialog: `role="dialog"`, focus moves to
 * Close on open, Tab stays inside, Escape and the backdrop close it (Escape is skipped when an
 * inner menu already handled it), focus returns to the opener, and the page does not scroll
 * behind it.
 */
export function Drawer({
    open,
    onCloseAction,
    title,
    eyebrow,
    size = "default",
    footer,
    returnFocusRef,
    "data-testid": testId,
    children,
}: DrawerProps) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    const onKeyDown = useModalFocus({
        open,
        panelRef,
        initialFocusRef: closeRef,
        returnFocusRef,
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
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                aria-hidden="true"
                data-testid="drawer-backdrop"
                className="absolute inset-0 bg-black/40"
                onClick={onCloseAction}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                data-testid={testId ?? "drawer"}
                data-size={size}
                onKeyDown={onKeyDown}
                className={`relative flex h-full w-full max-w-[94vw] flex-col border-l border-(--card-stroke) bg-(--surface) shadow-(--elevation-drawer) animate-in slide-in-from-right-4 duration-200 focus:outline-none motion-reduce:animate-none ${
                    size === "wide" ? "sm:w-195" : "sm:w-112.5"
                }`}
            >
                <header className="flex items-start gap-4 border-b border-(--card-stroke) p-6">
                    <div className="min-w-0 flex-1">
                        {eyebrow && (
                            <p className="text-label-caps uppercase text-(--ink-muted)">
                                {eyebrow}
                            </p>
                        )}
                        <h2 id={titleId} className="mt-1 text-h2 font-semibold text-foreground">
                            {title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        ref={closeRef}
                        onClick={onCloseAction}
                        className="rounded-(--radius-sm) border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                    >
                        {CTA_LABELS.close}
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto p-6">{children}</div>
                {footer && (
                    <footer className="flex flex-wrap gap-2 border-t border-(--card-stroke) px-6 py-4.5">
                        {footer}
                    </footer>
                )}
            </div>
        </div>
    );
}

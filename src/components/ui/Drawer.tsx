"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

import { BodyPortal, usePortalMounted } from "@/components/ui/BodyPortal";
import { useModalFocus } from "@/lib/a11y/useModalFocus";
import type { RightDrawerOwner } from "@/lib/shell/rightDrawer";
import { useRightDrawerClaim } from "@/lib/shell/useRightDrawerClaim";
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
    /**
     * Whether it takes the right edge while open, so no other right drawer is open with it. On by
     * default. Off for a drawer whose owner claims the edge itself (Ask Dev, the evidence drawer).
     */
    claimsRightEdge?: boolean;
    /** The `id` of the dialog, for a control that points at it with `aria-controls`. */
    panelId?: string;
    "data-testid"?: string;
    children: ReactNode;
};

/**
 * The shared right-hand drawer (design-system Part E). A shell only: it fetches nothing and holds
 * no evidence logic; the caller renders the body. Modal dialog: `role="dialog"`, focus moves to
 * Close on open, Tab stays inside, Escape and the backdrop close it (Escape is skipped when an
 * inner menu already handled it), focus returns to the opener, and the page does not scroll
 * behind it. The close control is an icon-only button named "Close".
 */
export function Drawer({
    open,
    onCloseAction,
    title,
    eyebrow,
    size = "default",
    footer,
    returnFocusRef,
    claimsRightEdge = true,
    panelId,
    "data-testid": testId,
    children,
}: DrawerProps) {
    const titleId = useId();
    const edgeOwner: RightDrawerOwner = `drawer:${titleId}`;
    useRightDrawerClaim(edgeOwner, open && claimsRightEdge, onCloseAction);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    // The panel exists only once the portal has mounted; focus must wait for it.
    const portalMounted = usePortalMounted();
    const onKeyDown = useModalFocus({
        open: open && portalMounted,
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
        <BodyPortal>
            <div className="fixed inset-0 z-50 flex justify-end">
                <div
                    aria-hidden="true"
                    data-testid="drawer-backdrop"
                    className="absolute inset-0 bg-black/40"
                    onClick={onCloseAction}
                />
                <div
                    ref={panelRef}
                    id={panelId}
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
                    {/* A `div`, not a `header`: inside a dialog it would count as a second banner landmark. */}
                    <div className="flex items-start gap-4 border-b border-(--card-stroke) p-6">
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
                        {/* Approved prototype `.btn.circle` (app.js:121): an icon-only close control, 35px
                            square, 6px radius. The accessible name stays "Close". */}
                        <button
                            type="button"
                            ref={closeRef}
                            onClick={onCloseAction}
                            aria-label={CTA_LABELS.close}
                            data-testid="drawer-close"
                            className="inline-flex h-8.75 w-8.75 shrink-0 items-center justify-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                        >
                            <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">{children}</div>
                    {footer && (
                        <footer className="flex flex-wrap gap-2 border-t border-(--card-stroke) px-6 py-4.5">
                            {footer}
                        </footer>
                    )}
                </div>
            </div>
        </BodyPortal>
    );
}

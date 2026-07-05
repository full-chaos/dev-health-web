"use client";

import {
    useEffect,
    useId,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";

import { CTA_LABELS, type CtaLabel } from "@/lib/design/cta";

export type ConfirmDialogTone = "default" | "destructive";

type ConfirmDialogProps = {
    isOpen: boolean;
    title: string;
    description?: ReactNode;
    /** Visual emphasis for irreversible/safety-critical actions. */
    tone?: ConfirmDialogTone;
    confirmLabel?: CtaLabel;
    cancelLabel?: CtaLabel;
    isPending?: boolean;
    /**
     * When set, the confirm action stays disabled until the user types this
     * exact string into the confirmation field (DeletionPlanPreview pattern).
     */
    requiredConfirmationText?: string;
    onConfirmAction: () => void;
    /** Fired by the Cancel button, the backdrop, and Escape — never by confirm. */
    onCancelAction: () => void;
};

const TONE_CLASSNAME: Record<ConfirmDialogTone, string> = {
    default: "bg-(--accent) text-white hover:bg-(--accent)/90",
    destructive: "bg-(--negative) text-white hover:bg-(--negative)/90",
};

/** Focusable candidates considered for the Tab/Shift+Tab trap (backdrop excluded via tabIndex={-1}). */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Accessible modal confirmation dialog for destructive/safety-critical
 * admin actions (shared primitive, CHAOS-2845 Foundations lane).
 *
 * Cancel, the backdrop, and Escape all resolve to {@link onCancelAction};
 * only the confirm button can ever fire {@link onConfirmAction}.
 */
export function ConfirmDialog({
    isOpen,
    title,
    description,
    tone = "default",
    confirmLabel = CTA_LABELS.confirm,
    cancelLabel = CTA_LABELS.cancel,
    isPending = false,
    requiredConfirmationText,
    onConfirmAction,
    onCancelAction,
}: ConfirmDialogProps) {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCancelActionRef = useRef(onCancelAction);
    const [typedText, setTypedText] = useState("");
    const [wasOpen, setWasOpen] = useState(isOpen);

    // Reset the typed-confirmation draft when the dialog transitions open —
    // adjusting state during render (React's documented pattern) rather than
    // in an effect, since this is deriving state from a prop change, not
    // synchronizing with an external system.
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setTypedText("");
        }
    }

    useEffect(() => {
        onCancelActionRef.current = onCancelAction;
    }, [onCancelAction]);

    // Modal a11y: move focus into the dialog on open, restore it on close, and
    // close on Escape regardless of where focus currently sits (BackfillWizard
    // pattern, CHAOS-2796).
    useEffect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCancelActionRef.current();
        }
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [isOpen]);

    // Focus trap: Tab from the last focusable element wraps to the first,
    // and Shift+Tab from the first wraps to the last, so focus can never
    // escape past the backdrop while the dialog is open.
    function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        if (event.key !== "Tab") return;
        const container = dialogRef.current;
        if (!container) return;
        const focusable = getFocusableElements(container);
        if (focusable.length === 0) return;
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

    if (!isOpen) {
        return null;
    }

    const confirmationRequired = requiredConfirmationText !== undefined;
    const confirmationBlocked = confirmationRequired && typedText !== requiredConfirmationText;
    const confirmDisabled = isPending || confirmationBlocked;
    const confirmInputId = `${titleId}-confirm-text`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                tabIndex={-1}
                aria-label={cancelLabel}
                onClick={onCancelAction}
                className="absolute inset-0 bg-black/50"
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onKeyDown={handleDialogKeyDown}
                className="relative z-10 w-full max-w-md rounded-2xl border border-(--card-stroke) bg-(--background) p-6 shadow-2xl focus:outline-none"
            >
                <h3 id={titleId} className="text-h2 text-foreground">
                    {title}
                </h3>
                {description ? (
                    <div className="mt-2 text-sm text-(--ink-muted)">{description}</div>
                ) : null}

                {confirmationRequired ? (
                    <div className="mt-4">
                        <label
                            htmlFor={confirmInputId}
                            className="mb-1.5 block text-sm text-foreground"
                        >
                            Type <strong>{requiredConfirmationText}</strong> to confirm:
                        </label>
                        <input
                            id={confirmInputId}
                            type="text"
                            value={typedText}
                            onChange={(event) => setTypedText(event.target.value)}
                            disabled={isPending}
                            placeholder={requiredConfirmationText}
                            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--negative) focus:outline-none focus:ring-1 focus:ring-(--negative) disabled:opacity-50"
                        />
                    </div>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancelAction}
                        disabled={isPending}
                        className="rounded-lg border border-(--card-stroke) px-3 py-1.5 text-sm text-foreground hover:bg-(--card-70) disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirmAction}
                        disabled={confirmDisabled}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${TONE_CLASSNAME[tone]}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

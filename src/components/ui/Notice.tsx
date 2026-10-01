import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";

import { CTA_LABELS } from "@/lib/design/cta";

/**
 * The one inline notice (design-system Part E). Replaces ad-hoc banners.
 *
 * - `info`: neutral context ("data arriving", "setup pending").
 * - `warn`: reads as provisional or needs care ("limited history", "trial ends").
 * - `good`: a confirmed healthy or complete state.
 *
 * Status color is never the only signal: each variant has its own icon and a
 * screen-reader label ("Information", "Warning", "OK") ahead of the content.
 *
 * Live region: by default a notice is `role="status"` / `aria-live="polite"`,
 * so a notice that appears after load is announced. Pass `live={false}` for a
 * notice that is part of the initial page (no role, not announced).
 */
export type NoticeVariant = "info" | "warn" | "good";

const VARIANTS: Record<
    NoticeVariant,
    { label: string; Icon: typeof Info; surface: string; accent: string }
> = {
    info: {
        label: "Information",
        Icon: Info,
        surface:
            "border-[color-mix(in_srgb,var(--info)_28%,var(--card-stroke))] bg-[color-mix(in_srgb,var(--info)_8%,var(--card))]",
        accent: "text-(--info)",
    },
    warn: {
        label: "Warning",
        Icon: TriangleAlert,
        surface:
            "border-[color-mix(in_srgb,var(--caution)_32%,var(--card-stroke))] bg-[color-mix(in_srgb,var(--caution)_10%,var(--card))]",
        accent: "text-(--caution)",
    },
    good: {
        label: "OK",
        Icon: CircleCheck,
        surface:
            "border-[color-mix(in_srgb,var(--positive)_28%,var(--card-stroke))] bg-[color-mix(in_srgb,var(--positive)_8%,var(--card))]",
        accent: "text-(--positive)",
    },
};

const STRONG: Record<NoticeVariant, string> = {
    info: "border-transparent bg-(--info) text-black",
    warn: "border-transparent bg-(--caution) text-black",
    good: "border-transparent bg-(--positive) text-black",
};

export type NoticeProps = Omit<ComponentPropsWithoutRef<"div">, "title" | "role"> & {
    variant?: NoticeVariant;
    title?: ReactNode;
    /** Element for the title; use a heading where the notice is a page section. */
    titleAs?: "p" | "h2" | "h3";
    /** Optional trailing action (a link or button). */
    action?: ReactNode;
    /** When set, renders a dismiss button that calls it. */
    onDismiss?: () => void;
    dismissLabel?: string;
    /** `true` (default): `role="status"` + `aria-live="polite"`. `false`: no live region. */
    live?: boolean;
    /** `strong`: solid status fill for security-relevant strips (for example impersonation). */
    emphasis?: "default" | "strong";
    /** Center title and action in the row; the dismiss button is pinned to the far right. */
    centered?: boolean;
};

export function Notice({
    variant = "info",
    title,
    titleAs: TitleTag = "p",
    action,
    onDismiss,
    dismissLabel = CTA_LABELS.dismiss,
    live = true,
    emphasis = "default",
    centered = false,
    className = "",
    children,
    ...rest
}: NoticeProps) {
    const base = VARIANTS[variant];
    const { label, Icon } = base;
    const strong = emphasis === "strong";
    const surface = strong ? STRONG[variant] : base.surface;
    const accent = strong ? "text-current" : base.accent;
    return (
        <div
            {...(live ? { role: "status", "aria-live": "polite" as const } : {})}
            data-notice-variant={variant}
            className={`${centered ? "relative justify-center pr-12 " : ""}flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${strong ? "" : "text-foreground"} ${surface} ${className}`}
            {...rest}
        >
            <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${accent}`} />
            <div className={`min-w-0 ${centered ? "" : "flex-1"}`}>
                <span className="sr-only">{label}: </span>
                {title ? <TitleTag className={`font-semibold ${accent}`}>{title}</TitleTag> : null}
                {children ? (
                    <div className={`${title ? "mt-1 " : ""}${strong ? "" : "text-(--ink-muted)"}`}>
                        {children}
                    </div>
                ) : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
            {onDismiss ? (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                    className={`${centered ? "absolute right-4 top-1/2 -translate-y-1/2 " : ""}shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100`}
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            ) : null}
        </div>
    );
}

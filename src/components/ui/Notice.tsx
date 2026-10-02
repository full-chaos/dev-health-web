import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from "lucide-react";

import { CTA_LABELS } from "@/lib/design/cta";

/**
 * The one inline notice (design-system Part E). Replaces ad-hoc banners.
 *
 * - `info`: neutral context ("data arriving", "setup pending").
 * - `warn`: reads as provisional or needs care ("limited history", "trial ends").
 * - `good`: a confirmed healthy or complete state.
 * - `danger`: something failed or was refused ("could not save", "request failed").
 *
 * Status color is never the only signal: each variant has its own icon and a
 * screen-reader label ("Information", "Warning", "OK", "Error") ahead of the content.
 *
 * Live region: by default a notice is `role="status"` / `aria-live="polite"`,
 * so a notice that appears after load is announced. `danger` is `role="alert"`
 * (assertive). Pass `live={false}` for a notice that is part of the initial page
 * (no role, not announced).
 */
export type NoticeVariant = "info" | "warn" | "good" | "danger";

const VARIANTS: Record<
    NoticeVariant,
    { label: string; Icon: typeof Info; surface: string; accent: string }
> = {
    info: {
        label: "Information",
        Icon: Info,
        surface: "border-transparent bg-(--surface2)",
        accent: "text-(--info)",
    },
    warn: {
        label: "Warning",
        Icon: TriangleAlert,
        surface: "border-transparent bg-(--caution-wash)",
        accent: "text-(--caution)",
    },
    good: {
        label: "OK",
        Icon: CircleCheck,
        surface: "border-transparent bg-(--positive-wash)",
        accent: "text-(--positive)",
    },
    danger: {
        label: "Error",
        Icon: OctagonAlert,
        surface: "border-transparent bg-(--negative-wash)",
        accent: "text-(--negative)",
    },
};

/**
 * Solid fill for security-relevant strips. Warn only (an info or good notice
 * keeps its tinted surface). Production's impersonation strip drew a bright
 * amber fill with black ink in both themes; the theme tokens `--caution-solid` and
 * `--on-caution-solid` hold that same pair (black on the fill = 9.84:1; `#fe9a00` is what Tailwind 4 renders for amber-500), because
 * the theme `--caution` token is a dark text color in light and fails as a fill.
 */
const STRONG_WARN = "border-transparent bg-(--caution-solid) text-(--on-caution-solid)";

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
    /** `true` (default): `role="status"` + `aria-live="polite"` (`danger`: `role="alert"`). `false`: no live region. */
    live?: boolean;
    /** `strong`: solid amber fill with black ink; applies to `warn` only (for example impersonation). */
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
    const strong = emphasis === "strong" && variant === "warn";
    const surface = strong ? STRONG_WARN : base.surface;
    const accent = strong ? "text-current" : base.accent;
    return (
        <div
            {...(live
                ? variant === "danger"
                    ? { role: "alert" }
                    : { role: "status", "aria-live": "polite" as const }
                : {})}
            data-notice-variant={variant}
            className={`${centered ? "relative justify-center pr-12 " : ""}flex items-start gap-3 rounded-(--radius-sm) border px-4 py-3 text-sm ${strong ? "" : "text-foreground"} ${surface} ${className}`}
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

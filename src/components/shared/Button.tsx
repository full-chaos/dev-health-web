import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
    "inline-flex items-center justify-center gap-1.5 rounded-full font-medium uppercase tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-4 py-2 text-xs",
};

/** Circle icon button: fixed square, no horizontal padding (prototype `.btn.circle`). */
const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
    sm: "h-7 w-7 p-0",
    md: "h-9 w-9 p-0",
};

const VARIANTS: Record<ButtonVariant, string> = {
    primary: "border border-(--accent-2) bg-(--accent-2) text-white hover:bg-(--accent-2)/90",
    secondary:
        "border border-(--card-stroke) bg-(--card-70) text-foreground hover:border-(--ink-muted)",
    ghost: "border border-transparent text-(--ink-muted) hover:text-foreground hover:bg-(--card-80)",
};

/**
 * Shared token-based button primitive (framework A4).
 *
 * Use for in-page actions. For navigation/return paths use {@link BackLink};
 * for segmented selection use {@link FilterPills}; for route tabs use
 * {@link ModeTabs}. These idioms are intentionally NOT interchangeable.
 *
 * `buttonClassName()` is exported so `<Link>` elements can share the exact
 * same visual treatment without duplicating Tailwind strings.
 */
export function buttonClassName(
    variant: ButtonVariant = "secondary",
    size: ButtonSize = "md",
    className = "",
    iconOnly = false,
): string {
    const sizing = iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size];
    return `${BASE} ${sizing} ${VARIANTS[variant]} ${className}`.trim();
}

type ButtonBaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Decorative icon element (for example a lucide icon). Rendered `aria-hidden`. */
    icon?: ReactNode;
    /** Which side of the label the icon sits on. Default `start`. */
    iconPosition?: "start" | "end";
};

/**
 * Either a labelled button (children, optional icon) or an icon-only circle button.
 * The icon-only form requires an `aria-label` because it has no visible text.
 */
export type ButtonProps =
    | (ButtonBaseProps & { iconOnly?: false; children: ReactNode })
    | (ButtonBaseProps & {
          iconOnly: true;
          icon: ReactNode;
          "aria-label": string;
          children?: never;
      });

export function Button(props: ButtonProps) {
    const {
        variant = "secondary",
        size = "md",
        className,
        type = "button",
        icon,
        iconPosition = "start",
        iconOnly = false,
        children,
        ...rest
    } = props;
    const iconNode = icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
        </span>
    ) : null;
    return (
        <button
            type={type}
            className={buttonClassName(variant, size, className, iconOnly)}
            {...rest}
        >
            {iconPosition === "start" ? iconNode : null}
            {iconOnly ? null : children}
            {iconPosition === "end" ? iconNode : null}
        </button>
    );
}

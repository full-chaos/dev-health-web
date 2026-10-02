import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

// Approved prototype `.btn` (style.css + theme.css): sentence case, 6px radius, weight 550, 7px
// icon gap, 35px high (28px small), 13px text (12px small). Theme tokens only.
const BASE =
    "inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-sm border font-[550] no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
    sm: "min-h-7 px-2.25 py-1.25 text-xs",
    md: "min-h-8.75 px-3.25 py-2 text-[0.8125rem]",
};

/** Circle icon button (`.btn.circle`): 35px wide (28px small), no padding, same 6px radius. */
const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
    sm: "min-h-7 w-7 p-0 text-xs",
    md: "min-h-8.75 w-8.75 p-0 text-[0.8125rem]",
};

const VARIANTS: Record<ButtonVariant, string> = {
    primary: "border-(--accent-2) bg-(--accent-2) text-white hover:brightness-110",
    secondary: "border-(--card-stroke) bg-(--card) text-foreground hover:bg-(--card-80)",
    ghost: "border-transparent bg-transparent text-(--accent-text) hover:bg-(--card-80)",
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
    /** React 19 passes `ref` as a prop; it reaches the `<button>` through the rest spread. */
    ref?: Ref<HTMLButtonElement>;
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

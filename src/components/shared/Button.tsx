import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
    "inline-flex items-center justify-center gap-1.5 rounded-full font-medium uppercase tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-4 py-2 text-xs",
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
): string {
    return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`.trim();
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children: ReactNode;
};

export function Button({
    variant = "secondary",
    size = "md",
    className,
    type = "button",
    children,
    ...rest
}: ButtonProps) {
    return (
        <button type={type} className={buttonClassName(variant, size, className)} {...rest}>
            {children}
        </button>
    );
}

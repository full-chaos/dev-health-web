import type { ElementType, ReactNode } from "react";

/**
 * The prototype `.inset` (style.css): a quiet box inside a card (page background, 6px radius,
 * 15px padding). With a `title` it renders the prototype layout: an `h4` and a short body.
 * Without a `title` it is the bare box and the caller owns the content and its text classes
 * (through `className` and `children`). Layout only.
 *
 * The prototype `.inset` has an unconditional `margin-top: 14px`, so the box has `mt-3.5` unless it is
 * `flush`: a box that already sits in a list, a stack with its own gap or a card with no space above.
 * A caller does not pass its own `mt-*` class: two margin classes on one element are decided by the order
 * in the compiled stylesheet, not by the caller (CHAOS-8483).
 */
export function Inset({
    title,
    children,
    className = "",
    flush = false,
    as: Tag = "div",
    ...rest
}: {
    title?: ReactNode;
    children?: ReactNode;
    className?: string;
    /** No top margin: the box sits where the page already spaces it. */
    flush?: boolean;
    /** The element: `li` inside a list, `section` for a landmark. Default `div`. */
    as?: ElementType;
    "data-testid"?: string;
}) {
    return (
        <Tag
            className={`${flush ? "" : "mt-3.5 "}rounded-sm bg-background p-3.75 ${className}`.trim()}
            {...rest}
        >
            {title === undefined ? (
                children
            ) : (
                <>
                    <h4 className="text-[0.8125rem] font-semibold">{title}</h4>
                    {children ? (
                        <div className="mt-1.5 text-[0.8125rem] text-(--ink-muted)">{children}</div>
                    ) : null}
                </>
            )}
        </Tag>
    );
}

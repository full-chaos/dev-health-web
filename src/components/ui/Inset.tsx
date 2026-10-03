import type { ReactNode } from "react";

/**
 * The prototype `.inset` (style.css): a quiet box inside a card (page background, 6px radius,
 * 15px padding). With a `title` it renders the prototype layout: an `h4` and a short body.
 * Without a `title` it is the bare box and the caller owns the content and its text classes
 * (through `className` and `children`). Layout only.
 */
export function Inset({
    title,
    children,
    className = "",
    ...rest
}: {
    title?: ReactNode;
    children?: ReactNode;
    className?: string;
    "data-testid"?: string;
}) {
    return (
        <div className={`mt-3.5 rounded-sm bg-background p-3.75 ${className}`.trim()} {...rest}>
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
        </div>
    );
}

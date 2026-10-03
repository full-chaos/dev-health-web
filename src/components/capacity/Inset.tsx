import type { ReactNode } from "react";

/**
 * The prototype `.inset`: a quiet box inside a card (page background, 6px radius, 15px padding)
 * with an `h4` title and a short paragraph. Layout only. Used by both Plan pages; to fold into a
 * shared Inset when a second area needs it.
 */
export function Inset({
    title,
    children,
    className = "",
    ...rest
}: {
    title: ReactNode;
    children?: ReactNode;
    className?: string;
    "data-testid"?: string;
}) {
    return (
        <div className={`mt-3.5 rounded-sm bg-background p-3.75 ${className}`.trim()} {...rest}>
            <h4 className="text-[0.8125rem] font-semibold">{title}</h4>
            {children ? (
                <p className="mt-1.5 text-[0.8125rem] text-(--ink-muted)">{children}</p>
            ) : null}
        </div>
    );
}

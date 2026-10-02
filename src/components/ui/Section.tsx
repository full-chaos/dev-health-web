import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The one section card: title, optional one-line description, optional
 * right-aligned action, then the body. Replaces the repeated
 * `rounded border bg-surface p-5` + `<h2>` blocks on pages.
 *
 * Layout only. It renders what it is given and computes nothing.
 * `as` sets the title level; use `h3` where the card sits under another h2.
 */
export type SectionProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
    title: ReactNode;
    description?: ReactNode;
    /** Right-aligned control in the head (a link or a Button). */
    action?: ReactNode;
    /** Heading element for the title. Default `h2`. */
    as?: "h2" | "h3";
    children?: ReactNode;
};

export function Section({
    title,
    description,
    action,
    as: TitleTag = "h2",
    className = "",
    children,
    ...rest
}: SectionProps) {
    return (
        <section
            className={`min-w-0 rounded-(--radius-md) border border-(--card-stroke) bg-card p-5.25 ${className}`.trim()}
            {...rest}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <TitleTag className="text-h3 font-semibold">{title}</TitleTag>
                    {description ? (
                        <p className="mt-1 text-xs text-(--ink-muted)">{description}</p>
                    ) : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            {children ? <div className="mt-4.25">{children}</div> : null}
        </section>
    );
}

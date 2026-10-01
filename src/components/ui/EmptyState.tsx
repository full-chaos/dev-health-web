import type { ReactNode } from "react";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    /** Concept `.empty.compact`: smaller box for use inside a card. */
    compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
    // Concept `.empty` (style.css / theme.css): dashed hairline, radius 6, min-height 200, padding 32,
    // muted line icon, 15px title, 12px text (max 520), action 20px below.
    return (
        <div
            className={`flex flex-col items-center justify-center rounded-(--radius-sm) border border-dashed border-(--card-stroke) bg-background text-center ${compact ? "min-h-30 p-5" : "min-h-50 p-8"}`}
        >
            {icon && (
                <div
                    className={`${compact ? "mb-2" : "mb-3.5"} text-(--ink-muted) [&_svg]:h-6 [&_svg]:w-6`}
                >
                    {icon}
                </div>
            )}
            <p className="text-h3 font-semibold text-foreground">{title}</p>
            {description && (
                <p className="mt-2 max-w-lg text-xs text-(--ink-muted)">{description}</p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

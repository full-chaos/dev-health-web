import type { ReactNode } from "react";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-(--card-stroke) bg-(--card-70) py-12 text-center">
            {icon && (
                <div className="rounded-full bg-(--accent)/10 p-3 text-(--accent)">{icon}</div>
            )}
            <p className="font-(--font-display) text-lg font-semibold">{title}</p>
            {description && <p className="max-w-sm text-sm text-(--ink-muted)">{description}</p>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}

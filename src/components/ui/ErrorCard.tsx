import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

interface ErrorCardProps {
    title: string;
    message?: string;
    action?: ReactNode;
}

/**
 * Error card. Contract (CHAOS-2061): an error never looks like an empty state, so it keeps a
 * solid negative-tinted border where the empty box is dashed and neutral. Shell on the concept
 * scale: radius 6, 15px title (still the page-level `h2`), 12px text.
 */
export function ErrorCard({ title, message, action }: ErrorCardProps) {
    return (
        <div className="mx-auto max-w-md rounded-(--radius-sm) border border-(--accent-negative)/30 bg-(--card-80) p-8 text-center">
            <div className="mx-auto mb-3.5 flex h-10 w-10 items-center justify-center rounded-full bg-(--accent-negative)/10 text-(--accent-negative)">
                <TriangleAlert aria-hidden="true" className="h-6 w-6" />
            </div>
            <h2 className="text-h3 font-semibold text-foreground">{title}</h2>
            {message && <p className="mt-2 text-xs text-(--ink-muted)">{message}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

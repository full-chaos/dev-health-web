import type { ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * The small note under a chart or table (approved prototype `.data-note`): an info icon and one
 * muted line. It states how to read the values; it carries no value of its own.
 */
export function DataNote({
    children,
    className = "",
    "data-testid": testId = "data-note",
}: {
    children: ReactNode;
    className?: string;
    "data-testid"?: string;
}) {
    return (
        <p
            data-testid={testId}
            className={`mt-2.5 flex items-center gap-1.5 text-xs text-(--ink-muted) ${className}`.trim()}
        >
            <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{children}</span>
        </p>
    );
}

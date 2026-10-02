"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type ThreadRowProps = {
    /** Stable id, used for the test id (`thread-row-<id>`). */
    id: string;
    /** The row's name; rendered as the row heading. */
    title: string;
    /** One line shown while the row is closed, built only from values the page already has. */
    summary: string;
    children: ReactNode;
    /** Mounted only after the row is first opened (for content that fetches or measures on mount). */
    deferred?: ReactNode;
};

/**
 * One row of the Investigation threads list (concept `.workrow`). A native `<details>`: it opens
 * from the keyboard (Enter / Space on the summary) and the browser exposes its open state to
 * assistive technology. Closed by default.
 */
export function ThreadRow({ id, title, summary, children, deferred }: ThreadRowProps) {
    const [opened, setOpened] = useState(false);

    return (
        <details
            data-testid={`thread-row-${id}`}
            onToggle={(event) => {
                if ((event.currentTarget as HTMLDetailsElement).open) setOpened(true);
            }}
            className="group border-b border-(--card-stroke) last:border-b-0"
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                    <h3 className="text-h3 font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 truncate text-xs text-(--ink-muted)">{summary}</p>
                </span>
                <ChevronDown
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-(--ink-muted) transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
            </summary>
            <div className="px-5 pb-5">
                {children}
                {opened ? deferred : null}
            </div>
        </details>
    );
}

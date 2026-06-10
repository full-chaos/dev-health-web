"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

interface ErrorViewProps {
    error: Error & { digest?: string };
    reset: () => void;
    /** Label shown above the heading (e.g., "Error", "App Error"). */
    label?: string;
    /** Heading text. Defaults to "Something went wrong". */
    heading?: string;
    /** Description text. */
    description?: string;
}

export function ErrorView({
    error,
    reset,
    label = "Error",
    heading = "Something went wrong",
    description = "An unexpected error occurred while rendering this page.",
}: ErrorViewProps) {
    useEffect(() => {
        logger.error({ err: error, digest: error.digest }, "Unhandled route error");
    }, [error]);

    return (
        <div className="flex min-h-[50vh] items-center justify-center text-foreground">
            <div className="max-w-md px-6 text-center">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted) mb-3">
                    {label}
                </p>
                <h1 className="font-(--font-display) text-3xl mb-4">{heading}</h1>
                <p className="text-sm text-(--ink-muted) leading-relaxed mb-8">
                    {description}
                    {error.digest && (
                        <span className="block mt-2 font-mono text-xs text-(--ink-subtle)">
                            Error ID: {error.digest}
                        </span>
                    )}
                </p>
                <button
                    onClick={reset}
                    className="rounded-full border border-(--card-stroke) px-6 py-2.5 text-xs uppercase tracking-[0.2em] hover:border-(--accent) transition"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}

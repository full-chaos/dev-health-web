"use client";

import { useId, useState } from "react";

type CommitHashDisclosureProps = {
    readonly hash: string;
};

export function CommitHashDisclosure({ hash }: CommitHashDisclosureProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const fullHashId = useId();

    return (
        <span className="inline-block max-w-full text-foreground">
            <button
                aria-controls={fullHashId}
                aria-expanded={isExpanded}
                className="cursor-pointer underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50"
                onClick={() => setIsExpanded((expanded) => !expanded)}
                type="button"
            >
                <span aria-hidden="true">{hash.slice(0, 8)}</span>
                <span className="sr-only">Full commit hash: {hash}. Activate to reveal.</span>
            </button>
            {isExpanded ? (
                <code className="mt-2 block break-all text-xs text-(--ink-muted)" id={fullHashId}>
                    {hash}
                </code>
            ) : null}
        </span>
    );
}

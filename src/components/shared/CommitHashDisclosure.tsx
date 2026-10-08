"use client";

import { useState } from "react";

type CommitHashDisclosureProps = {
    readonly hash: string;
};

/** Renders "Commit" — the hash is never shown; it is only the copy-to-clipboard value. */
export function CommitHashDisclosure({ hash }: CommitHashDisclosureProps) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        void navigator.clipboard?.writeText(hash).then(
            () => setCopied(true),
            () => setCopied(false),
        );
    };

    return (
        <span className="inline-block max-w-full text-foreground">
            <button
                className="cursor-pointer underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/50"
                onClick={copy}
                type="button"
            >
                {copied ? "Commit copied" : "Commit"}
            </button>
        </span>
    );
}

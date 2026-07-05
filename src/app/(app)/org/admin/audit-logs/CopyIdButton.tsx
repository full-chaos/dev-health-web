"use client";

import { useState, type MouseEvent } from "react";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type CopyIdButtonProps = {
    /** Full identifier value to place on the clipboard. */
    value: string;
    /** Human-readable description of what is being copied, e.g. "actor ID". */
    label: string;
    className?: string;
};

const COPIED_RESET_DELAY_MS = 1500;

/**
 * Copy affordance for an audit-log identifier (CHAOS-2843, A7). Only ever
 * rendered next to an id that actually exists — never invented as a
 * placeholder. Visible text always comes from the CTA registry; the
 * "copied" acknowledgement is conveyed through a non-text glyph and the
 * `title`/`aria-label` so no ad-hoc CTA phrasing is introduced.
 */
export function CopyIdButton({ value, label, className }: CopyIdButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS);
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
            title={copied ? "Copied to clipboard" : `Copy ${label}`}
            className={className}
        >
            {copied && <span aria-hidden="true">✓ </span>}
            {CTA_LABELS.copy}
        </Button>
    );
}

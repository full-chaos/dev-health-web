"use client";

import { useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/shared/Button";

type CopyIdButtonProps = {
    /** Full identifier value to place on the clipboard. */
    value: string;
    /** Human-readable description of what is being copied, e.g. "actor ID". */
    label: string;
    className?: string;
};

const COPIED_RESET_DELAY_MS = 1500;

/**
 * Copy affordance for an audit-log identifier (CHAOS-2843, A7; design AD-3). Only ever rendered
 * next to an id that actually exists — never invented as a placeholder. An icon button: the full id
 * is the copied value only; it is never printed or put in a title or aria-label; the "copied"
 * acknowledgement is a check glyph and the title.
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
            iconOnly
            onClick={handleCopy}
            icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            aria-label={`Copy ${label}`}
            title={copied ? "Copied to clipboard" : `Copy ${label}`}
            className={className}
        />
    );
}

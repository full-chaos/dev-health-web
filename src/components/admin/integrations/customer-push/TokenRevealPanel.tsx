"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CTA_LABELS } from "@/lib/design/cta";
import type { CustomerPushScope } from "@/lib/admin/types";

type TokenRevealPanelProps = {
    token: string;
    name: string;
    scopes: CustomerPushScope[];
    examplesHref: string;
    onDismiss: () => void;
};

/**
 * One-time token reveal (CHAOS-2714 D9). `token` lives only in this
 * component's props/local render tree — never written to
 * localStorage/sessionStorage/the URL, and never passed whole into a
 * console.* call or a toast that echoes full objects. Once the parent
 * unmounts this panel (dismiss, navigation), React drops the value; there is
 * no separate persistence to clear.
 */
export function TokenRevealPanel({
    token,
    name,
    scopes,
    examplesHref,
    onDismiss,
}: TokenRevealPanelProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(token);
            setCopied(true);
            toast.success("Token copied");
        }
    };

    return (
        <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
            <div>
                <h3 className="text-base font-semibold text-(--ink-base)">
                    {name} — token created
                </h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Store this token in your CI/CD secret manager. FullChaos will not show it again.
                </p>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-(--border-subtle) bg-(--surface-base) p-3">
                <code className="flex-1 overflow-x-auto font-mono text-sm text-(--ink-base)">
                    {token}
                </code>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-1.5 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted)"
                >
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                {scopes.map((scope) => (
                    <span
                        key={scope}
                        className="rounded-full bg-(--card-70) px-3 py-1 text-xs font-medium text-foreground"
                    >
                        {scope}
                    </span>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <Link
                    href={examplesHref}
                    className="inline-flex items-center justify-center rounded-md border border-(--border-subtle) bg-(--surface-base) px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted)"
                >
                    {CTA_LABELS.viewSetupExamples}
                </Link>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                >
                    {CTA_LABELS.done}
                </button>
            </div>
        </div>
    );
}

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { CTA_LABELS } from "@/lib/design/cta";

const ReactMarkdown = dynamic(() => import("react-markdown"), {
    ssr: false,
    loading: () => <div className="h-4 animate-pulse bg-muted/40 rounded" />,
});

function splitProvenance(md: string): {
    body: string;
    provenance: string | null;
    footer: string | null;
} {
    const provenanceIdx = md.indexOf("## Provenance");
    if (provenanceIdx === -1) return { body: md, provenance: null, footer: null };

    const body = md.slice(0, provenanceIdx).trimEnd();
    const rest = md.slice(provenanceIdx);

    const hrIdx = rest.indexOf("\n---\n");
    if (hrIdx === -1) return { body, provenance: rest, footer: null };

    return {
        body,
        provenance: rest.slice(0, hrIdx).trimEnd(),
        footer: rest.slice(hrIdx + 5).trim(),
    };
}

export function MarkdownRenderer({ content }: { content: string }) {
    const { body, provenance, footer } = splitProvenance(content);
    const [showProvenance, setShowProvenance] = useState(false);

    return (
        <div className="space-y-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>

            {provenance && (
                <div className="border-t border-(--card-stroke) pt-4">
                    <button
                        type="button"
                        onClick={() => setShowProvenance(!showProvenance)}
                        className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-(--ink-muted) hover:text-foreground transition-colors"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`transition-transform ${showProvenance ? "rotate-90" : ""}`}
                            aria-hidden="true"
                        >
                            <path d="m9 18 6-6-6-6" />
                        </svg>
                        {CTA_LABELS.provenance}
                    </button>
                    {showProvenance && (
                        <div className="mt-3 prose prose-xs dark:prose-invert max-w-none opacity-70">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {provenance.replace("## Provenance\n", "").trim()}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            )}

            {footer && (
                <div className="border-t border-(--card-stroke) pt-3 text-xs text-(--ink-muted) tracking-wide">
                    {footer}
                </div>
            )}
        </div>
    );
}

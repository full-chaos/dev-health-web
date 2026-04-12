"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function splitProvenance(md: string): { body: string; provenance: string | null; footer: string | null } {
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
    <div className="space-y-6">
      <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h1:border-b prose-h1:border-(--card-stroke) prose-h1:pb-3 prose-h1:mb-6 prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:text-(--accent) prose-h3:text-sm prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-(--ink-muted) prose-h3:mt-4 prose-h3:mb-2 prose-p:text-(--ink-muted) prose-p:leading-relaxed prose-li:text-(--ink-muted) prose-strong:text-foreground prose-hr:border-(--card-stroke) prose-table:text-xs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>

      {provenance && (
        <div className="border-t border-(--card-stroke) pt-4">
          <button
            onClick={() => setShowProvenance(!showProvenance)}
            className="flex items-center gap-2 text-xs uppercase tracking-wider text-(--ink-muted) hover:text-foreground transition-colors"
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
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            Provenance
          </button>
          {showProvenance && (
            <div className="mt-3 prose prose-xs dark:prose-invert max-w-none prose-li:text-(--ink-muted) prose-strong:text-(--ink-muted) text-xs text-(--ink-muted) opacity-70">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {provenance.replace("## Provenance\n", "").trim()}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {footer && (
        <div className="border-t border-(--card-stroke) pt-3 text-[10px] text-(--ink-muted) tracking-wide">
          {footer}
        </div>
      )}
    </div>
  );
}

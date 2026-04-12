"use client";

import type { Components } from "react-markdown";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold text-foreground border-b border-(--card-stroke) pb-3 mb-6">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-(--accent) mt-8 mb-3 pt-4 border-t border-(--card-stroke)/40">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xs font-medium uppercase tracking-[0.15em] text-(--ink-muted) mt-5 mb-2">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-medium text-foreground mt-4 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm text-(--ink-muted) leading-relaxed mb-3">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-1 text-sm text-(--ink-muted) mb-4 ml-1">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-(--ink-muted) italic">{children}</em>
  ),
  hr: () => <hr className="border-(--card-stroke) my-6" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-(--card-stroke)">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-(--card-stroke) text-(--ink-muted) bg-(--card-70)">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-(--ink-muted)">{children}</td>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-(--card-stroke)/40 last:border-0">
      {children}
    </tr>
  ),
  code: ({ children }) => (
    <code className="rounded bg-(--card-70) px-1.5 py-0.5 text-xs font-mono text-(--ink-muted)">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-(--accent)/40 pl-4 my-4 text-sm text-(--ink-muted) italic">
      {children}
    </blockquote>
  ),
};

const provenanceComponents: Components = {
  ...mdComponents,
  p: ({ children }) => (
    <p className="text-xs text-(--ink-muted) leading-relaxed mb-1">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-0.5 text-xs text-(--ink-muted) ml-1">
      {children}
    </ul>
  ),
  strong: ({ children }) => (
    <strong className="font-medium text-(--ink-muted)">{children}</strong>
  ),
};

export function MarkdownRenderer({ content }: { content: string }) {
  const { body, provenance, footer } = splitProvenance(content);
  const [showProvenance, setShowProvenance] = useState(false);

  return (
    <div className="space-y-4">
      <div className="max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {body}
        </ReactMarkdown>
      </div>

      {provenance && (
        <div className="border-t border-(--card-stroke) pt-4">
          <button
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
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            Provenance
          </button>
          {showProvenance && (
            <div className="mt-3 opacity-70">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={provenanceComponents}
              >
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

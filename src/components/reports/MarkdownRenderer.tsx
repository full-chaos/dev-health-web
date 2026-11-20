"use client";

import { type ComponentPropsWithoutRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Components, ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CTA_LABELS } from "@/lib/design/cta";

const ReactMarkdown = dynamic(() => import("react-markdown"), {
    ssr: false,
    loading: () => <div className="h-4 animate-pulse bg-muted/40 rounded" />,
});

type SourceLevel = 1 | 2 | 3 | 4;
type HeadingLook = Record<SourceLevel, string>;

/**
 * The look of each source heading level, as `@tailwindcss/typography` 0.5 drew it
 * before the shift: size with line height, weight, margins, and the prose heading
 * color (prose styles `h1`-`h4` only, so the shifted `h5`/`h6` would lose it).
 * `prose-sm` for the report body, `prose` for the provenance part. `#####` and
 * `######` had no prose style and get none.
 */
const PROSE_SM_LOOK: HeadingLook = {
    1: "text-(--tw-prose-headings) text-3xl font-extrabold mt-0 mb-6",
    2: "text-(--tw-prose-headings) text-xl font-bold mt-8 mb-4 first:mt-0",
    3: "text-(--tw-prose-headings) text-lg font-semibold mt-7 mb-2 first:mt-0",
    4: "text-(--tw-prose-headings) text-sm font-semibold mt-5 mb-2 first:mt-0",
};
const PROSE_LOOK: HeadingLook = {
    1: "text-(--tw-prose-headings) text-4xl font-extrabold mt-0 mb-8",
    2: "text-(--tw-prose-headings) text-2xl font-bold mt-12 mb-6 first:mt-0",
    3: "text-(--tw-prose-headings) text-xl leading-relaxed font-semibold mt-8 mb-3 first:mt-0",
    4: "text-(--tw-prose-headings) text-base font-semibold mt-6 mb-2 first:mt-0",
};

type ShiftedTag = "h3" | "h4" | "h5" | "h6";

function shiftedHeading(Tag: ShiftedTag, className: string) {
    return function ShiftedHeading({
        node: _node,
        ...props
    }: ComponentPropsWithoutRef<"h1"> & ExtraProps) {
        return <Tag {...props} className={className} />;
    };
}

/**
 * The page has its own `h1` (the report name) and the body sits under the card
 * heading (`h2`), so a report heading goes two levels down: `#` is an `h3`, `##`
 * an `h4`, `###` an `h5`, and `####` and below an `h6`. The tag shifts; the look
 * stays the one of the source level.
 */
function shiftedHeadings(look: HeadingLook): Components {
    return {
        h1: shiftedHeading("h3", look[1]),
        h2: shiftedHeading("h4", look[2]),
        h3: shiftedHeading("h5", look[3]),
        h4: shiftedHeading("h6", look[4]),
        h5: "h6",
    };
}

// A report holds no link by contract: its text comes from the report plan (scope, titles, labels, notes) and a
// URL, www host or e-mail address in it is a value to read, never a target. remark-gfm builds a literal autolink
// from the decoded text, so a backslash escape in the stored text does not stop it; the one reliable stop is to
// draw every link as its text. This also keeps an authored `[text](url)` from becoming a link.
function PlainText({ children }: ComponentPropsWithoutRef<"a"> & ExtraProps) {
    return <span>{children}</span>;
}

const BODY_COMPONENTS: Components = { ...shiftedHeadings(PROSE_SM_LOOK), a: PlainText };
const PROVENANCE_COMPONENTS: Components = { ...shiftedHeadings(PROSE_LOOK), a: PlainText };
const FOOTER_COMPONENTS: Components = { a: PlainText };

// The Provenance heading is a whole line, and the last such line wins: the renderer writes the real section
// last, so a line of that text inside a report value (an old report) never moves the split. A line ends at
// LF, CRLF or CR only (CommonMark); no `m` flag, because JS also ends a line at U+2028/U+2029.
const PROVENANCE_LINE = /(?:^|\r\n|\r|\n)## Provenance[ \t]*(?=\r\n|\r|\n|$)/g;
const PROVENANCE_HEADING_LINE = /^## Provenance[ \t]*(?:\r\n|\r|\n)?/;
const FOOTER_RULE = /(?:\r\n|\r|\n)---(?:\r\n|\r|\n)/;

function splitProvenance(md: string): {
    body: string;
    provenance: string | null;
    footer: string | null;
} {
    let provenanceIdx = -1;
    for (const match of md.matchAll(PROVENANCE_LINE)) {
        provenanceIdx = match.index + match[0].indexOf("## Provenance");
    }
    if (provenanceIdx === -1) return { body: md, provenance: null, footer: null };

    const body = md.slice(0, provenanceIdx).trimEnd();
    const rest = md.slice(provenanceIdx);

    const rule = FOOTER_RULE.exec(rest);
    if (!rule) return { body, provenance: rest, footer: null };

    return {
        body,
        provenance: rest.slice(0, rule.index).trimEnd(),
        footer: rest.slice(rule.index + rule[0].length).trim(),
    };
}

export function MarkdownRenderer({ content }: { content: string }) {
    const { body, provenance, footer } = splitProvenance(content);
    const [showProvenance, setShowProvenance] = useState(false);

    return (
        <div className="space-y-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={BODY_COMPONENTS}>
                    {body}
                </ReactMarkdown>
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
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={PROVENANCE_COMPONENTS}
                            >
                                {provenance.replace(PROVENANCE_HEADING_LINE, "").trim()}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            )}

            {footer && (
                <div className="border-t border-(--card-stroke) pt-3 text-xs text-(--ink-muted) tracking-wide">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={FOOTER_COMPONENTS}>
                        {footer}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
}

"use client";

import Link from "next/link";

import { CTA_LABELS, toggleEvidenceItem } from "@/lib/design/cta";
import type { DevEvidenceExpansion, DevEvidenceRef } from "@/lib/dev/generated";
import { formatTimestamp } from "@/lib/formatters";

import { safeExcerpt } from "./labels";

/**
 * CHAOS-3524 (chris's evidence-layout ruling): each evidence item is its own
 * accordion row, default folded. The row's header (label + provenance) stays
 * visible even folded — that's the disclosure trigger a reader sees and
 * clicks — only the detail beneath it (citation text, the "Open evidence"
 * fetch action, the fetched excerpt, errors, the artifact link) is hidden
 * until `open`. The fold toggle itself is icon-only (a chevron, aria-label
 * carries the real name) per chris's "buttons/iconography only, no text
 * labels" rule; `evidence.display_label` sitting in the same clickable
 * header is the row's identifying TITLE, not an instructional fold/unfold
 * label, so it stays as visible text.
 */
export function EvidenceRow({
    anchorId,
    error,
    evidence,
    expansion,
    loading,
    onToggleOpen,
    open,
    openExpansion,
}: {
    anchorId: string;
    error: string | null;
    evidence: DevEvidenceRef;
    expansion: DevEvidenceExpansion | null;
    loading: boolean;
    onToggleOpen: () => void;
    open: boolean;
    openExpansion: () => Promise<void>;
}) {
    const internalPath = evidence.link?.internal_path;

    return (
        <div
            id={anchorId}
            tabIndex={-1}
            className="scroll-mt-6 space-y-1.5 border-l-2 border-(--border) pl-3 outline-none focus-visible:border-(--accent)"
        >
            <button
                type="button"
                onClick={onToggleOpen}
                aria-expanded={open}
                aria-label={toggleEvidenceItem(evidence.display_label, open)}
                className="flex w-full min-w-0 items-start gap-2 rounded-(--radius-sm) py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
            >
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-(--text-muted)">
                    {open ? "▾" : "▸"}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-(--text-secondary)">
                        {evidence.display_label}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                        {evidence.provenance} · {formatTimestamp(evidence.observed_at)}
                    </span>
                </span>
            </button>
            {open ? (
                <div className="space-y-1.5 pl-5">
                    {evidence.citation_text ? (
                        <p className="text-xs leading-5 text-(--text-muted)">
                            {evidence.citation_text}
                        </p>
                    ) : null}
                    {/*
                     * Quiet by default (text-muted, no fill) — this is a
                     * secondary, on-demand affordance, not a primary CTA; it
                     * only picks up accent color on hover/focus (CHAOS-3291).
                     * Unlike the fold toggle above, this triggers a real
                     * server fetch (the deep excerpt) rather than showing
                     * already-loaded content, so it keeps its sanctioned
                     * text label rather than becoming icon-only.
                     */}
                    <button
                        type="button"
                        onClick={() => void openExpansion()}
                        disabled={loading}
                        className="rounded-(--radius-sm) px-2 py-1 text-xs font-medium text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-50"
                    >
                        {loading ? "Opening…" : CTA_LABELS.openEvidence}
                    </button>
                    {expansion ? (
                        <div className="rounded-(--radius-md) bg-(--background)/60 p-3 text-sm leading-6 text-(--text-secondary)">
                            <p className="text-label-caps text-(--text-muted)">
                                {expansion.state.replaceAll("_", " ")}
                            </p>
                            {safeExcerpt(expansion.safe_excerpt) ? (
                                <p className="mt-2 whitespace-pre-wrap">
                                    {safeExcerpt(expansion.safe_excerpt)}
                                </p>
                            ) : (
                                <p className="mt-2">No additional excerpt is available.</p>
                            )}
                            {expansion.warning ? (
                                <p className="mt-2 text-(--caution)">{expansion.warning}</p>
                            ) : null}
                        </div>
                    ) : null}
                    {error ? (
                        <p role="alert" className="text-xs text-(--negative)">
                            {error}
                        </p>
                    ) : null}
                    {internalPath ? (
                        <Link
                            href={internalPath}
                            className="inline-flex text-xs font-medium text-(--accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                        >
                            {CTA_LABELS.openArtifact}
                        </Link>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

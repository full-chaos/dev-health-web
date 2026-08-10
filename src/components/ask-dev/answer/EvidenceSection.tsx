"use client";

import { CTA_LABELS } from "@/lib/design/cta";
import type { DevAnswer, DevEvidenceExpansion } from "@/lib/dev/generated";

import { EvidenceRow } from "./EvidenceRow";

/**
 * The evidence lane: a foldable list of independently foldable rows.
 *
 * CHAOS-3524 (chris's evidence-layout ruling): the lane's own fold toggle and
 * the "unfold all" action are icon-only buttons (chevron / unfold glyph,
 * aria-label carries the name) — "Evidence" is the section's static title, not
 * itself a fold/unfold instruction, so it stays outside both buttons as plain
 * heading text.
 *
 * All fold state lives in the container, not here: a citation click has to
 * unfold the lane AND one specific row synchronously, in the same handler
 * flush, before the focus call that follows the async excerpt fetch can find
 * the row in the DOM.
 */
export function EvidenceSection({
    evidence,
    evidenceAnchorId,
    evidenceErrors,
    evidenceExpansions,
    evidencePositionById,
    headingId,
    laneOpen,
    listId,
    loadingEvidenceIds,
    onOpenExpansion,
    onToggleLane,
    onToggleRow,
    onUnfoldAll,
    openEvidenceRowIds,
}: {
    evidence: NonNullable<DevAnswer["evidence"]>;
    evidenceAnchorId: (position: number) => string;
    evidenceErrors: Readonly<Record<string, string>>;
    evidenceExpansions: Readonly<Record<string, DevEvidenceExpansion>>;
    evidencePositionById: ReadonlyMap<string, number>;
    headingId: string;
    laneOpen: boolean;
    listId: string;
    loadingEvidenceIds: ReadonlySet<string>;
    onOpenExpansion: (evidenceRefId: string) => Promise<void>;
    onToggleLane: () => void;
    onToggleRow: (evidenceRefId: string) => void;
    onUnfoldAll: () => void;
    openEvidenceRowIds: ReadonlySet<string>;
}) {
    return (
        <section className="space-y-3 border-t border-(--border) pt-4" aria-labelledby={headingId}>
            <div className="flex items-center justify-between gap-2">
                <h3 id={headingId} className="text-label-caps text-(--text-muted)">
                    Evidence
                </h3>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onUnfoldAll}
                        aria-label={CTA_LABELS.unfoldAllEvidence}
                        className="rounded-(--radius-sm) p-1 text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                    >
                        <span aria-hidden="true">⤢</span>
                    </button>
                    <button
                        type="button"
                        onClick={onToggleLane}
                        aria-expanded={laneOpen}
                        aria-controls={listId}
                        aria-label={
                            laneOpen
                                ? CTA_LABELS.collapseEvidenceLane
                                : CTA_LABELS.expandEvidenceLane
                        }
                        className="rounded-(--radius-sm) p-1 text-(--text-muted) hover:bg-(--accent)/10 hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                    >
                        <span aria-hidden="true">{laneOpen ? "▾" : "▸"}</span>
                    </button>
                </div>
            </div>
            {/*
             * Native `hidden` attribute, not a conditional
             * unmount/CSS-class toggle: this codebase's tests run
             * without compiled Tailwind CSS (a `hidden` class
             * wouldn't actually hide anything for `toBeVisible()`
             * purposes), but the native attribute is a real HTML5 UA
             * behavior jsdom honors directly. Keeping the rows
             * always mounted (just hidden) also means
             * `document.getElementById(anchorId)` keeps working
             * immediately when a citation click both unfolds the
             * lane and focuses a row in the same flow, with no
             * mount-timing race to reason about.
             */}
            <div id={listId} hidden={!laneOpen} className="space-y-3">
                {evidence.map((item) => (
                    <EvidenceRow
                        key={item.evidence_ref_id}
                        anchorId={evidenceAnchorId(
                            evidencePositionById.get(item.evidence_ref_id) ?? 0,
                        )}
                        error={evidenceErrors[item.evidence_ref_id] ?? null}
                        evidence={item}
                        expansion={evidenceExpansions[item.evidence_ref_id] ?? null}
                        loading={loadingEvidenceIds.has(item.evidence_ref_id)}
                        onToggleOpen={() => onToggleRow(item.evidence_ref_id)}
                        open={openEvidenceRowIds.has(item.evidence_ref_id)}
                        openExpansion={() => onOpenExpansion(item.evidence_ref_id)}
                    />
                ))}
            </div>
        </section>
    );
}

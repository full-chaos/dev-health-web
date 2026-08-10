"use client";

/**
 * Everything an inline citation badge needs to resolve a ref id into a
 * clickable, correctly-numbered anchor.
 *
 * Positions come from the answer's OWN evidence/metric arrays, so `E3` always
 * means "the third evidence entry of this answer" — a citation can never
 * address a ref this answer does not carry, and an unknown id renders nothing
 * rather than a badge that leads somewhere else (CHAOS-3215 M6: detail-panel
 * ids are scoped per answer for the same reason).
 */
export type CitationTargets = Readonly<{
    evidencePositionById: ReadonlyMap<string, number>;
    metricPositionById: ReadonlyMap<string, number>;
    loadingEvidenceIds: ReadonlySet<string>;
    openEvidence: (evidenceRefId: string) => void;
    openMetric: (metricRefId: string) => void;
}>;

export function InlineCitations({
    evidenceRefIds = [],
    metricRefIds = [],
    ownerLabel,
    targets,
}: {
    evidenceRefIds?: readonly string[];
    metricRefIds?: readonly string[];
    ownerLabel: string;
    targets: CitationTargets;
}) {
    const {
        evidencePositionById,
        loadingEvidenceIds,
        metricPositionById,
        openEvidence,
        openMetric,
    } = targets;
    const knownEvidenceRefs = evidenceRefIds.filter((id) => evidencePositionById.has(id));
    const knownMetricRefs = metricRefIds.filter((id) => metricPositionById.has(id));
    if (!knownEvidenceRefs.length && !knownMetricRefs.length) return null;

    return (
        <span className="ml-2 inline-flex flex-wrap gap-1 align-baseline" aria-label="Citations">
            {knownEvidenceRefs.map((evidenceRefId) => {
                const position = evidencePositionById.get(evidenceRefId)!;
                return (
                    <button
                        key={evidenceRefId}
                        type="button"
                        onClick={() => openEvidence(evidenceRefId)}
                        disabled={loadingEvidenceIds.has(evidenceRefId)}
                        aria-label={`Open evidence citation ${position + 1} for ${ownerLabel}`}
                        className="rounded-(--radius-sm) bg-(--accent)/10 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium leading-none text-(--accent) hover:bg-(--accent)/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45 disabled:opacity-50"
                    >
                        E{position + 1}
                    </button>
                );
            })}
            {knownMetricRefs.map((metricRefId) => {
                const position = metricPositionById.get(metricRefId)!;
                return (
                    <button
                        key={metricRefId}
                        type="button"
                        onClick={() => openMetric(metricRefId)}
                        aria-label={`Open metric citation ${position + 1} for ${ownerLabel}`}
                        className="rounded-(--radius-sm) bg-(--accent-ai)/10 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium leading-none text-(--accent-ai) hover:bg-(--accent-ai)/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        M{position + 1}
                    </button>
                );
            })}
        </span>
    );
}

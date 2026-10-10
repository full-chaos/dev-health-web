import { ClientTimestamp } from "@/components/ClientTimestamp";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { Section } from "@/components/ui/Section";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { STATUS_PILL } from "@/lib/statusPill";
import type { ConfidenceLevel, HomeResponse } from "@/lib/types";
import { Inset } from "@/components/ui/Inset";

/** Approved prototype inset sentence (`app.js:100`). */
export const EVIDENCE_CONTEXT_NOTE =
    "A connected source is not a blanket guarantee of confidence in every derived signal.";

// The served word, with a capital first letter. Same tone rule as the confidence banner:
// high reads as good, medium and low as a caution. The word is the signal, not the colour.
const QUALITY_TONE: Record<ConfidenceLevel, string> = {
    high: STATUS_PILL.positive,
    medium: STATUS_PILL.caution,
    low: STATUS_PILL.caution,
};

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * "Evidence & context" card of Home, beside the ranked signals (approved prototype
 * `section('Evidence & context', fact(...))`, `app.js:100`).
 *
 * Fact rows, each from a served field (the web fills no value in):
 * - Source: the provider names in `freshness.sources` (every served provider, whatever its
 *   status), sorted and ", "-joined. No provider served: no row.
 * - Signal quality: the primary signal's served `confidence`. The API derives it from that
 *   signal's evidence count and the coverage (ops `internal/queryapi/home/signals.go`,
 *   `confidenceFromEvidence`), so it is the evidence quality of the signal.
 * - Last sync: `freshness.latest_successful_sync_at`. No fallback to the last ingest time: an
 *   ingest is not a completed sync.
 *
 * The inset holds the approved sentence, then the served `data_confidence.caveats`.
 */
export function EvidenceContextCard({ home }: { home: HomeResponse | null }) {
    const quality = home?.signals?.[0]?.confidence;
    const lastSync = home?.freshness.latest_successful_sync_at;
    // Org scope: the providers behind the data, sorted. An empty list serves no Source row.
    const source = Object.keys(home?.freshness.sources ?? {})
        .sort()
        .join(", ");
    const caveats = home?.data_confidence?.caveats ?? [];
    // A FAILED Home read (`null`) is not "Not reported": each fact of the answer says so.
    const readFailed = home === null;

    return (
        <Section
            title="Evidence & context"
            description="Keep uncertainty beside the claim."
            data-testid="evidence-context-card"
        >
            <EvidenceFactList aria-label="Evidence and context" testId="evidence-context-facts">
                {readFailed ? (
                    <EvidenceFact label="Source" value={READ_FAILED_MESSAGE} />
                ) : source ? (
                    <EvidenceFact label="Source" value={source} />
                ) : null}
                <EvidenceFact
                    label="Signal quality"
                    value={
                        readFailed ? (
                            READ_FAILED_MESSAGE
                        ) : quality ? (
                            <span
                                data-testid="evidence-context-quality"
                                className={`rounded-full px-2 py-0.5 font-medium ${QUALITY_TONE[quality] ?? STATUS_PILL.muted}`}
                            >
                                {capitalise(quality)}
                            </span>
                        ) : undefined
                    }
                />
                <EvidenceFact
                    label="Last sync"
                    value={
                        readFailed ? (
                            READ_FAILED_MESSAGE
                        ) : lastSync ? (
                            // An unparseable value is shown as served, not replaced.
                            <ClientTimestamp value={lastSync} fallback={lastSync} />
                        ) : undefined
                    }
                />
            </EvidenceFactList>
            <Inset data-testid="evidence-context-note" className="text-xs text-(--ink-muted)">
                <p>{EVIDENCE_CONTEXT_NOTE}</p>
                {caveats.length > 0 ? (
                    <ul className="mt-2 space-y-1" data-testid="data-confidence-caveats">
                        {caveats.map((caveat) => (
                            <li key={caveat} className="flex gap-2">
                                <span aria-hidden="true">•</span>
                                <span>{caveat}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </Inset>
        </Section>
    );
}

import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { formatNumber } from "@/lib/formatters";

type MixSelectionFactsProps = {
    testId: string;
    themeLabel: string;
    /** Set for a subcategory node: adds the Subcategory fact. */
    subcategoryLabel?: string;
    /** The node's served effort; `undefined` = not served (never drawn as zero). */
    value: number | undefined;
    /** The sum of the mix's theme values (the base of the share). */
    total: number;
    /** The mix's unit with underscores as spaces, else the page's effort unit. */
    unit: string;
};

/**
 * The facts the shared evidence drawer shows for a theme or subcategory of the investment mix:
 * served effort and share of the mix. No quality row: the API serves evidence quality as org-wide band counts, never per theme. ONE component for the treemap
 * cell and the classification table row, so the two drawers can never disagree (CHAOS-8564).
 */
export function MixSelectionFacts({
    testId,
    themeLabel,
    subcategoryLabel,
    value,
    total,
    unit,
}: MixSelectionFactsProps) {
    return (
        <EvidenceFactList aria-label="Investment mix selection" testId={testId}>
            <EvidenceFact label="Theme" value={themeLabel} />
            {subcategoryLabel !== undefined ? (
                <EvidenceFact label="Subcategory" value={subcategoryLabel} />
            ) : null}
            <EvidenceFact
                label="Effort"
                value={value === undefined ? undefined : `${formatNumber(value)} ${unit}`}
            />
            <EvidenceFact
                label="Share of the mix"
                value={
                    value === undefined || total <= 0
                        ? undefined
                        : `${formatNumber((value / total) * 100, { maximumFractionDigits: 1 })}%`
                }
            />
        </EvidenceFactList>
    );
}

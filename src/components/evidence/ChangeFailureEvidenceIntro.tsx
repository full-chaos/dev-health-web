import type { ReactNode } from "react";

import { Inset } from "@/components/ui/Inset";
import {
    CHANGE_FAILURE_RATE_KEY,
    changeFailureEvidenceRows,
} from "@/lib/metrics/changeFailureEvidence";
import type { ChangeFailureEvidence } from "@/lib/types";

import { EvidenceFact, EvidenceFactList } from "./EvidenceFacts";

/**
 * What the served change failure rate stands on (CHAOS-9630): the evidence basis, the
 * deployments (D), the ones with a final status (K), their coverage K / D and, when there is no
 * rate, why. It is the first block of the shared evidence drawer for that metric
 * (`EvidenceRequestSubject.intro`): the opener already holds the Home row, so the drawer shows
 * the served facts as they are. Rows are drawn only for served values; no row, no block.
 */
export function ChangeFailureEvidenceIntro({
    evidence,
}: {
    evidence: ChangeFailureEvidence | null | undefined;
}) {
    const rows = changeFailureEvidenceRows(evidence);
    if (rows.length === 0) return null;
    return (
        <Inset as="section" flush data-testid="change-failure-evidence">
            <h4 className="text-xs font-semibold text-foreground">What this rate stands on</h4>
            <EvidenceFactList
                aria-label="What the change failure rate stands on"
                testId="change-failure-evidence-facts"
            >
                {rows.map((row) => (
                    <EvidenceFact key={row.label} label={row.label} value={row.value} />
                ))}
            </EvidenceFactList>
        </Inset>
    );
}

/**
 * The `intro` an opener passes for a metric's drawer: the change failure evidence for change
 * failure rate when the row serves it, nothing for every other metric.
 */
export function changeFailureEvidenceIntro(
    metric: string,
    row: { change_failure_evidence?: ChangeFailureEvidence | null } | null | undefined,
): ReactNode | undefined {
    if (metric !== CHANGE_FAILURE_RATE_KEY || !row?.change_failure_evidence) return undefined;
    return <ChangeFailureEvidenceIntro evidence={row.change_failure_evidence} />;
}

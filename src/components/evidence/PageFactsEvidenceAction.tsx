import type { ReactNode } from "react";

import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";

import { EvidenceFact, EvidenceFactList } from "./EvidenceFacts";

/** One row of the page evidence: a label and the value exactly as the page shows it. */
export type PageFact = {
    label: string;
    /** Leave it out (undefined or null) when the API did not serve the field: the row reads "Not reported". */
    value?: ReactNode;
};

/**
 * The "View evidence" header action for a page whose evidence is its own served values: the
 * drawer shows them as fact rows (label left, value right). It adds no number: pass the values the
 * page shows, as formatted there. Used by the Plan and Improve pages (one pattern).
 */
export function PageFactsEvidenceAction({ title, facts }: { title: string; facts: PageFact[] }) {
    return (
        <PageHeaderEvidenceAction
            subject={{
                title,
                content: (
                    <EvidenceFactList aria-label={title} testId="page-evidence-facts">
                        {facts.map((fact, index) => (
                            <EvidenceFact
                                key={`${fact.label}-${index}`}
                                label={fact.label}
                                value={fact.value}
                            />
                        ))}
                    </EvidenceFactList>
                ),
            }}
        />
    );
}

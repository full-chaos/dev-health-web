"use client";

import { ArrowRight } from "lucide-react";

import {
    useEvidenceDrawer,
    type EvidenceRequestSubject,
} from "@/components/evidence/EvidenceDrawerProvider";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type MetricEvidenceButtonProps = {
    /** The metric the section is about. Plain values, so a server page can pass it. */
    subject: EvidenceRequestSubject;
    /** The section the button belongs to. It tells two "Evidence" buttons on one page apart. */
    section: string;
};

/**
 * The "Evidence" action of a section head (approved prototype
 * `btn('Evidence', 'openEvidence()', 'ghost small', 'arrow')`): a small ghost button that opens
 * the ONE shared "Evidence & Context" drawer for the section's metric.
 */
export function MetricEvidenceButton({ subject, section }: MetricEvidenceButtonProps) {
    const evidence = useEvidenceDrawer();

    return (
        <Button
            variant="ghost"
            size="sm"
            icon={<ArrowRight />}
            aria-label={`${CTA_LABELS.evidence}: ${section}`}
            data-testid="section-evidence-button"
            onClick={() => evidence.open(subject)}
        >
            {CTA_LABELS.evidence}
        </Button>
    );
}

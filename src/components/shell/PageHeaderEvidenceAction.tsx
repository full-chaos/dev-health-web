"use client";

import { FileText } from "lucide-react";

import {
    useEvidenceDrawer,
    type EvidenceSubject,
} from "@/components/evidence/EvidenceDrawerProvider";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type PageHeaderEvidenceActionProps = {
    /** What the page's evidence is about. Plain values, so a server page can pass it. */
    subject: EvidenceSubject;
};

/**
 * The "View evidence" action of a page header (`PageHeader` `actions` slot). It opens the one
 * shared "Evidence & Context" drawer for the page subject. Each page defines its own subject.
 */
export function PageHeaderEvidenceAction({ subject }: PageHeaderEvidenceActionProps) {
    const evidence = useEvidenceDrawer();

    return (
        <Button
            variant="ghost"
            data-testid="page-header-view-evidence"
            onClick={() => evidence.open(subject)}
        >
            <FileText aria-hidden="true" className="h-4 w-4" />
            {CTA_LABELS.viewEvidence}
        </Button>
    );
}

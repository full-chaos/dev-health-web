"use client";

import { FileText } from "lucide-react";

import {
    useEvidenceDrawer,
    type EvidenceSubject,
} from "@/components/evidence/EvidenceDrawerProvider";
import { CTA_LABELS } from "@/lib/design/cta";

type PageHeaderEvidenceActionProps = {
    /** What the page's evidence is about. Plain values, so a server page can pass it. */
    subject: EvidenceSubject;
};

/**
 * The "View evidence" action of a page header (`PageHeader` `actions` slot). It opens the one
 * shared "Evidence & Context" drawer for the page subject. Each page defines its own subject.
 *
 * Look: the approved prototype's `btn('View evidence', …, 'ghost', 'report')` (`app.js:48`): a
 * document icon and the label in the action colour, no border, sentence case (`.btn` and
 * `.btn.ghost` in `style.css`; 13px, 6px radius, 35px high in `theme.css`). The classes are local
 * until the shared `Button` has this ghost look and an `icon` prop (CHAOS-8061); then this is
 * `<Button variant="ghost" icon={…}>`.
 */
export function PageHeaderEvidenceAction({ subject }: PageHeaderEvidenceActionProps) {
    const evidence = useEvidenceDrawer();

    return (
        <button
            type="button"
            data-testid="page-header-view-evidence"
            onClick={() => evidence.open(subject)}
            className="inline-flex min-h-8.75 items-center justify-center gap-1.75 whitespace-nowrap rounded-(--radius-sm) border border-transparent bg-transparent px-3.25 py-2 text-[0.8125rem] font-[550] text-(--accent-2) transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            <FileText aria-hidden="true" className="h-4 w-4" />
            {CTA_LABELS.viewEvidence}
        </button>
    );
}
